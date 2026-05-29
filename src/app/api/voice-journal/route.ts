import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey, GEMINI_KEY_NAMES } from "@/lib/gemini-key";
import { geminiErrorJsonResponse, withGeminiRetry } from "@/lib/gemini-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are processing a voice journal entry. The audio is a personal reflection from the user. Return a JSON object EXACTLY matching this shape:
{
  transcript: full transcription, cleaned for readability (fix obvious mishearings, add basic punctuation, preserve the user's voice and slang),
  summary: 1-3 sentences capturing key themes and emotional tone,
  mood: single lowercase word for dominant emotional tone (e.g. energetic, tired, anxious, content, frustrated, excited, reflective, sad, motivated),
  moodScore: integer 1-10 (1=very negative, 10=very positive),
  todos: array of clearly stated tasks or intents. Each: { text: string, priority: 'P1'|'P2'|'P3' }. Be conservative — extract only clear intent ('call mom', 'finish the report'). Skip vague aspirations ('maybe work out more'). Empty array is fine.
  tags: 1-4 short lowercase tags categorizing the entry (e.g. 'work', 'relationships', 'fitness', 'mental-health'). Empty array is fine.
}
Return ONLY the JSON. No preamble. No markdown fences.`;

type Priority = "P1" | "P2" | "P3";
type VoiceTodo = { text: string; priority: Priority };
export type VoiceJournalPayload = {
  transcript: string;
  summary: string;
  mood: string;
  moodScore: number;
  todos: VoiceTodo[];
  tags: string[];
};

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(10, Math.round(v)));
}

function parsePayload(raw: string): VoiceJournalPayload | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let obj = tryParse(raw) ?? tryParse(stripFences(raw));
  if (!obj) {
    // last-ditch: extract first {...} block
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) obj = tryParse(m[0]);
  }
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  if (typeof o.transcript !== "string") return null;

  const todosRaw = Array.isArray(o.todos) ? o.todos : [];
  const todos: VoiceTodo[] = todosRaw
    .map((t) => {
      if (!t || typeof t !== "object") return null;
      const tt = t as Record<string, unknown>;
      const text = typeof tt.text === "string" ? tt.text.trim() : "";
      if (!text) return null;
      const pri = tt.priority === "P1" || tt.priority === "P2" || tt.priority === "P3"
        ? (tt.priority as Priority)
        : "P2";
      return { text, priority: pri };
    })
    .filter((x): x is VoiceTodo => x !== null);

  const tagsRaw = Array.isArray(o.tags) ? o.tags : [];
  const tags: string[] = tagsRaw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 4);

  return {
    transcript: o.transcript.trim(),
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    mood: typeof o.mood === "string" ? o.mood.trim().toLowerCase() : "",
    moodScore: clampScore(o.moodScore),
    todos,
    tags,
  };
}

export async function POST(req: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error: "missing-key",
        message: `No Gemini API key found. Set one of: ${GEMINI_KEY_NAMES.join(", ")} in your Vercel env (Production + Preview) and redeploy.`,
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "bad-request", message: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "bad-request", message: "Missing audio file." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "bad-request", message: "Audio is empty." }, { status: 400 });
  }

  const mimeType = (file.type && file.type.length > 0 ? file.type : "audio/webm")
    .split(";")[0]
    .trim();

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  const ai = new GoogleGenAI({ apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawText = "";
  try {
    const result = (await withGeminiRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      config: {
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
      },
    }))) as unknown as {
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    rawText = result.text ?? "";
    if (!rawText) {
      const parts = result.candidates?.[0]?.content?.parts;
      rawText = parts?.map((p) => p.text ?? "").join("") ?? "";
    }
  } catch (err) {
    clearTimeout(timer);
    console.error("[voice-journal] gemini call failed", err);
    return geminiErrorJsonResponse(err, "voice_journal");
  } finally {
    clearTimeout(timer);
  }

  const parsed = parsePayload(rawText);
  if (!parsed) {
    // Salvage: if we have any non-empty rawText, return it as transcript only.
    const fallback = stripFences(rawText).trim();
    if (fallback) {
      return Response.json(
        {
          transcript: fallback,
          summary: "",
          mood: "",
          moodScore: 5,
          todos: [],
          tags: [],
          partial: true,
        } satisfies VoiceJournalPayload & { partial: true },
        { status: 200 }
      );
    }
    return Response.json(
      { error: "bad-output", message: "Could not parse model output." },
      { status: 502 }
    );
  }

  return Response.json(parsed, { status: 200 });
}
