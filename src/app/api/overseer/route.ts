import { GoogleGenAI } from "@google/genai";
import { PERSONA_SYSTEM, buildContextBlock } from "@/lib/prompts";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import type { OverseerContext } from "@/store/selectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Body = {
  messages: ChatMessage[];
  context: OverseerContext;
};

type StreamChunk = {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

const MODEL = "gemini-2.5-flash";

function extractText(chunk: StreamChunk): string {
  if (typeof chunk.text === "string" && chunk.text.length > 0) {
    return chunk.text;
  }
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts) return "";
  return parts.map((p) => p.text ?? "").join("");
}

export async function POST(req: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return new Response("missing-key", { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body?.messages?.length) {
    return new Response("No messages", { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction =
    PERSONA_SYSTEM + "\n\n--- USER CONTEXT ---\n" + buildContextBlock(body.context);

  const contents = body.messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  let stream: AsyncIterable<StreamChunk>;
  try {
    stream = (await ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    })) as unknown as AsyncIterable<StreamChunk>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gemini call failed";
    return new Response(msg, { status: 502 });
  }

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = extractText(chunk);
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`\n[stream error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(out, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
