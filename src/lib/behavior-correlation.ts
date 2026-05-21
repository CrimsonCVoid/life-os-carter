import type { BehaviorLog, HealthLog } from "@/lib/types";

export type CorrelationInsight = {
  behavior: keyof BehaviorLog;
  label: string;
  /** "negative" = bad for recovery, "positive" = good. */
  direction: "negative" | "positive";
  /** Avg delta in sleep hours when this behavior is high vs not. */
  deltaSleepHours: number;
  highDays: number;
  lowDays: number;
  text: string;
};

type FieldSpec = {
  key: keyof BehaviorLog;
  label: string;
  kind: "numeric" | "boolean";
};

// Curated subset of BehaviorLog fields where the high/low → next-day sleep
// hypothesis is sensible. Notes are excluded (free text), dates are excluded.
const FIELDS: FieldSpec[] = [
  { key: "caffeineMg", label: "Caffeine", kind: "numeric" },
  { key: "alcoholDrinks", label: "Alcohol", kind: "numeric" },
  { key: "screenTimeMinBeforeBed", label: "Pre-bed screens", kind: "numeric" },
  { key: "stressLevel", label: "Stress", kind: "numeric" },
  { key: "lateMeal", label: "Late meals", kind: "boolean" },
  { key: "meditationMin", label: "Meditation", kind: "numeric" },
  { key: "cardioMin", label: "Cardio", kind: "numeric" },
  { key: "saunaMin", label: "Sauna", kind: "numeric" },
  { key: "coldExposureMin", label: "Cold exposure", kind: "numeric" },
];

export function findCorrelations(input: {
  behaviors: Record<string, BehaviorLog>;
  health: Record<string, HealthLog>;
  minSamples?: number;
}): CorrelationInsight[] {
  const minSamples = input.minSamples ?? 5;
  const dates = Object.keys(input.behaviors);

  const out: CorrelationInsight[] = [];

  for (const field of FIELDS) {
    const insight = correlateField(
      field,
      dates,
      input.behaviors,
      input.health,
      minSamples,
    );
    if (insight) out.push(insight);
  }

  out.sort((a, b) => Math.abs(b.deltaSleepHours) - Math.abs(a.deltaSleepHours));
  return out.slice(0, 5);
}

function correlateField(
  field: FieldSpec,
  dates: string[],
  behaviors: Record<string, BehaviorLog>,
  health: Record<string, HealthLog>,
  minSamples: number,
): CorrelationInsight | null {
  const pairs: Array<{ value: number | boolean; nextSleep: number }> = [];
  for (const d of dates) {
    const raw = behaviors[d]?.[field.key];
    if (raw == null) continue;
    const next = health[shiftDate(d, 1)]?.sleepHours;
    if (typeof next !== "number" || !Number.isFinite(next) || next <= 0) continue;
    if (field.kind === "numeric") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      pairs.push({ value: raw, nextSleep: next });
    } else {
      if (typeof raw !== "boolean") continue;
      pairs.push({ value: raw, nextSleep: next });
    }
  }

  if (pairs.length < minSamples * 2) return null;

  let highValues: number[];
  let lowValues: number[];

  if (field.kind === "boolean") {
    highValues = pairs.filter((p) => p.value === true).map((p) => p.nextSleep);
    lowValues = pairs.filter((p) => p.value === false).map((p) => p.nextSleep);
  } else {
    const nums = pairs.map((p) => p.value as number);
    const p75 = percentile(nums, 0.75);
    const p25 = percentile(nums, 0.25);
    highValues = pairs
      .filter((p) => (p.value as number) >= p75)
      .map((p) => p.nextSleep);
    lowValues = pairs
      .filter((p) => (p.value as number) <= p25)
      .map((p) => p.nextSleep);
  }

  if (highValues.length < minSamples || lowValues.length < minSamples) {
    return null;
  }

  const avgHigh = avg(highValues);
  const avgLow = avg(lowValues);
  const delta = avgLow - avgHigh;
  if (Math.abs(delta) <= 0.4) return null;

  const direction: CorrelationInsight["direction"] =
    delta > 0 ? "negative" : "positive";
  const text = buildText(field, delta, direction);

  return {
    behavior: field.key,
    label: field.label,
    direction,
    deltaSleepHours: delta,
    highDays: highValues.length,
    lowDays: lowValues.length,
    text,
  };
}

function buildText(
  field: FieldSpec,
  delta: number,
  direction: CorrelationInsight["direction"],
): string {
  const mag = Math.abs(delta).toFixed(1);
  const dayPhrase =
    field.kind === "boolean"
      ? `Days with ${field.label.toLowerCase()}`
      : `Days with high ${field.label.toLowerCase()}`;
  const tail =
    direction === "negative"
      ? `→ ${mag}h less sleep that night`
      : `→ ${mag}h more sleep that night`;
  return `${dayPhrase} ${tail}`;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
