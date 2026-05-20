/**
 * Proactive Overseer — daily briefing cron.
 *
 * Triggered by Vercel Cron (see vercel.json). For each user with at least
 * one push subscription:
 *  1. Read their cloud snapshot state (the same blob the client pushes).
 *  2. Slice the last 30 days of health/mood/sleep/water/weight/steps,
 *     last 14 journal entries, last 5 body measurements / progress photos.
 *  3. Hand to Gemini with a "what should I notice today?" system prompt.
 *  4. Persist the structured briefing.
 *  5. Send a single push notification with the headline.
 *
 * Auth: Vercel signs cron requests with the CRON_SECRET env var in the
 * Authorization header. We reject anything else so the URL isn't public.
 */

import { GoogleGenAI } from "@google/genai";
import { query } from "@/lib/db/client";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You write a single short daily briefing for a personal life-tracking app. Input: 30 days of the user's health data, mood, sleep, water, weight, steps, gym sessions, meals, journal entries, body composition progress.

Return a JSON object EXACTLY matching:
{
  headline: ONE concise sentence (≤90 chars). Reference a SPECIFIC pattern or number — never generic encouragement.
  observations: array of 1-3 short bullet-style strings, each one specific observation grounded in the data. Each ≤ 100 chars.
  push_body: ONE short notification body (≤120 chars) — same content as headline but optimized for a lock-screen glance.
}

Rules:
- Be SPECIFIC. Use real day-of-week patterns, real numbers, real correlations.
- "Sleep avg dropped 22min over the last 7d" beats "Try to sleep more".
- "You PR'd squat 3 times this month" beats "Great gym work".
- Pull from across categories — best signal is often a correlation.
- DO NOT give advice or be moralistic. Just observations.
- DO NOT invent numbers. If a metric has <5 data points, ignore it.
- If the data is sparse / no clear pattern, return a positive but honest headline like "5-day journaling streak going strong."

Return ONLY the JSON. No preamble. No markdown fences.`;

type Snapshot = {
  state: Record<string, unknown> | null;
};

type Briefing = {
  headline: string;
  observations: string[];
  push_body: string;
};

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function parseBriefing(raw: string): Briefing | null {
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
  const headline = typeof o.headline === "string" ? o.headline.trim() : "";
  if (!headline) return null;
  const obs = Array.isArray(o.observations)
    ? o.observations.filter((x): x is string => typeof x === "string").slice(0, 3)
    : [];
  const push_body =
    typeof o.push_body === "string" && o.push_body.trim() ? o.push_body.trim() : headline;
  return { headline, observations: obs, push_body };
}

/** Slice the user state to the last N days of each time-series slice. */
function sliceContext(state: Record<string, unknown>): Record<string, unknown> {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const sliceByDate = (obj: unknown): Record<string, unknown> => {
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k >= cutoffStr) out[k] = v;
    }
    return out;
  };

  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const recentArr = (x: unknown, n: number) =>
    arr(x)
      .slice()
      .sort((a: unknown, b: unknown) => {
        const ad = String((a as { date?: string }).date ?? (a as { createdAt?: string }).createdAt ?? "");
        const bd = String((b as { date?: string }).date ?? (b as { createdAt?: string }).createdAt ?? "");
        return bd.localeCompare(ad);
      })
      .slice(0, n);

  return {
    days: sliceByDate(state.days),
    health: sliceByDate(state.health),
    energy: sliceByDate(state.energy),
    journal: recentArr(state.journal, 14),
    meals: recentArr(state.meals, 30),
    body: recentArr(state.body, 8),
    workouts: recentArr(state.workouts, 15),
    liftSessions: recentArr(state.liftSessions, 10),
    goals: arr(state.goals).slice(0, 20),
    habits: arr(state.habits).slice(0, 20),
    recurringGoals: arr(state.recurringGoals).slice(0, 10),
    settings: (state.settings as Record<string, unknown>) ?? {},
  };
}

async function generateForUser(userId: string): Promise<Briefing | null> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    console.warn("[cron/daily-briefing] no Gemini key");
    return null;
  }

  const snap = await query<Snapshot>(
    "SELECT state FROM user_state_snapshots WHERE user_id = $1",
    [userId]
  );
  const raw = snap[0]?.state;
  if (!raw) return null;
  // Snapshot might be stored as the persist envelope `{state, version}` due
  // to a historical pushNow bug. Unwrap if so.
  const innerCandidate = (raw as { state?: unknown }).state;
  const state =
    innerCandidate && typeof innerCandidate === "object" && "settings" in (innerCandidate as object)
      ? (innerCandidate as Record<string, unknown>)
      : raw;

  const context = sliceContext(state);
  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toISOString().slice(0, 10);

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: "user",
        parts: [
          {
            text:
              `Today is ${today}. Here's the user's last 30 days:\n\n` +
              JSON.stringify(context, null, 2),
          },
        ],
      },
    ],
    config: {
      temperature: 0.4,
      maxOutputTokens: 700,
      responseMimeType: "application/json",
    },
  });

  const text = result.text ?? "";
  const parsed = parseBriefing(text);
  if (!parsed) {
    console.warn("[cron/daily-briefing] parse failed", { sample: text.slice(0, 200) });
    return null;
  }
  return parsed;
}

async function runForUser(userId: string): Promise<{ userId: string; ok: boolean; reason?: string }> {
  try {
    const briefing = await generateForUser(userId);
    if (!briefing) return { userId, ok: false, reason: "no-briefing" };

    const today = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO daily_briefings (user_id, date, headline, observations, model, generated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, now())
         ON CONFLICT (user_id, date) DO UPDATE
           SET headline     = EXCLUDED.headline,
               observations = EXCLUDED.observations,
               model        = EXCLUDED.model,
               generated_at = now()`,
      [userId, today, briefing.headline, JSON.stringify(briefing.observations), MODEL]
    );

    const pushed = await sendPushToUser(userId, {
      title: "Today's briefing",
      body: briefing.push_body,
      url: "/",
      tag: `briefing-${today}`,
    });

    await query(
      "UPDATE daily_briefings SET pushed_at = now() WHERE user_id = $1 AND date = $2",
      [userId, today]
    );

    return { userId, ok: true, ...pushed };
  } catch (err) {
    return { userId, ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

async function authorize(req: Request): Promise<boolean> {
  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. The settings
  // "Send test briefing" button passes the same secret via the same header,
  // so /api/cron/daily-briefing serves both purposes.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Find every user with at least one push subscription.
  const users = await query<{ user_id: string }>(
    "SELECT DISTINCT user_id::text FROM push_subscriptions"
  );

  const results = await Promise.all(users.map((u) => runForUser(u.user_id)));
  return Response.json({ count: results.length, results });
}

export const POST = GET;
