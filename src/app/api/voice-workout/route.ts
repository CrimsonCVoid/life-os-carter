import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey, GEMINI_KEY_NAMES } from "@/lib/gemini-key";
import { geminiErrorJsonResponse, withGeminiRetry } from "@/lib/gemini-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

export type ParsedSet = {
  exerciseName: string;
  matchedExisting: boolean;
  weight: number;
  reps: number;
  rpe?: number;
  utterance: string;
};

export type VoiceWorkoutSuccess = { ok: true; parsed: ParsedSet[] };

type RequestBody = {
  audioBase64: string;
  mimeType: string;
  knownExercises: string[];
};

function buildPrompt(knownExercises: string[]): string {
  return `You transcribe a gym user's spoken set log. The user may speak naturally, e.g. "ten reps at one eighty-five for bench press" or "I just did 8 of 225 squats RPE 8" or "three sets of bench at 185 by 8".

Return a JSON object: { "sets": [ { "exerciseName": "Bench press", "weight": 185, "reps": 10, "rpe": 8, "utterance": "ten reps at 185 for bench press" } ] }

Rules:
- Always normalize the exercise name to title case ("Bench press", "Back squat").
- Match exerciseName to one of the KNOWN EXERCISES below if any name is close. If the user says "bench" and "Bench press" is in known, use "Bench press" exactly.
- weight is in pounds, integer or 0 for bodyweight. If the user says "kilos" or "kg", convert to pounds (× 2.20462) rounded to nearest 5.
- reps integer.
- rpe optional, 1-10.
- If the user logs N identical sets ("three sets of 8 at 185"), emit N separate set entries.
- utterance is the natural-language slice for that one set.
- ONLY return valid JSON, no markdown.

KNOWN EXERCISES: ${knownExercises.join(", ") || "(none yet)"}`;
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

function validateSets(raw: unknown, knownExercises: string[]): ParsedSet[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  const list = Array.isArray(root.sets) ? root.sets : [];
  const knownSet = new Set(knownExercises.map(normalizeName));

  const out: ParsedSet[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;

    const name = typeof it.exerciseName === "string" ? it.exerciseName.trim() : "";
    if (!name) continue;

    const weight = typeof it.weight === "number" ? it.weight : Number(it.weight);
    if (!Number.isFinite(weight) || weight < 0) continue;

    const repsRaw = typeof it.reps === "number" ? it.reps : Number(it.reps);
    if (!Number.isFinite(repsRaw)) continue;
    const reps = Math.round(repsRaw);
    if (reps <= 0) continue;

    let rpe: number | undefined;
    if (it.rpe != null) {
      const r = typeof it.rpe === "number" ? it.rpe : Number(it.rpe);
      if (Number.isFinite(r)) {
        rpe = Math.max(1, Math.min(10, Math.round(r * 2) / 2));
      }
    }

    const utterance = typeof it.utterance === "string" ? it.utterance.trim() : "";

    out.push({
      exerciseName: name,
      matchedExisting: knownSet.has(normalizeName(name)),
      weight: Math.round(weight),
      reps,
      rpe,
      utterance,
    });
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
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

  let body: RequestBody;
  try {
    const json = (await req.json()) as unknown;
    if (!json || typeof json !== "object") throw new Error("not-object");
    const j = json as Record<string, unknown>;
    if (typeof j.audioBase64 !== "string" || !j.audioBase64) {
      throw new Error("missing audioBase64");
    }
    if (typeof j.mimeType !== "string" || !j.mimeType) {
      throw new Error("missing mimeType");
    }
    const known = Array.isArray(j.knownExercises)
      ? j.knownExercises.filter((x): x is string => typeof x === "string")
      : [];
    body = {
      audioBase64: j.audioBase64,
      mimeType: j.mimeType.split(";")[0].trim(),
      knownExercises: known,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad-request";
    return Response.json(
      { error: "bad-request", message: `Invalid request: ${msg}` },
      { status: 400 }
    );
  }

  let audioBuf: Buffer;
  try {
    audioBuf = Buffer.from(body.audioBase64, "base64");
  } catch {
    return Response.json(
      { error: "bad-request", message: "Couldn't decode audio." },
      { status: 400 }
    );
  }
  if (audioBuf.length === 0) {
    return Response.json(
      { error: "bad-request", message: "Audio is empty." },
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
            { text: buildPrompt(body.knownExercises) },
            {
              inlineData: {
                mimeType: body.mimeType,
                data: audioBuf.toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
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
    console.error("[voice-workout] gemini call failed", err);
    return geminiErrorJsonResponse(err, "voice_workout");
  } finally {
    clearTimeout(timer);
  }

  const cleaned = stripFences(rawText);
  let parsedJson = tryParseJson(cleaned);
  if (!parsedJson) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsedJson = tryParseJson(m[0]);
  }
  if (!parsedJson) {
    return Response.json(
      { error: "bad-output", message: "Couldn't parse model output." },
      { status: 502 }
    );
  }

  const parsed = validateSets(parsedJson, body.knownExercises);
  return Response.json(
    { ok: true, parsed } satisfies VoiceWorkoutSuccess,
    { status: 200 }
  );
}
