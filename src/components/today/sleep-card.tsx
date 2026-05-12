"use client";

import * as React from "react";
import { Moon, Plus, Sunrise } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { metricColors } from "@/lib/metric-colors";
import { SleepLogModal } from "./log-modals/sleep-modal";
import { useSelectedDate } from "./day-context";

function formatBedtime(wakeTime: string, hours: number): string | null {
  const [hStr, mStr] = wakeTime.split(":");
  const wh = parseInt(hStr, 10);
  const wm = parseInt(mStr, 10);
  if (!Number.isFinite(wh) || !Number.isFinite(wm)) return null;
  let bedMins = wh * 60 + wm - Math.round(hours * 60);
  while (bedMins < 0) bedMins += 24 * 60;
  bedMins = bedMins % (24 * 60);
  const bh = Math.floor(bedMins / 60);
  const bm = bedMins % 60;
  const ampm = bh >= 12 ? "pm" : "am";
  const hh = bh % 12 || 12;
  return `${hh}:${bm.toString().padStart(2, "0")}${ampm}`;
}

function formatWake(wakeTime: string): string {
  const [hStr, mStr] = wakeTime.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return wakeTime;
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function SleepCard() {
  const date = useSelectedDate();
  const log = useStore((s) => s.health[date]);
  const [open, setOpen] = React.useState(false);

  const c = metricColors("sleep");
  const logged = log?.sleepHours != null;
  const bedtime =
    log?.wakeTime && log.sleepHours != null
      ? formatBedtime(log.wakeTime, log.sleepHours)
      : null;

  return (
    <>
      <Card
        style={
          logged
            ? {
                borderColor: `color-mix(in srgb, ${c.base} 26%, transparent)`,
              }
            : undefined
        }
      >
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-1.5">
              <Moon
                size={14}
                style={{ color: logged ? c.base : "var(--color-fg-3)" }}
              />
              Sleep
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant={logged ? "secondary" : "primary"}
            onClick={() => {
              haptic("tap");
              setOpen(true);
            }}
          >
            <Plus size={12} />
            {logged ? "Edit" : "Log"}
          </Button>
        </CardHeader>

        {logged ? (
          <div className="grid grid-cols-3 gap-3">
            <SleepStat
              label="Hours"
              value={`${round1(log!.sleepHours!)}h`}
              tint={c.base}
              soft={c.soft}
            />
            <SleepStat
              label="Quality"
              value={
                log?.sleepQuality != null ? `${log.sleepQuality}/10` : "—"
              }
              tint={c.base}
              soft={c.soft}
            />
            <SleepStat
              label="Wake"
              value={log?.wakeTime ? formatWake(log.wakeTime) : "—"}
              tint={c.base}
              soft={c.soft}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full py-5 rounded-xl border border-dashed border-[var(--color-stroke-strong)] text-xs text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:border-[var(--color-fg-3)] transition inline-flex items-center justify-center gap-1.5"
          >
            <Moon size={14} />
            Tap to log last night's sleep
          </button>
        )}

        {bedtime && logged && (
          <div
            className="mt-3 inline-flex items-center gap-1.5 text-[11px]"
            style={{ color: c.base }}
          >
            <Sunrise size={11} />
            <span className="tnum">Bedtime ~{bedtime}</span>
            <span className="text-[var(--color-fg-3)]">
              (wake − hours slept)
            </span>
          </div>
        )}
      </Card>

      <SleepLogModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SleepStat({
  label,
  value,
  tint,
  soft,
}: {
  label: string;
  value: string;
  tint: string;
  soft: string;
}) {
  return (
    <div
      className="rounded-xl border p-2.5"
      style={{
        background: soft,
        borderColor: `color-mix(in srgb, ${tint} 18%, transparent)`,
      }}
    >
      <div
        className="label text-[9px]"
        style={{ color: tint, opacity: 0.85 }}
      >
        {label}
      </div>
      <div
        className="text-base font-semibold tnum mt-1"
        style={{ color: tint }}
      >
        {value}
      </div>
    </div>
  );
}
