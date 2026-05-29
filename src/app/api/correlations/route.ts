/**
 * POST /api/correlations
 *
 * On-demand only — the iOS Analysis tab calls this when the user taps
 * "Find correlations". Body is a 30-day snapshot of daily metrics
 * (sleep, mood, energy, HRV, RHR, steps), behavioral journal flags
 * (alcohol, caffeine after 2pm, late eating, screens before bed,
 * stress level), and a count summary of workouts + meals per day.
 *
 * Returns 3–5 behavioral correlations of the form:
 *   "your sleep is 28% better on no-alcohol days"
 *   "your HRV runs 12% lower the day after late eating"
 *   "your mood averages +1.4 on days you trained"
 *
 * Prompt requires every correlation to cite the actual effect size,
 * the sample count behind it, and a confidence qualifier — no
 * unsupported "you should..." advice.
 */

import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import { geminiErrorJsonResponse, withGeminiRetry } from "@/lib/gemini-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 24_000;

const SYSTEM_PROMPT = `You are an evidence-led behavioral analyst looking at one user's 30-day daily log. Your job: surface 3–5 BEHAVIORAL CORRELATIONS between things the user does (alcohol, caffeine timing, late eating, screen time before bed, stress, exercise) and how they feel/perform (sleep hours, HRV, RHR, mood, energy).

For each correlation:
- Cite the effect size as a percentage or absolute delta ("sleep is 14% better", "mood averages +1.2", "HRV runs 8 ms lower")
- Cite the sample sizes that produced it ("N=6 alcohol days vs N=18 dry days")
- Include a confidence qualifier — "strong", "modest", or "noisy" based on sample sizes and consistency
- Flag direction explicitly: "positive" (the behavior helps the outcome), "negative" (the behavior hurts it), or "neutral" (no clear link)

If a comparison has fewer than 3 days on either side, mark it "low_confidence" and DO NOT report a number — say "not enough data" instead. Never invent statistics.

Return JSON EXACTLY matching this shape:
{
  summary: string (one short sentence framing the biggest finding),
  correlations: [
    {
      kind: "sleep_vs_alcohol" | "sleep_vs_late_eating" | "sleep_vs_screens" | "hrv_vs_alcohol" | "hrv_vs_stress" | "mood_vs_workout" | "mood_vs_sleep" | "energy_vs_caffeine" | "rhr_vs_alcohol" | "other",
      title: string (5–9 words, plain English),
      detail: string (1–2 sentences citing effect size + sample sizes),
      direction: "positive" | "negative" | "neutral",
      confidence: "strong" | "modest" | "low_confidence"
    }
  ]
}

Pick the most useful correlations from the user's data — not every kind has to be filled. If the data is sparse overall (fewer than 14 logged days), return ONE correlation that says "more data needed" instead of fabricating findings.

Return ONLY the JSON. No preamble. No markdown fences.`;

type Direction = "positive" | "negative" | "neutral";
type Confidence = "strong" | "modest" | "low_confidence";
type Kind =
  | "sleep_vs_alcohol"
  | "sleep_vs_late_eating"
  | "sleep_vs_screens"
  | "hrv_vs_alcohol"
  | "hrv_vs_stress"
  | "mood_vs_workout"
  | "mood_vs_sleep"
  | "energy_vs_caffeine"
  | "rhr_vs_alcohol"
  | "other";

const KINDS: Kind[] = [
  "sleep_vs_alcohol",
  "sleep_vs_late_eating",
  "sleep_vs_screens",
  "hrv_vs_alcohol",
  "hrv_vs_stress",
  "mood_vs_workout",
  "mood_vs_sleep",
  "energy_vs_caffeine",
  "rhr_vs_alcohol",
  "other",
];

type Correlation = {
  kind: Kind;
  title: string;
  detail: string;
  direction: Direction;
  confidence: Confidence;
};

type Payload = {
  summary: string;
  correlations: Correlation[];
};

type DayInput = {
  date: string;
  sleepHours?: number | null;
  mood?: number | null;
  energy?: number | null;
  hrvMs?: number | null;
  restingHr?: number | null;
  steps?: number | null;
  weightLb?: number | null;
  alcoholYesterday?: boolean;
  caffeineAfter2pm?: boolean;
  lateEating?: boolean;
  screenBeforeBed?: boolean;
  stressLevel?: number | null;
  workoutCount?: number;
  totalVolumeLb?: number;
  mealCount?: number;
};

