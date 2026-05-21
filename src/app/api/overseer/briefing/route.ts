import { GoogleGenAI } from "@google/genai";
import {
  BRIEFING_PROMPT,
  PERSONA_SYSTEM,
  buildContextBlock,
} from "@/lib/prompts";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import {
  geminiErrorPlainResponse,
  withGeminiRetry,
} from "@/lib/gemini-error";
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
    const res = await withGeminiRetry(() =>
      ai.models.generateContent({
        // flash-lite: 1000 RPD on the free tier vs flash's 20. Briefing
        // prose is low-stakes and well within lite's capability.
        model: "gemini-2.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [{ text: BRIEFING_PROMPT }],
          },
        ],
        config: {
          systemInstruction:
            PERSONA_SYSTEM +
            "\n\n--- USER CONTEXT ---\n" +
            buildContextBlock(body.context),
          temperature: 0.6,
          maxOutputTokens: 256,
        },
      })
    );
    const text =
      (res as { text?: string }).text ??
      (res as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        .candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";
    return new Response(text.trim(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[briefing] gemini call failed", err);
    return geminiErrorPlainResponse(err, "briefing");
  }
}
