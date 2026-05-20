/**
 * Per-metric daily logs. Each helper is symmetric: getRange to read,
 * upsert{Metric} to write. Tables use composite PK (userId, date) so
 * upserts are idempotent and the sync engine can re-write the same day
 * without piling on rows.
 */

import { and, between, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cardioLoadLogs,
  energyLogs,
  hrvLogs,
  moodLogs,
  restingHeartRateLogs,
  sleepLogs,
  stepsLogs,
  waterLogs,
  weightLogs,
} from "@/lib/db/schema";

// ── WATER (oz) ──────────────────────────────────────────────────────────────

export async function getWater(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(waterLogs)
    .where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date)));
  return row ?? null;
}

export async function setWater(userId: string, date: string, oz: number) {
  await db
    .insert(waterLogs)
    .values({ userId, date, oz })
    .onConflictDoUpdate({
      target: [waterLogs.userId, waterLogs.date],
      set: { oz, updatedAt: new Date() },
    });
}

export async function addWater(userId: string, date: string, deltaOz: number) {
  const existing = await getWater(userId, date);
  const next = Math.max(0, (existing?.oz ?? 0) + deltaOz);
  await setWater(userId, date, next);
}

// ── WEIGHT (lb) ─────────────────────────────────────────────────────────────

export async function getWeight(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(weightLogs)
    .where(and(eq(weightLogs.userId, userId), eq(weightLogs.date, date)));
  return row ?? null;
}

export async function setWeight(
  userId: string,
  date: string,
  lb: number,
  source: "manual" | "sync" = "manual"
) {
  await db
    .insert(weightLogs)
    .values({ userId, date, lb, source })
    .onConflictDoUpdate({
      target: [weightLogs.userId, weightLogs.date],
      set: { lb, source, updatedAt: new Date() },
    });
}

// ── MOOD ────────────────────────────────────────────────────────────────────

export async function setMood(userId: string, date: string, value: number) {
  await db
    .insert(moodLogs)
    .values({ userId, date, value })
    .onConflictDoUpdate({
      target: [moodLogs.userId, moodLogs.date],
      set: { value, updatedAt: new Date() },
    });
}

export async function getMood(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(moodLogs)
    .where(and(eq(moodLogs.userId, userId), eq(moodLogs.date, date)));
  return row ?? null;
}

// ── ENERGY (per period) ─────────────────────────────────────────────────────

export type EnergyPeriod = "morning" | "midday" | "afternoon" | "evening";

export async function setEnergy(
  userId: string,
  date: string,
  period: EnergyPeriod,
  value: number
) {
  await db
    .insert(energyLogs)
    .values({ userId, date, period, value })
    .onConflictDoUpdate({
      target: [energyLogs.userId, energyLogs.date, energyLogs.period],
      set: { value, updatedAt: new Date() },
    });
}

export async function clearEnergy(
  userId: string,
  date: string,
  period: EnergyPeriod
) {
  await db
    .delete(energyLogs)
    .where(
      and(
        eq(energyLogs.userId, userId),
        eq(energyLogs.date, date),
        eq(energyLogs.period, period)
      )
    );
}

export async function getEnergyForDate(userId: string, date: string) {
  return db
    .select()
    .from(energyLogs)
    .where(and(eq(energyLogs.userId, userId), eq(energyLogs.date, date)));
}

// ── STEPS ───────────────────────────────────────────────────────────────────

export async function setSteps(
  userId: string,
  date: string,
  count: number,
  source: "manual" | "sync" = "manual"
) {
  await db
    .insert(stepsLogs)
    .values({ userId, date, count, source })
    .onConflictDoUpdate({
      target: [stepsLogs.userId, stepsLogs.date],
      set: { count, source, updatedAt: new Date() },
    });
}

// ── HRV / RHR / SLEEP / CARDIO LOAD ────────────────────────────────────────

export async function setHrv(userId: string, date: string, ms: number) {
  await db
    .insert(hrvLogs)
    .values({ userId, date, ms })
    .onConflictDoUpdate({
      target: [hrvLogs.userId, hrvLogs.date],
      set: { ms, updatedAt: new Date() },
    });
}

export async function setRestingHeartRate(
  userId: string,
  date: string,
  bpm: number
) {
  await db
    .insert(restingHeartRateLogs)
    .values({ userId, date, bpm })
    .onConflictDoUpdate({
      target: [restingHeartRateLogs.userId, restingHeartRateLogs.date],
      set: { bpm, updatedAt: new Date() },
    });
}

export async function getRestingHeartRate(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(restingHeartRateLogs)
    .where(
      and(
        eq(restingHeartRateLogs.userId, userId),
        eq(restingHeartRateLogs.date, date)
      )
    );
  return row ?? null;
}

export type SleepStagesInput = {
  lightMin?: number;
  deepMin?: number;
  remMin?: number;
  wakeMin?: number;
};

export async function setSleep(
  userId: string,
  date: string,
  data: {
    hours?: number;
    score?: number;
    stages?: SleepStagesInput;
    wakeTime?: string;
    bedtime?: string;
  }
) {
  await db
    .insert(sleepLogs)
    .values({ userId, date, ...data })
    .onConflictDoUpdate({
      target: [sleepLogs.userId, sleepLogs.date],
      set: { ...data, updatedAt: new Date() },
    });
}

export async function setCardioLoad(
  userId: string,
  date: string,
  value: number
) {
  await db
    .insert(cardioLoadLogs)
    .values({ userId, date, value })
    .onConflictDoUpdate({
      target: [cardioLoadLogs.userId, cardioLoadLogs.date],
      set: { value, updatedAt: new Date() },
    });
}

// ── BULK RANGE READS — chart / insight queries ──────────────────────────────

export async function readSleepRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(sleepLogs)
    .where(
      and(eq(sleepLogs.userId, userId), between(sleepLogs.date, start, end))
    );
}

export async function readHrvRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(hrvLogs)
    .where(and(eq(hrvLogs.userId, userId), between(hrvLogs.date, start, end)));
}

export async function readStepsRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(stepsLogs)
    .where(
      and(eq(stepsLogs.userId, userId), between(stepsLogs.date, start, end))
    );
}

export async function readWeightRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(weightLogs)
    .where(
      and(eq(weightLogs.userId, userId), between(weightLogs.date, start, end))
    );
}

export async function readMoodRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(moodLogs)
    .where(and(eq(moodLogs.userId, userId), between(moodLogs.date, start, end)));
}

export async function readWaterRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(waterLogs)
    .where(
      and(eq(waterLogs.userId, userId), between(waterLogs.date, start, end))
    );
}

export async function readCardioLoadRange(
  userId: string,
  start: string,
  end: string
) {
  return db
    .select()
    .from(cardioLoadLogs)
    .where(
      and(
        eq(cardioLoadLogs.userId, userId),
        between(cardioLoadLogs.date, start, end)
      )
    );
}

export async function readRestingHeartRateRange(
  userId: string,
  start: string,
  end: string
) {
  return db
    .select()
    .from(restingHeartRateLogs)
    .where(
      and(
        eq(restingHeartRateLogs.userId, userId),
        between(restingHeartRateLogs.date, start, end)
      )
    );
}

export async function readEnergyRange(userId: string, start: string, end: string) {
  return db
    .select()
    .from(energyLogs)
    .where(
      and(eq(energyLogs.userId, userId), between(energyLogs.date, start, end))
    );
}
