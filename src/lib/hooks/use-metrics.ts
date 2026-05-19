"use client";

import useSWR, { mutate } from "swr";

/**
 * Per-metric SWR hooks. Each daily-singleton metric has:
 *   - `use{Metric}(date)` → today/given-day value + isLoading
 *   - `set{Metric}(...)` → optimistic write + server PUT
 *
 * Range readers used by charts: `use{Metric}Range(start, end)`.
 */

function keyFor(metric: string, date: string) {
  return `/api/data/metrics/${metric}?date=${date}`;
}
function rangeKeyFor(metric: string, start: string, end: string) {
  return `/api/data/metrics/${metric}?start=${start}&end=${end}`;
}

// ── WATER ───────────────────────────────────────────────────────────────────
type WaterRow = { userId: string; date: string; oz: number; updatedAt: Date } | null;

export function useWater(date: string) {
  const swr = useSWR<WaterRow>(keyFor("water", date));
  return { water: swr.data ?? null, isLoading: swr.isLoading };
}
export async function setWater(date: string, oz: number) {
  const key = keyFor("water", date);
  await mutate<WaterRow>(
    key,
    (cur) =>
      cur ? { ...cur, oz } : ({ userId: "", date, oz, updatedAt: new Date() } as NonNullable<WaterRow>),
    { revalidate: false }
  );
  await fetch("/api/data/metrics/water", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, oz }),
  });
  await mutate(key);
}
export async function addWater(date: string, deltaOz: number) {
  const key = keyFor("water", date);
  await mutate<WaterRow>(
    key,
    (cur) => {
      const next = Math.max(0, (cur?.oz ?? 0) + deltaOz);
      return cur
        ? { ...cur, oz: next }
        : ({ userId: "", date, oz: next, updatedAt: new Date() } as NonNullable<WaterRow>);
    },
    { revalidate: false }
  );
  await fetch("/api/data/metrics/water", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, deltaOz }),
  });
  await mutate(key);
}

// ── WEIGHT ──────────────────────────────────────────────────────────────────
type WeightRow = {
  userId: string;
  date: string;
  lb: number;
  source: "manual" | "sync";
  updatedAt: Date;
} | null;

export function useWeight(date: string) {
  const swr = useSWR<WeightRow>(keyFor("weight", date));
  return { weight: swr.data ?? null, isLoading: swr.isLoading };
}
export async function setWeight(date: string, lb: number) {
  const key = keyFor("weight", date);
  await mutate<WeightRow>(
    key,
    () => ({ userId: "", date, lb, source: "manual", updatedAt: new Date() }),
    { revalidate: false }
  );
  await fetch("/api/data/metrics/weight", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, lb, source: "manual" }),
  });
  await mutate(key);
}

// ── MOOD ────────────────────────────────────────────────────────────────────
type MoodRow = { userId: string; date: string; value: number; updatedAt: Date } | null;

export function useMood(date: string) {
  const swr = useSWR<MoodRow>(keyFor("mood", date));
  return { mood: swr.data ?? null, isLoading: swr.isLoading };
}
export async function setMood(date: string, value: number) {
  const key = keyFor("mood", date);
  await mutate<MoodRow>(
    key,
    () => ({ userId: "", date, value, updatedAt: new Date() }),
    { revalidate: false }
  );
  await fetch("/api/data/metrics/mood", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, value }),
  });
  await mutate(key);
}

// ── ENERGY (per period) ─────────────────────────────────────────────────────
export type EnergyPeriod = "morning" | "midday" | "afternoon" | "evening";
type EnergyRow = {
  userId: string;
  date: string;
  period: EnergyPeriod;
  value: number;
  updatedAt: Date;
};

export function useEnergy(date: string) {
  const swr = useSWR<EnergyRow[]>(keyFor("energy", date));
  return { energy: swr.data ?? [], isLoading: swr.isLoading };
}
export async function setEnergy(
  date: string,
  period: EnergyPeriod,
  value: number
) {
  const key = keyFor("energy", date);
  await mutate<EnergyRow[]>(
    key,
    (cur) => {
      const next = [...(cur ?? []).filter((r) => r.period !== period)];
      next.push({ userId: "", date, period, value, updatedAt: new Date() });
      return next;
    },
    { revalidate: false }
  );
  await fetch("/api/data/metrics/energy", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, period, value }),
  });
  await mutate(key);
}
export async function clearEnergy(date: string, period: EnergyPeriod) {
  const key = keyFor("energy", date);
  await mutate<EnergyRow[]>(
    key,
    (cur) => (cur ?? []).filter((r) => r.period !== period),
    { revalidate: false }
  );
  await fetch("/api/data/metrics/energy", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, period }),
  });
  await mutate(key);
}

// ── STEPS / HRV / RHR / SLEEP / CARDIO LOAD (range readers) ────────────────

export function useStepsRange(start: string, end: string) {
  return useSWR<unknown[]>(rangeKeyFor("steps", start, end));
}
export function useHrvRange(start: string, end: string) {
  return useSWR<unknown[]>(rangeKeyFor("hrv", start, end));
}
export function useRhrRange(start: string, end: string) {
  return useSWR<unknown[]>(rangeKeyFor("rhr", start, end));
}
export function useSleepRange(start: string, end: string) {
  return useSWR<unknown[]>(rangeKeyFor("sleep", start, end));
}
export function useCardioLoadRange(start: string, end: string) {
  return useSWR<unknown[]>(rangeKeyFor("cardio-load", start, end));
}

export async function setSteps(date: string, count: number) {
  await fetch("/api/data/metrics/steps", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, count, source: "manual" }),
  });
  await mutate((k) => typeof k === "string" && k.startsWith("/api/data/metrics/steps"));
}
