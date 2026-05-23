/**
 * POST /api/nutrition-insights
 *
 * On-demand only — the iOS client calls this when the user explicitly
 * taps "Generate insights" in the Nutrition tab. No auto-generation,
 * no per-render polling. Body contains today's meal totals + the last
 * 7 days of per-day totals; response is 3–5 specific, actionable
 * insights with concrete numbers from the data.
 *
 * Prompt prohibits generic advice ("eat more protein") — every insight
 * must reference a real number from the snapshot and propose a
 * concrete next step.
 */

import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import { geminiErrorJsonResponse } from "@/lib/gemini-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 22_000;

const SYSTEM_PROMPT = `You are a nutrition coach analyzing one user's eating data. Return 3–5 insights that are SPECIFIC and ACTIONABLE. Every insight must reference an actual number from the user's data (a gram count, calorie value, day count, or trend percentage) AND include a concrete next step the user can take. Do not output generic advice like "eat more protein" without naming a specific food or quantity that would close the gap.

Return JSON EXACTLY matching this shape:
{
  summary: string (one short sentence — how the user is doing right now),
  insights: [
    {
      kind: "protein_gap" | "calorie_gap" | "macro_balance" | "trend" | "timing" | "suggestion",
      title: string (5–8 words, concrete),
      detail: string (1–2 sentences, MUST cite a number from the data, MUST propose a specific action),
      severity: "info" | "actionable" | "concern"
    }
  ]
}

Severity guide:
- info: doing well; here's what's working
- actionable: a clear next step the user can take today
- concern: a pattern worth addressing (do not be alarmist)

If today's meals are empty, focus on the 7-day trend rather than complaining about no data.
If logged days < 4 of last 7, flag that data is sparse and skew toward "log more" rather than overinterpreting noise.

Return ONLY the JSON. No preamble. No markdown fences.`;

type Severity = "info" | "actionable" | "concern";
type Kind =
  | "protein_gap"
  | "calorie_gap"
  | "macro_balance"
  | "trend"
  | "timing"
  | "suggestion";

type Insight = {
  kind: Kind;
  title: string;
  detail: string;
  severity: Severity;
};

type Payload = {
  summary: string;
  insights: Insight[];
};

type Meal = {
  name: string;
  loggedAt: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type DayTotal = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
};

type Body = {
  today: {
    totals: { calories: number; protein: number; carbs: number; fat: number };
    meals: Meal[];
  };
  last7Days: DayTotal[];
  targets?: {
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  };
};

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function toSeverity(v: unknown): Severity {
  return v === "info" || v === "actionable" || v === "concern" ? v : "info";
}

const KINDS: Kind[] = [
  "protein_gap",
  "calorie_gap",
  "macro_balance",
  "trend",
  "timing",
  "suggestion",
];

function toKind(v: unknown): Kind {
  return KINDS.includes(v as Kind) ? (v as Kind) : "suggestion";
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
  const itemsRaw = Array.isArray(o.insights) ? o.insights : [];
  const insights: Insight[] = itemsRaw
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
        severity: toSeverity(i.severity),
      };
    })
    .filter((x): x is Insight => x !== null)
    .slice(0, 5);
  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    insights,
  };
}

function renderSnapshot(body: Body): string {
  const t = body.today.totals;
  const tg = body.targets ?? {};
  const last7 = body.last7Days;
  const loggedDays = last7.filter((d) => d.mealCount > 0).length;
  const sum = (k: keyof Pick<DayTotal, "calories" | "protein" | "carbs" | "fat">) =>
    last7.reduce((a, b) => a + b[k], 0);
  const avg = (k: keyof Pick<DayTotal, "calories" | "protein" | "carbs" | "fat">) =>
    last7.length ? Math.round(sum(k) / last7.length) : 0;

  const lines: string[] = ["USER DATA SNAPSHOT:", ""];
  lines.push(
    `Today: ${Math.round(t.calories)} kcal · ${Math.round(t.protein)}g protein · ${Math.round(t.carbs)}g carbs · ${Math.round(t.fat)}g fat (${body.today.meals.length} meals logged)`,
  );
  if (tg.calories || tg.protein || tg.carbs || tg.fat) {
    lines.push(
      `Targets: ${tg.calories ?? "—"} kcal · ${tg.protein ?? "—"}g protein · ${tg.carbs ?? "—"}g carbs · ${tg.fat ?? "—"}g fat`,
    );
  }
  lines.push("");
  if (body.today.meals.length) {
    lines.push("Today's meals (chronological):");
    for (const m of body.today.meals) {
      lines.push(
        `  - ${m.loggedAt} · ${m.name} · ${Math.round(m.calories)} kcal · ${Math.round(m.protein)}p/${Math.round(m.carbs)}c/${Math.round(m.fat)}f`,
      );
    }
    lines.push("");
  }
  lines.push(`Last 7 days (${loggedDays} of 7 days logged):`);
  lines.push(
    `  - Avg ${avg("calories")} kcal/day, ${avg("protein")}g protein, ${avg("carbs")}g carbs, ${avg("fat")}g fat`,
  );
  for (const d of last7) {
    if (d.mealCount > 0) {
      lines.push(
        `  - ${d.date}: ${Math.round(d.calories)} kcal · ${Math.round(d.protein)}p/${Math.round(d.carbs)}c/${Math.round(d.fat)}f (${d.mealCount} meals)`,
      );
    } else {
      lines.push(`  - ${d.date}: no meals logged`);
    }
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
  if (!body?.today?.totals || !Array.isArray(body.last7Days)) {
    return Response.json(
      { error: "bad-request", message: "Expected { today, last7Days, targets? }." },
      { status: 400 },
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const userMsg = renderSnapshot(body);
    const resp = (await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT + "\n\n" + userMsg }],
        },
      ],
      config: {
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
      },
    })) as unknown as {
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
    return geminiErrorJsonResponse(e, "nutrition_insights");
  }
}
