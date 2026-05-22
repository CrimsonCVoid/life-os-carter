"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Active-workout Live Activity. Dynamic Island compact / expanded /
 * minimal + Lock Screen banner. Driven entirely from JS state — call
 * start() when the user taps Start workout, update() on every completed
 * set, end() when the session finishes or cancels.
 *
 * Native (Swift) implementation: ios/App/App/Plugins/LiveActivityBridgePlugin.swift
 * Shared attributes: ios/Shared/WorkoutActivityAttributes.swift
 */

export type LiveActivityStartOpts = {
  workoutType?: string;
  /** ms since epoch — defaults to now on the native side if omitted. */
  startedAt?: number;
};

export type LiveActivityUpdateOpts = {
  setsCompleted: number;
  totalVolume: number;
  lastExerciseName?: string | null;
  lastSetSummary?: string | null;
  /** ms since epoch when the current rest period ends. null/undefined = not resting. */
  restEndsAt?: number | null;
};

interface LiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(opts: LiveActivityStartOpts): Promise<{ ok: boolean; id?: string }>;
  update(opts: LiveActivityUpdateOpts): Promise<{ ok: boolean; reason?: string }>;
  end(): Promise<{ ok: boolean; reason?: string }>;
}

const Native = registerPlugin<LiveActivityPlugin>("LiveActivity", {
  web: {
    async isSupported() {
      return { supported: false };
    },
    async start() {
      return { ok: false };
    },
    async update() {
      return { ok: false };
    },
    async end() {
      return { ok: true };
    },
  },
});

function active(): boolean {
  return Capacitor.isNativePlatform();
}

export const LiveActivity = {
  async isSupported(): Promise<boolean> {
    if (!active()) return false;
    const r = await Native.isSupported();
    return !!r.supported;
  },
  async start(opts: LiveActivityStartOpts = {}): Promise<void> {
    if (!active()) return;
    await Native.start(opts);
  },
  async update(opts: LiveActivityUpdateOpts): Promise<void> {
    if (!active()) return;
    // Strip nulls to undefined so the Swift bridge's getDouble/getString
    // doesn't see explicit null values.
    const clean: LiveActivityUpdateOpts = {
      setsCompleted: opts.setsCompleted,
      totalVolume: opts.totalVolume,
    };
    if (opts.lastExerciseName) clean.lastExerciseName = opts.lastExerciseName;
    if (opts.lastSetSummary) clean.lastSetSummary = opts.lastSetSummary;
    if (opts.restEndsAt) clean.restEndsAt = opts.restEndsAt;
    await Native.update(clean);
  },
  async end(): Promise<void> {
    if (!active()) return;
    await Native.end();
  },
};
