"use client";

import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { BellRing, Smartphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import type { LocalRemindersSettings, LocalReminderSlot } from "@/lib/types";
import {
  ensureLocalNotificationPermission,
  formatSlotTime,
  getLocalNotificationPermissionState,
  reconcileLocalReminders,
} from "@/lib/native/local-notifications";

type SlotKey = keyof LocalRemindersSettings;

const SLOT_META: Array<{
  key: SlotKey;
  label: string;
  description: string;
}> = [
  {
    key: "morningBriefing",
    label: "Morning briefing",
    description: "Today's focus, sleep, and the plan Overseer drew up.",
  },
  {
    key: "hydrationMidday",
    label: "Hydration · midday",
    description: "Halfway-point nudge to log a glass.",
  },
  {
    key: "hydrationAfternoon",
    label: "Hydration · afternoon",
    description: "Second hydration nudge before dinner.",
  },
  {
    key: "eveningReflection",
    label: "Evening reflection",
    description: "Two-minute journal close before bed.",
  },
  {
    key: "habitCheckin",
    label: "Habit check-in",
    description: "Quick pass on today's habits before the day ends.",
  },
];

/**
 * Local notifications card. Device-scheduled, fires offline, doesn't
 * touch the server. iOS-only effect (web shell shows an info note).
 *
 * Whenever any toggle or time changes, the slot set is reconciled with
 * iOS — old schedules cancelled, new ones installed. Idempotent.
 */
export function LocalRemindersCard() {
  const settings = useStore((s) => s.settings.localReminders);
  const updateSettings = useStore((s) => s.updateSettings);

  const [permState, setPermState] = React.useState<
    "granted" | "denied" | "prompt" | "unsupported"
  >("prompt");

  React.useEffect(() => {
    void getLocalNotificationPermissionState().then(setPermState);
  }, []);

  const isNative = Capacitor.isNativePlatform();

  const updateSlot = React.useCallback(
    async (key: SlotKey, patch: Partial<LocalReminderSlot>) => {
      const next: LocalRemindersSettings = {
        ...settings,
        [key]: { ...settings[key], ...patch },
      };
      updateSettings({ localReminders: next });
      if (isNative) {
        if (patch.enabled === true && permState !== "granted") {
          const granted = await ensureLocalNotificationPermission();
          setPermState(granted ? "granted" : "denied");
          if (!granted) return;
        }
        await reconcileLocalReminders(next);
      }
    },
    [settings, updateSettings, isNative, permState]
  );

  const requestPermission = async () => {
    haptic("tap");
    const granted = await ensureLocalNotificationPermission();
    setPermState(granted ? "granted" : "denied");
    if (granted) await reconcileLocalReminders(settings);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <BellRing size={15} className="inline mr-1.5 -mt-0.5" />
          Device reminders
        </CardTitle>
      </CardHeader>
      <div className="px-4 pb-4 space-y-3">
        {!isNative ? (
          <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3.5 py-3 flex items-start gap-2.5">
            <Smartphone size={15} className="text-[var(--color-fg-3)] mt-0.5 shrink-0" />
            <div className="text-xs text-[var(--color-fg-2)] leading-relaxed">
              These reminders fire on-device, offline, even when the app
              is closed — they require the installed iOS app. Open Life
              OS on iPhone to enable them.
            </div>
          </div>
        ) : permState === "denied" ? (
          <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3.5 py-3 text-xs text-[var(--color-warning)] leading-relaxed">
            Notifications are blocked at the system level. Open Settings →
            Notifications → Life OS and enable Allow Notifications.
          </div>
        ) : permState === "prompt" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3.5 py-3">
            <div className="text-xs text-[var(--color-fg-2)] leading-relaxed">
              Allow notifications to schedule your morning briefing,
              hydration nudges, and evening reflection.
            </div>
            <Button size="sm" onClick={requestPermission}>
              Allow
            </Button>
          </div>
        ) : null}

        <div className="divide-y divide-[var(--color-stroke)] -mx-1">
          {SLOT_META.map((meta) => {
            const slot = settings[meta.key];
            return (
              <div
                key={meta.key}
                className="flex items-center justify-between gap-3 py-2.5 px-1"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-[11px] text-[var(--color-fg-3)] mt-0.5 leading-snug">
                    {meta.description}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TimeField
                    slot={slot}
                    disabled={!slot.enabled}
                    onChange={(hour, minute) =>
                      void updateSlot(meta.key, { hour, minute })
                    }
                  />
                  <Toggle
                    checked={slot.enabled}
                    onChange={(v) => void updateSlot(meta.key, { enabled: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function TimeField({
  slot,
  disabled,
  onChange,
}: {
  slot: LocalReminderSlot;
  disabled?: boolean;
  onChange: (hour: number, minute: number) => void;
}) {
  const value = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{formatSlotTime(slot)}</span>
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) onChange(h, m);
        }}
        className="no-zoom tnum text-[12px] text-[var(--color-fg)] bg-[var(--color-elevated)] border border-[var(--color-stroke)] rounded-lg px-2 py-1.5 outline-none disabled:opacity-40"
      />
    </label>
  );
}