type Body = { days: DayInput[] };

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function toDirection(v: unknown): Direction {
  return v === "positive" || v === "negative" || v === "neutral" ? v : "neutral";
}

function toConfidence(v: unknown): Confidence {
  return v === "strong" || v === "modest" || v === "low_confidence"
    ? v
    : "low_confidence";
}

function toKind(v: unknown): Kind {
  return KINDS.includes(v as Kind) ? (v as Kind) : "other";
}

function parsePayload(raw: string): Payload | null {
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
  const arr = Array.isArray(o.correlations) ? o.correlations : [];
  const correlations: Correlation[] = arr
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const i = it as Record<string, unknown>;
      const title = typeof i.title === "string" ? i.title.trim() : "";
      const detail = typeof i.detail === "string" ? i.detail.trim() : "";
      if (!title || !detail) return null;
      return {
        kind: toKind(i.kind),
        title,
        detail,
        direction: toDirection(i.direction),
        confidence: toConfidence(i.confidence),
      };
    })
    .filter((x): x is Correlation => x !== null)
    .slice(0, 5);
  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    correlations,
  };
}

function renderSnapshot(body: Body): string {
  const days = body.days;
  const logged = days.filter(
    (d) =>
      d.sleepHours != null ||
      d.mood != null ||
      d.energy != null ||
      d.hrvMs != null ||
      d.restingHr != null,
  );
  const lines: string[] = ["USER DAILY LOG (30-DAY WINDOW):", ""];
  lines.push(
    `Total days in window: ${days.length} · days with any metric logged: ${logged.length}`,
  );
  lines.push("");
  lines.push("Per-day data (oldest first):");
  for (const d of days) {
    const flags: string[] = [];
    if (d.alcoholYesterday) flags.push("alcohol");
    if (d.caffeineAfter2pm) flags.push("caffeine_late");
    if (d.lateEating) flags.push("late_eating");
    if (d.screenBeforeBed) flags.push("screens_before_bed");
    if (d.stressLevel != null) flags.push(`stress=${d.stressLevel}/5`);
    if (d.workoutCount && d.workoutCount > 0) flags.push(`workout=${d.workoutCount}`);

    const metrics: string[] = [];
    if (d.sleepHours != null) metrics.push(`sleep=${d.sleepHours.toFixed(1)}h`);
    if (d.mood != null) metrics.push(`mood=${d.mood}/10`);
    if (d.energy != null) metrics.push(`energy=${d.energy}/10`);
    if (d.hrvMs != null) metrics.push(`hrv=${Math.round(d.hrvMs)}ms`);
    if (d.restingHr != null) metrics.push(`rhr=${Math.round(d.restingHr)}bpm`);
    if (d.steps != null) metrics.push(`steps=${d.steps}`);

    const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
    const metricStr = metrics.length ? ` ${metrics.join(" · ")}` : " (no metrics)";
    lines.push(`  ${d.date}:${metricStr}${flagStr}`);
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "missing-api-key", message: "GEMINI_API_KEY not configured." },
      { status: 500 },
    );
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json(
      { error: "bad-request", message: "Invalid JSON body." },
      { status: 400 },
    );
  }
  if (!body?.days || !Array.isArray(body.days)) {
    return Response.json(
      { error: "bad-request", message: "Expected { days: DayInput[] }." },
      { status: 400 },
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const userMsg = renderSnapshot(body);
    const resp = (await withGeminiRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT + "\n\n" + userMsg }],
        },
      ],
      config: {
        temperature: 0.35,
        maxOutputTokens: 1280,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
      },
    }))) as unknown as {
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    clearTimeout(timer);
    let text = resp.text ?? "";
    if (!text) {
      const parts = resp.candidates?.[0]?.content?.parts;
      text = parts?.map((p) => p.text ?? "").join("") ?? "";
    }
    const payload = parsePayload(text);
    if (!payload) {
      return Response.json(
        {
          error: "parse-error",
          message: "Gemini returned malformed JSON.",
          raw: text.slice(0, 500),
        },
        { status: 502 },
      );
    }
    return Response.json(payload);
  } catch (e) {
    clearTimeout(timer);
    return geminiErrorJsonResponse(e, "correlations");
  }
}
