/**
 * Open Food Facts product lookup.
 *
 * Public API, no auth, no key. Identifies as "life-os" per OFF's
 * community-app guideline so they can rate-limit us politely if we ever
 * misbehave.
 *
 * Free-tier respectful behavior: barcode is path-segmented, not posted;
 * one call per scan; we never poll. Their CDN handles repeat lookups.
 */

const OFF_API = "https://world.openfoodfacts.org/api/v0/product";
const UA = "life-os/0.2 (https://github.com/hbrady7/life-os)";

export type OpenFoodFactsProduct = {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  servingSizeG?: number;
  /** Macros per 100g — the value OFF most reliably returns. We compute
   *  per-serving on the client when a serving size is known. */
  per100g: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
};

type RawNutriments = {
  "energy-kcal_100g"?: number;
  energy_100g?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
};

type RawProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: RawNutriments;
};

type RawResponse = {
  status?: number;
  status_verbose?: string;
  product?: RawProduct;
};

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal
): Promise<OpenFoodFactsProduct | null> {
  const url = `${OFF_API}/${encodeURIComponent(barcode)}.json`;
  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as RawResponse;
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const n = p.nutriments ?? {};

  // OFF stores energy as kJ in `energy_100g`. Prefer the explicit
  // kcal field; fall back to the kJ field with the standard 4.184 conv.
  let calories = asNumber(n["energy-kcal_100g"]);
  if (calories === undefined) {
    const kj = asNumber(n.energy_100g);
    if (kj !== undefined) calories = Math.round(kj / 4.184);
  }

  return {
    barcode,
    name:
      (p.product_name_en && p.product_name_en.trim()) ||
      (p.product_name && p.product_name.trim()) ||
      `Item ${barcode}`,
    brand: p.brands?.trim() || undefined,
    imageUrl: p.image_front_small_url || p.image_small_url || undefined,
    servingSizeG: asNumber(p.serving_quantity),
    per100g: {
      calories,
      protein: asNumber(n.proteins_100g),
      carbs: asNumber(n.carbohydrates_100g),
      fat: asNumber(n.fat_100g),
    },
  };
}

/**
 * Compute macros for a given gram quantity. Returns undefined for any
 * macro OFF didn't have data for, so the review UI can render an
 * em-dash rather than a misleading zero.
 */
export function macrosFor(
  product: OpenFoodFactsProduct,
  grams: number
): {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
} {
  const ratio = grams / 100;
  const r = (v?: number) =>
    v === undefined ? undefined : Math.round(v * ratio * 10) / 10;
  return {
    calories: r(product.per100g.calories),
    protein: r(product.per100g.protein),
    carbs: r(product.per100g.carbs),
    fat: r(product.per100g.fat),
  };
}
