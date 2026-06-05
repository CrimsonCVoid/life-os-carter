import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FDC_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

/**
 * Server-side proxy for USDA FoodData Central search. The FDC API key never
 * ships in the app binary — it's read from the server env here and the iOS
 * client calls this route with its bearer. Bearer is validated via
 * requireUser() (the middleware only checks header *shape*).
 *
 * Returns a compact, normalized result list: macros are per-100g (the
 * consistent basis across FDC data types); serving metadata is passed through
 * so the client can scale to a logged portion.
 */

type FdcNutrient = {
  nutrientNumber?: string;
  value?: number;
  unitName?: string;
};
type FdcFood = {
  fdcId: number;
  description?: string;
  dataType?: string;
  brandName?: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
};

export type FoodSearchItem = {
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string;
  /** Per-100g macros — the common FDC basis. */
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
  serving: { size: number | null; unit: string | null; household: string | null };
};

// FDC nutrientNumber codes. Energy falls back to the Atwater general/specific
// factors (957/958) when the primary 208 isn't reported.
const N_ENERGY = ["208", "957", "958"];
const N_PROTEIN = "203";
const N_FAT = "204";
const N_CARBS = "205";

function nutrient(food: FdcFood, numbers: string | string[]): number {
  const codes = Array.isArray(numbers) ? numbers : [numbers];
  for (const code of codes) {
    const n = food.foodNutrients?.find((x) => x.nutrientNumber === code);
    if (typeof n?.value === "number") return n.value;
  }
  return 0;
}

function normalize(food: FdcFood): FoodSearchItem {
  return {
    fdcId: food.fdcId,
    name: (food.description ?? "Unknown food").trim(),
    brand: (food.brandName || food.brandOwner || null)?.trim() || null,
    dataType: food.dataType ?? "",
    per100g: {
      calories: Math.round(nutrient(food, N_ENERGY)),
      proteinG: Math.round(nutrient(food, N_PROTEIN) * 10) / 10,
      carbsG: Math.round(nutrient(food, N_CARBS) * 10) / 10,
      fatG: Math.round(nutrient(food, N_FAT) * 10) / 10,
    },
    serving: {
      size: typeof food.servingSize === "number" ? food.servingSize : null,
      unit: food.servingSizeUnit ?? null,
      household: food.householdServingFullText ?? null,
    },
  };
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  return search(searchParams.get("q") ?? "", Number(searchParams.get("pageSize")));
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  let body: { query?: string; pageSize?: number } = {};
  try {
    body = (await req.json()) as { query?: string; pageSize?: number };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  return search(body.query ?? "", body.pageSize);
}

async function search(rawQuery: string, rawPageSize: number | undefined): Promise<NextResponse> {
  const query = rawQuery.trim();
  if (!query) {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }
  const pageSize = Math.min(50, Math.max(1, rawPageSize || 25));

  const apiKey = process.env.USDA_FDC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "search unavailable" }, { status: 503 });
  }

  const url = new URL(FDC_SEARCH);
  url.searchParams.set("api_key", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize,
        // Branded first (what users actually log), then generic references.
        dataType: ["Branded", "Foundation", "SR Legacy", "Survey (FNDDS)"],
      }),
    });
  } catch {
    return NextResponse.json({ error: "search failed" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "search failed", status: res.status }, { status: 502 });
  }

  const data = (await res.json()) as { foods?: FdcFood[] };
  const items = (data.foods ?? [])
    .map(normalize)
    // Drop zero-calorie noise rows that lack any macro signal.
    .filter((i) => i.per100g.calories > 0 || i.per100g.proteinG > 0 || i.per100g.carbsG > 0 || i.per100g.fatG > 0);

  return NextResponse.json({ query, items });
}
