/**
 * POST /api/voice-meal
 *
 * Multipart upload with field `audio` containing a short voice
 * description of a meal (e.g. "I just had a bowl of oatmeal with a
 * banana and a tablespoon of peanut butter"). Gemini transcribes +
 * parses into the same `FoodPhotoPayload` shape `/api/food-photo`
 * returns, so the iOS pre-fill code paths reuse one DTO.
 */

import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import { geminiErrorJsonResponse } from "@/lib/gemini-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are analyzing a voice description of a meal. Transcribe the audio, then estimate nutritional information for what the user describes eating. Return a JSON object EXACTLY matching this shape:
{
  isFood: boolean (false if audio clearly doesn't describe food),
  suggestedMealName: string (concise, e.g. 'Oatmeal with banana and peanut butter'),
  overallConfidence: 'high' | 'medium' | 'low',
  identifiedItems: [
    {
      name: string,
      estimatedGrams: number,
      calories: number,
      proteinG: number,
      carbsG: number,
      fatG: number
    }
  ],
  totals: { calories: number, proteinG: number, carbsG: number, fatG: number },
  notes: string (one short paragraph flagging uncertainty — 'no quantities given, assumed standard portions'. Empty if no caveats.)
}

When the user doesn't give quantities, assume standard serving sizes ('a bowl of oatmeal' = 1 cup cooked, 'a banana' = 1 medium, 'a tablespoon of peanut butter' = 16g). Reflect that assumption in notes and rate confidence medium. If the audio doesn't describe food at all, set isFood=false and zero totals.

Return ONLY the JSON. No preamble. No markdown fences.`;

type Confidence = "high" | "medium" | "low";
type Item = {
  name: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};
type Payload = {
  isFood: boolean;
  suggestedMealName: string;
  overallConfidence: Confidence;
  identifiedItems: Item[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  notes: string;
};

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function toConfidence(v: unknown): Confidence {
  return v === "high" || v === "medium" || v === "low" ? v : "medium";
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

  const itemsRaw = Array.isArray(o.identifiedItems) ? o.identifiedItems : [];
  const items: Item[] = itemsRaw
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const i = it as Record<string, unknown>;
      const name = typeof i.name === "string" ? i.name.trim() : "";
      if (!name) return null;
      return {
        name,
        estimatedGrams: toNum(i.estimatedGrams),
        calories: toNum(i.calories),
        proteinG: toNum(i.proteinG),
        carbsG: toNum(i.carbsG),
        fatG: toNum(i.fatG),
      };
    })
    .filter((x): x is Item => x !== null);

  const totalsRaw =
    o.totals && typeof o.totals === "object"
      ? (o.totals as Record<string, unknown>)
      : {};
  return {
    isFood: o.isFood !== false,
    suggestedMealName:
      typeof o.suggestedMealName === "string"
        ? o.suggestedMealName.trim()
        : "",
    overallConfidence: toConfidence(o.overallConfidence),
    identifiedItems: items,
    totals: {
      calories: toNum(totalsRaw.calories),
      proteinG: toNum(totalsRaw.proteinG),
      carbsG: toNum(totalsRaw.carbsG),
      fatG: toNum(totalsRaw.fatG),
    },
    notes: typeof o.notes === "string" ? o.notes.trim() : "",
  };
}

export async function POST(req: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "missing-api-key", message: "GEMINI_API_KEY not configured." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "bad-request", message: "Expected multipart/form-data." },
      { status: 400 },
    );
  }
  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return Response.json(
      { error: "bad-request", message: "Missing audio file." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return Response.json(
      { error: "bad-request", message: "Empty audio file." },
      { status: 400 },
    );
  }

  const mimeType =
    file.type && file.type.length > 0 ? file.type : "audio/m4a";
  const buf = Buffer.from(await file.arrayBuffer());

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = (await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { mimeType, data: buf.toString("base64") } },
          ],
        },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
      },
    })) as unknown as {
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    clearTimeout(t);
    let text = resp.text ?? "";
    if (!text) {
      const parts = resp.candidates?.[0]?.content?.parts;
      text = parts?.map((p) => p.text ?? "").join("") ?? "";
    }
    const payload = parsePayload(text);
    if (!payload) {
      return Response.json(
        { error: "parse-error", message: "Gemini returned malformed JSON.", raw: text.slice(0, 500) },
        { status: 502 },
      );
    }
    return Response.json(payload);
  } catch (e) {
    clearTimeout(t);
    return geminiErrorJsonResponse(e, "voice_meal");
  }
}
