"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type ScheduleOptions } from "@capacitor/local-notifications";
import type { LocalRemindersSettings, LocalReminderSlot } from "@/lib/types";

/**
 * Device-scheduled local notifications. Backed by Apple's
 * UserNotifications framework on iOS — fires even when the app is
 * closed, killed, or offline. All scheduling happens device-side; no
 * server involvement.
 *
 * The scheduler is fully declarative: callers pass the current
 * LocalRemindersSettings and the helpers wipe + re-install the iOS
 * notification request set to match. Idempotent on every call.
 */

type SlotKey = keyof LocalRemindersSettings;

// Notification IDs are stable per slot so re-scheduling overwrites
// rather than stacking. Range 1000-1999 is reserved for local reminders.
const SLOT_IDS: Record<SlotKey, number> = {
  morningBriefing:    1001,
  hydrationMidday:    1002,
  hydrationAfternoon: 1003,
  eveningReflection:  1004,
  habitCheckin:       1005,
};

type SlotCopy = {
  title: string;
  body: string;
};

const SLOT_COPY: Record<SlotKey, SlotCopy> = {
  morningBriefing: {
    title: "Morning briefing",
    body: "Tap to see today's focus, sleep, and the plan Overseer drew up.",
  },
  hydrationMidday: {
    title: "Hydration check",
    body: "Halfway through the day — log a glass and stay on target.",
  },
  hydrationAfternoon: {
    title: "Hydration check",
    body: "Afternoon water nudge — keep the streak.",
  },
  eveningReflection: {
    title: "Evening reflection",
    body: "Two minutes of journal closes the loop and unlocks tomorrow's brief.",
  },
  habitCheckin: {
    title: "Habit check-in",
    body: "Quick pass on today's habits before the day ends.",
  },
};

function active(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensureLocalNotificationPermission(): Promise<boolean> {
  if (!active()) return false;
  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === "granted";
}

export async function getLocalNotificationPermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unsupported"
> {
  if (!active()) return "unsupported";
  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return "granted";
  if (status.display === "denied") return "denied";
  return "prompt";
}

/**
 * Wipe + re-schedule every slot in the given settings.
 *
 * - Disabled slots are cancelled.
 * - Enabled slots are scheduled at hour:minute repeating daily.
 *
 * iOS treats the schedule.on { hour, minute } shape with `repeats: true`
 * as a calendar-based repeating trigger that fires at the next matching
 * wall-clock time and every day after. No further calls required.
 */
export async function reconcileLocalReminders(
  settings: LocalRemindersSettings
): Promise<void> {
  if (!active()) return;
  const granted = await ensureLocalNotificationPermission();
  if (!granted) return;

  // Cancel everything in our reserved range first — guarantees no
  // stale schedules from a previous session linger.
  await LocalNotifications.cancel({
    notifications: Object.values(SLOT_IDS).map((id) => ({ id })),
  }).catch(() => {});

  const toSchedule: ScheduleOptions["notifications"] = [];
  for (const key of Object.keys(SLOT_IDS) as SlotKey[]) {
    const slot = settings[key];
    if (!slot.enabled) continue;
    const copy = SLOT_COPY[key];
    toSchedule.push({
      id: SLOT_IDS[key],
      title: copy.title,
      body: copy.body,
      schedule: {
        on: { hour: slot.hour, minute: slot.minute },
        repeats: true,
        allowWhileIdle: true,
      },
      // Group same-purpose notifications (e.g. the two hydration slots)
      // into one notification thread on the Lock Screen.
      threadIdentifier: key.startsWith("hydration") ? "hydration" : key,
    });
  }

  if (toSchedule.length === 0) return;
  await LocalNotifications.schedule({ notifications: toSchedule }).catch((err) => {
    // Best-effort; if iOS rejects (e.g. permission revoked mid-session),
    // surface nothing — the Settings UI will reflect on next visit.
    console.warn("[local-notifications] schedule failed", err);
  });
}

/** Cancel every slot. Used when the user toggles the master kill switch. */
export async function cancelAllLocalReminders(): Promise<void> {
  if (!active()) return;
  await LocalNotifications.cancel({
    notifications: Object.values(SLOT_IDS).map((id) => ({ id })),
  }).catch(() => {});
}

export function formatSlotTime(slot: LocalReminderSlot): string {
  const d = new Date();
  d.setHours(slot.hour, slot.minute, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
