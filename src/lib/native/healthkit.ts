"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

interface HealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean }>;
  getSteps(opts?: { start?: number; end?: number }): Promise<{ value: number }>;
  getActiveCalories(opts?: { start?: number; end?: number }): Promise<{ value: number }>;
  getHeartRate(opts?: { start?: number; end?: number }): Promise<{ value: number }>;
  getRestingHeartRate(opts?: { start?: number; end?: number }): Promise<{ value: number }>;
  getHRV(opts?: { start?: number; end?: number }): Promise<{ value: number }>;
  getWeight(opts?: { start?: number; end?: number }): Promise<{ value: number }>;
  getSleep(opts?: { start?: number; end?: number }): Promise<{ hours: number }>;
  writeWeight(opts: { pounds: number; when?: number }): Promise<{ ok: boolean }>;
  writeWater(opts: { ounces: number; when?: number }): Promise<{ ok: boolean }>;
  writeMindfulSession(opts: {
    start: number;
    durationSec: number;
  }): Promise<{ ok: boolean }>;
  writeWorkout(opts: {
    start: number;
    end: number;
    calories?: number;
    activity?: "strength" | "cardio" | "running" | "cycling" | "walking" | "hiit";
  }): Promise<{ ok: boolean }>;
}

const noop = async () => ({} as never);
const Native = registerPlugin<HealthKitPlugin>("HealthKit", {
  web: {
    async isAvailable() { return { available: false }; },
    async requestAuthorization() { return { granted: false }; },
    getSteps: noop, getActiveCalories: noop,
    getHeartRate: noop, getRestingHeartRate: noop,
    getHRV: noop, getWeight: noop,
    async getSleep() { return { hours: 0 }; },
    async writeWeight() { return { ok: false }; },
    async writeWater() { return { ok: false }; },
    async writeMindfulSession() { return { ok: false }; },
    async writeWorkout() { return { ok: false }; },
  },
});

const active = () => Capacitor.isNativePlatform();

export const HealthKit = {
  async isAvailable(): Promise<boolean> {
    if (!active()) return false;
    const r = await Native.isAvailable();
    return !!r.available;
  },
  async requestAuthorization(): Promise<boolean> {
    if (!active()) return false;
    const r = await Native.requestAuthorization();
    return !!r.granted;
  },
  steps: (opts?: { start?: number; end?: number }) => Native.getSteps(opts),
  activeCalories: (opts?: { start?: number; end?: number }) => Native.getActiveCalories(opts),
  heartRate: (opts?: { start?: number; end?: number }) => Native.getHeartRate(opts),
  restingHeartRate: (opts?: { start?: number; end?: number }) => Native.getRestingHeartRate(opts),
  hrv: (opts?: { start?: number; end?: number }) => Native.getHRV(opts),
  weight: (opts?: { start?: number; end?: number }) => Native.getWeight(opts),
  sleep: (opts?: { start?: number; end?: number }) => Native.getSleep(opts),

  /* ───────────────── Writes — best-effort, never throw ───────────────── */
  async writeWeight(pounds: number, when?: Date): Promise<boolean> {
    if (!active() || !(pounds > 0)) return false;
    try {
      const r = await Native.writeWeight({
        pounds,
        when: when?.getTime(),
      });
      return !!r.ok;
    } catch {
      return false;
    }
  },
  async writeWater(ounces: number, when?: Date): Promise<boolean> {
    if (!active() || !(ounces > 0)) return false;
    try {
      const r = await Native.writeWater({
        ounces,
        when: when?.getTime(),
      });
      return !!r.ok;
    } catch {
      return false;
    }
  },
  async writeMindfulSession(
    start: Date,
    durationSec: number
  ): Promise<boolean> {
    if (!active() || !(durationSec > 0)) return false;
    try {
      const r = await Native.writeMindfulSession({
        start: start.getTime(),
        durationSec,
      });
      return !!r.ok;
    } catch {
      return false;
    }
  },
  async writeWorkout(opts: {
    start: Date;
    end: Date;
    calories?: number;
    activity?: "strength" | "cardio" | "running" | "cycling" | "walking" | "hiit";
  }): Promise<boolean> {
    if (!active()) return false;
    try {
      const r = await Native.writeWorkout({
        start: opts.start.getTime(),
        end: opts.end.getTime(),
        calories: opts.calories,
        activity: opts.activity,
      });
      return !!r.ok;
    } catch {
      return false;
    }
  },
};
