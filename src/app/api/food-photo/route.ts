import { GoogleGenAI } from "@google/genai";
import { resolveGeminiApiKey, GEMINI_KEY_NAMES } from "@/lib/gemini-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are analyzing a photo of food to estimate nutritional information. Return a JSON object EXACTLY matching this shape:
{
  isFood: boolean (false if image clearly does not show food),
  suggestedMealName: string (e.g. 'Chicken and rice bowl', 'Greek yogurt with berries'),
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
  notes: string (one short paragraph flagging uncertainty or caveats — 'portion hard to estimate without scale reference', 'could be more or less depending on cooking method', empty string if no caveats)
}

Be honest about uncertainty. Portion estimation is inherently imprecise from a single 2D image with no scale reference; reflect this in the confidence rating and notes. Better to mark medium/low confidence than to fake precision. If the image doesn't show food, set isFood to false and return zeros for totals.

Return ONLY the JSON. No preamble. No markdown fences.`;

type Confidence = "high" | "medium" | "low";

export type FoodPhotoItem = {
  name: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type FoodPhotoPayload = {
  isFood: boolean;
  suggestedMealName: string;
  overallConfidence: Confidence;
  identifiedItems: FoodPhotoItem[];
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
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

function parsePayload(raw: string): FoodPhotoPayload | null {
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
  const items: FoodPhotoItem[] = itemsRaw
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
    .filter((x): x is FoodPhotoItem => x !== null);

  const totalsRaw =
    o.totals && typeof o.totals === "object"
      ? (o.totals as Record<string, unknown>)
      : {};
  const totals = {
    calories: toNum(totalsRaw.calories),
    proteinG: toNum(totalsRaw.proteinG),
    carbsG: toNum(totalsRaw.carbsG),
    fatG: toNum(totalsRaw.fatG),
  };

  return {
    isFood: o.isFood !== false,
    suggestedMealName:
      typeof o.suggestedMealName === "string"
        ? o.suggestedMealName.trim()
        : "",
    overallConfidence: toConfidence(o.overallConfidence),
    identifiedItems: items,
    totals,
    notes: typeof o.notes === "string" ? o.notes.trim() : "",
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
        )} in your Vercel env (Production + Preview) and redeploy.`,
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "bad-request", message: "Invalid form data." },
      { status: 400 }
    );
  }

  const file = form.get("image");
  if (!(file instanceof Blob)) {
    return Response.json(
      { error: "bad-request", message: "Missing image file." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return Response.json(
      { error: "bad-request", message: "Image is empty." },
      { status: 400 }
    );
  }

  const mimeType = (file.type && file.type.length > 0 ? file.type : "image/jpeg")
    .split(";")[0]
    .trim();

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  const ai = new GoogleGenAI({ apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawText = "";
  try {
    const result = (await ai.models.generateContent({
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
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
      },
    })) as unknown as {
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
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Gemini call timed out after 30s."
          : err.message
        : "Gemini call failed.";
    return Response.json(
      { error: "gemini-failed", message },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }

  const parsed = parsePayload(rawText);
  if (!parsed) {
    return Response.json(
      {
        error: "bad-output",
        message: "Could not parse model output.",
        raw: rawText.slice(0, 500),
      },
      { status: 502 }
    );
  }

  return Response.json(parsed, { status: 200 });
}
