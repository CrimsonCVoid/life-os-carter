"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * App Group bridge — writes JSON snapshots from the JS app into UserDefaults
 * that the Widget Extension and Live Activity can read.
 *
 * Web fallback is a no-op so calling this on the PWA / desktop is harmless.
 */
export interface SharedStoragePlugin {
  set(opts: { key: string; value: string | null }): Promise<{ ok: boolean }>;
  get(opts: { key: string }): Promise<{ value: string | null }>;
  remove(opts: { key: string }): Promise<{ ok: boolean }>;
}

const Native = registerPlugin<SharedStoragePlugin>("SharedStorage", {
  web: {
    async set() {
      return { ok: true };
    },
    async get() {
      return { value: null };
    },
    async remove() {
      return { ok: true };
    },
  },
});

function active(): boolean {
  return Capacitor.isNativePlatform();
}

export const SharedStorage = {
  /** Write a value. Pass null to clear. */
  async set(key: string, value: string | null): Promise<void> {
    if (!active()) return;
    await Native.set({ key, value });
  },
  async get(key: string): Promise<string | null> {
    if (!active()) return null;
    const res = await Native.get({ key });
    return res.value ?? null;
  },
  async remove(key: string): Promise<void> {
    if (!active()) return;
    await Native.remove({ key });
  },
};

/* ───────────────────────── snapshot helper ───────────────────────── */

/**
 * Canonical "today's numbers" payload that widgets / live activities read.
 * Keep the shape tight — anything bigger needs JSON parse on every widget
 * render, which has a tight budget on iOS.
 */
export type TodaySnapshot = {
  /** ISO date the snapshot covers. */
  date: string;
  /** Whoop-style 0–21 strain accumulated today. */
  strain: number | null;
  /** 0–100 readiness composite. */
  readiness: number | null;
  /** Sleep hours last night. */
  sleep: number | null;
  /** Steps so far today. */
  steps: number | null;
  /** Calories logged today. */
  calories: number | null;
  /** Macro target progress 0–1. */
  caloriesPct: number | null;
  /** UTC ms the snapshot was written — widget shows "Updated 3m ago". */
  updatedAt: number;
};

const SNAPSHOT_KEY = "todaySnapshot";

export async function writeTodaySnapshot(snapshot: TodaySnapshot): Promise<void> {
  await SharedStorage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function readTodaySnapshot(): Promise<TodaySnapshot | null> {
  const raw = await SharedStorage.get(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TodaySnapshot;
  } catch {
    return null;
  }
}
