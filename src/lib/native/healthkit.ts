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
};
