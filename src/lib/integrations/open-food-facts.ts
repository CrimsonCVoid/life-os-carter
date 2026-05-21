export type OFFProduct = {
  barcode: string;
  name: string;
  brand?: string;
  servingSizeText?: string;
  servingSizeG?: number;
  caloriesPerServing?: number;
  proteinPerServing?: number;
  carbsPerServing?: number;
  fatPerServing?: number;
  fiberPerServing?: number;
  imageUrl?: string;
};

type OFFNutriments = Partial<Record<string, number | string>>;

type OFFRawProduct = {
  product_name?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  image_front_small_url?: string;
  image_front_url?: string;
  nutriments?: OFFNutriments;
};

type OFFRawResponse = {
  status?: number;
  product?: OFFRawProduct;
};

const cache = new Map<string, OFFProduct | null>();

function toNumber(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseServingGrams(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/([\d.,]+)\s*g/i);
  if (!match) return undefined;
  const n = parseFloat(match[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function pickNutriment(
  nutriments: OFFNutriments | undefined,
  serving: string,
  per100: string
): number | undefined {
  if (!nutriments) return undefined;
  const s = toNumber(nutriments[serving]);
  if (s !== undefined) return s;
  return toNumber(nutriments[per100]);
}

function mapProduct(barcode: string, raw: OFFRawProduct): OFFProduct {
  const name =
    (raw.product_name && raw.product_name.trim()) ||
    (raw.generic_name && raw.generic_name.trim()) ||
    "Unknown product";
  const brand = raw.brands?.split(",")[0]?.trim() || undefined;
  const servingSizeText = raw.serving_size || undefined;
  const servingSizeG = parseServingGrams(servingSizeText);
  const n = raw.nutriments;
  return {
    barcode,
    name,
    brand,
    servingSizeText,
    servingSizeG,
    caloriesPerServing: pickNutriment(n, "energy-kcal_serving", "energy-kcal_100g"),
    proteinPerServing: pickNutriment(n, "proteins_serving", "proteins_100g"),
    carbsPerServing: pickNutriment(n, "carbohydrates_serving", "carbohydrates_100g"),
    fatPerServing: pickNutriment(n, "fat_serving", "fat_100g"),
    fiberPerServing: pickNutriment(n, "fiber_serving", "fiber_100g"),
    imageUrl: raw.image_front_small_url || raw.image_front_url || undefined,
  };
}

export async function lookupBarcode(barcode: string): Promise<OFFProduct | null> {
  const key = barcode.trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(key)}.json`
    );
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as OFFRawResponse;
    if (data.status !== 1 || !data.product) {
      cache.set(key, null);
      return null;
    }
    const mapped = mapProduct(key, data.product);
    cache.set(key, mapped);
    return mapped;
  } catch {
    cache.set(key, null);
    return null;
  }
}
