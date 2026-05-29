import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey, GEMINI_KEY_NAMES } from "@/lib/gemini-key";
import { geminiErrorJsonResponse, withGeminiRetry } from "@/lib/gemini-error";
import { fingerprintHeadline } from "@/lib/insights";
import type { PatternInsight, PatternTone } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You analyze a user's last-30-days personal-tracking data and return 0-3 noteworthy patterns. Return a JSON object EXACTLY matching this shape:
{
  patterns: [
    {
      headline: string (one short, specific sentence — reference real days, numbers, or correlations; e.g. "Your mood drops on days you skip morning sunlight" or "Protein was 40% under target on weekends"),
      metric: string (optional — one of: calories, protein, carbs, fat, water, sleep, mood, energy, weight, steps),
      dataPoint: string (optional — short inline value, e.g. "6.4 avg", "3 of 7 days"),
      tone: "positive" | "neutral" | "nudge"
    }
  ]
}

Rules:
- Be SPECIFIC. Reference actual days of the week, numbers, correlations across categories. "You PR'd squat twice this month" beats "great progress".
- Only surface real signal. If the data doesn't support a clear insight, return an empty array. NEVER invent.
- Mix positive observations, neutral observations, and gentle nudges. Don't make every pattern a warning.
- Skip any headline that matches a recentlyDismissedFingerprints entry (you'll get those in the user message).
- Don't repeat a headline if a very-similar one is in dismissed list.
- Empty patterns array is a valid, honest response.

Return ONLY the JSON. No preamble. No markdown fences.`;

type Body = {
  context: unknown;
  recentlyDismissedFingerprints: string[];
};

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function toTone(v: unknown): PatternTone {
  if (v === "positive" || v === "nudge" || v === "neutral") return v;
  return "neutral";
}

function parsePayload(raw: string): PatternInsight[] | null {
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
  const arr = Array.isArray(o.patterns) ? o.patterns : [];
  return arr
    .map((it): PatternInsight | null => {
      if (!it || typeof it !== "object") return null;
      const i = it as Record<string, unknown>;
      const headline =
        typeof i.headline === "string" ? i.headline.trim() : "";
      if (!headline) return null;
      return {
        headline,
        fingerprint: fingerprintHeadline(headline),
        metric: typeof i.metric === "string" ? i.metric.trim() : undefined,
        dataPoint:
          typeof i.dataPoint === "string" ? i.dataPoint.trim() : undefined,
        tone: toTone(i.tone),
      };
    })
    .filter((x): x is PatternInsight => x !== null)
    .slice(0, 3);
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

  const userMessage = JSON.stringify({
    last30Days: body.context,
    recentlyDismissedFingerprints:
      body.recentlyDismissedFingerprints ?? [],
  });

  let rawText = "";
  try {
    const result = (await withGeminiRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT + "\n\n" + userMessage }],
        },
      ],
      config: {
        temperature: 0.5,
        maxOutputTokens: 1024,
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
    console.error("[patterns] gemini call failed", err);
    return geminiErrorJsonResponse(err, "patterns");
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

  // Filter against dismissed fingerprints (defense-in-depth — also told the model)
  const dismissed = new Set(body.recentlyDismissedFingerprints ?? []);
  const filtered = parsed.filter((p) => !dismissed.has(p.fingerprint));

  return Response.json({ patterns: filtered }, { status: 200 });
}
