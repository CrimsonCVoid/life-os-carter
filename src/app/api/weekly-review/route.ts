import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey, GEMINI_KEY_NAMES } from "@/lib/gemini-key";
import { geminiErrorJsonResponse, withGeminiRetry } from "@/lib/gemini-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You generate an honest weekly review from 7 days of personal-tracking data. Return a JSON object EXACTLY matching this shape:
{
  summary: string (one sentence capturing the week — specific, no fluff),
  wins: string[] (3-5 bullets, REAL — only from the data: completed goals, PRs, streaks, target days),
  struggles: string[] (2-3 honest callouts: missed days, low completion rates, mood dips. NEVER invent.),
  trends: string[] (data-backed observations with numbers — "mood averaged 6.4, down from 7.1 last week"; "evening routine done 5/7 days correlated with sleep > 7h"),
  nextWeekPriorities: string[] (3 specific things to focus on, derived from the struggles + trends)
}

Rules:
- Honest. No generic "great job!" energy. No filler.
- Reference specific days of the week, numbers, dates.
- Wins must be real — pulled from the data. If wins are thin, say so (e.g. "Quiet week — mostly maintenance.").
- Struggles must be real — only what the data shows. Empty array if there's nothing concrete to flag.
- Trends should be data-backed correlations or trajectories, not vibes.
- nextWeekPriorities are 3 short imperative phrases ("Hit protein target Sat + Sun", "Get evening routine ≥5/7 days").

Return ONLY the JSON. No preamble. No markdown fences.`;

type Body = {
  context: unknown;
};

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

type ReviewPayload = {
  summary: string;
  wins: string[];
  struggles: string[];
  trends: string[];
  nextWeekPriorities: string[];
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePayload(raw: string): ReviewPayload | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let obj = tryParse(raw) ?? tryParse(stripFences(raw));
  if (!obj) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) obj = tryParse(m[0]);
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    wins: asStringArray(o.wins),
    struggles: asStringArray(o.struggles),
    trends: asStringArray(o.trends),
    nextWeekPriorities: asStringArray(o.nextWeekPriorities),
  };
}

export async function POST(req: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error: "missing-key",
        message: `No Gemini API key found. Set one of: ${GEMINI_KEY_NAMES.join(
          ", "
        )}.`,
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json(
      { error: "bad-request", message: "Invalid JSON." },
      { status: 400 }
    );
  }
  if (!body?.context) {
    return Response.json(
      { error: "bad-request", message: "Missing context." },
      { status: 400 }
    );
  }

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
            { text: SYSTEM_PROMPT + "\n\n" + JSON.stringify(body.context) },
          ],
        },
      ],
      config: {
        temperature: 0.55,
        maxOutputTokens: 1536,
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
    console.error("[weekly-review] gemini call failed", err);
    return geminiErrorJsonResponse(err, "weekly_review");
  } finally {
    clearTimeout(timer);
  }

  const parsed = parsePayload(rawText);
  if (!parsed) {
    return Response.json(
      { error: "bad-output", message: "Could not parse model output." },
      { status: 502 }
    );
  }
  return Response.json(parsed, { status: 200 });
}
