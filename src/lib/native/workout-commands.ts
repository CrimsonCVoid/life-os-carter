"use client";

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SharedStorage } from "./shared-storage";

/**
 * Workout command queue — written by Live Activity App Intents
 * (Complete Set / +30s Rest / Skip Rest) inside the WidgetExtension
 * process, drained here on the JS side and dispatched to Zustand.
 *
 * Pairs with:
 *   • ios/WidgetExtension/WorkoutLiveActivityIntents.swift (producer)
 *   • src/components/workout/active-workout-page.tsx (consumer)
 */

const QUEUE_KEY = "workoutCommands";

export type WorkoutCommand =
  | { op: "complete_set"; ts: number }
  | { op: "add_rest"; ts: number; args: { seconds: number } }
  | { op: "skip_rest"; ts: number }
  | { op: "finish"; ts: number };

type RawCommand = {
  op: string;
  ts: number;
  args?: Record<string, number>;
};

/**
 * Read + clear the queue atomically. Returns commands in their original
 * order (oldest first). Safe on the web (returns []).
 */
export async function drainWorkoutCommands(): Promise<WorkoutCommand[]> {
  if (!Capacitor.isNativePlatform()) return [];
  const raw = await SharedStorage.get(QUEUE_KEY);
  if (!raw) return [];
  let parsed: RawCommand[] = [];
  try {
    parsed = JSON.parse(raw) as RawCommand[];
  } catch {
    // Bad payload — clear it so we don't loop on the same bad data.
    await SharedStorage.set(QUEUE_KEY, null);
    return [];
  }
  await SharedStorage.set(QUEUE_KEY, null);
  return parsed.flatMap(toCommand);
}

function toCommand(raw: RawCommand): WorkoutCommand[] {
  switch (raw.op) {
    case "complete_set":
      return [{ op: "complete_set", ts: raw.ts }];
    case "add_rest": {
      const seconds = raw.args?.seconds ?? 30;
      return [{ op: "add_rest", ts: raw.ts, args: { seconds } }];
    }
    case "skip_rest":
      return [{ op: "skip_rest", ts: raw.ts }];
    case "finish":
      return [{ op: "finish", ts: raw.ts }];
    default:
      return [];
  }
}

type SubscribeOpts = {
  /** Called whenever new commands are drained. */
  onCommands: (cmds: WorkoutCommand[]) => void;
  /** Poll interval in ms while the app is foregrounded. Defaults to 2s. */
  pollIntervalMs?: number;
};

/**
 * Subscribe to the workout command queue. Drains on:
 *   • Initial mount
 *   • App.appStateChange → active (foreground)
 *   • Every `pollIntervalMs` while the page is mounted
 *
 * Returns an unsubscribe function. No-op on the web.
 */
export function subscribeWorkoutCommands(opts: SubscribeOpts): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  const interval = opts.pollIntervalMs ?? 2000;
  let cancelled = false;

  const tick = async () => {
    if (cancelled) return;
    const cmds = await drainWorkoutCommands();
    if (cmds.length > 0 && !cancelled) opts.onCommands(cmds);
  };

  void tick();
  const intervalId = window.setInterval(tick, interval);

  let removeStateListener: (() => void) | null = null;
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void tick();
  }).then((handle) => {
    removeStateListener = () => {
      void handle.remove();
    };
    if (cancelled) removeStateListener();
  });

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
    removeStateListener?.();
  };
}
