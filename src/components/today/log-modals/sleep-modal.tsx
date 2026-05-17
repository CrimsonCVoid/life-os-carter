"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { useSelectedDate } from "../day-context";

/**
 * Returns "10:42pm" given a "HH:MM" wake time and decimal hours slept.
 * Bedtime = wakeTime - hours (wraps backwards into the previous day).
 */
function formatBedtime(wakeTime: string, hours: number): string | null {
  const [hStr, mStr] = wakeTime.split(":");
  const wh = parseInt(hStr, 10);
  const wm = parseInt(mStr, 10);
  if (!Number.isFinite(wh) || !Number.isFinite(wm)) return null;
  const wakeMins = wh * 60 + wm;
  const sleptMins = Math.round(hours * 60);
  let bedMins = wakeMins - sleptMins;
  // wrap backwards across midnight
  while (bedMins < 0) bedMins += 24 * 60;
  bedMins = bedMins % (24 * 60);
  const bh = Math.floor(bedMins / 60);
  const bm = bedMins % 60;
  const ampm = bh >= 12 ? "pm" : "am";
  const hh = bh % 12 || 12;
  return `${hh}:${bm.toString().padStart(2, "0")}${ampm}`;
}

export function SleepLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const date = useSelectedDate();
  const log = useStore((s) => s.health[date]);
  const setHealth = useStore((s) => s.setHealth);
  const recordOverride = useStore((s) => s.recordGoogleHealthManualOverride);

  const [hours, setHours] = React.useState(log?.sleepHours ?? 7.5);
  const [quality, setQuality] = React.useState(log?.sleepQuality ?? 7);
  const [wakeTime, setWakeTime] = React.useState(log?.wakeTime ?? "07:30");

  React.useEffect(() => {
    if (open) {
      setHours(log?.sleepHours ?? 7.5);
      setQuality(log?.sleepQuality ?? 7);
      setWakeTime(log?.wakeTime ?? "07:30");
    }
  }, [open, log]);

  const bedtime = formatBedtime(wakeTime, hours);

  const save = () => {
    setHealth(date, {
      sleepHours: hours,
      sleepQuality: quality,
      wakeTime,
    });
    recordOverride(date, "sleep");
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log sleep"
      description="How was last night?"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Hours</span>
            <span className="text-2xl font-semibold tnum">
              {hours.toFixed(1)}h
            </span>
          </div>
          <Slider
            value={hours}
            min={0}
            max={12}
            step={0.25}
            onChange={setHours}
            marks={[0, 4, 8, 12]}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Quality</span>
            <span className="text-2xl font-semibold tnum">{quality}/10</span>
          </div>
          <Slider
            value={quality}
            min={1}
            max={10}
            step={1}
            onChange={setQuality}
            marks={[1, 5, 10]}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="label">Wake-up time</span>
            {bedtime && (
              <span className="text-xs text-[var(--color-fg-2)] tnum">
                bed {bedtime}
              </span>
            )}
          </div>
          <Input
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
          />
          <div className="mt-1 text-[11px] text-[var(--color-fg-3)]">
            Bedtime is calculated from wake time minus hours slept.
          </div>
        </div>
      </div>
    </Modal>
  );
}
