import { GoogleGenAI } from "@google/genai";
import {
  EVENING_PROMPT,
  PERSONA_SYSTEM,
  buildContextBlock,
} from "@/lib/prompts";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import type { OverseerContext } from "@/store/selectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { context: OverseerContext };

export async function POST(req: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) return new Response("missing-key", { status: 503 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: EVENING_PROMPT }] }],
      config: {
        systemInstruction:
          PERSONA_SYSTEM + "\n\n--- USER CONTEXT ---\n" + buildContextBlock(body.context),
        temperature: 0.7,
        maxOutputTokens: 320,
      },
    });
    const text =
      (res as { text?: string }).text ??
      (res as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        .candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";
    return new Response(text.trim(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gemini call failed";
    return new Response(msg, { status: 502 });
  }
}
