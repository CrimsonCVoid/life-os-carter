"use client";

import * as React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Modal } from "@/components/ui/modal";
import { useStore } from "@/store";
import { lastNDates, todayStr, format, fromDateStr } from "@/lib/date";
import { metricHex } from "@/lib/metric-colors";
import { round1 } from "@/lib/utils";
import { computeSleepScore } from "./sleep-score";

type VitalKey = "steps" | "hrv" | "sleep";

const TITLES: Record<VitalKey, string> = {
  steps: "Steps",
  hrv: "HRV",
  sleep: "Sleep Score",
};

const UNITS: Record<VitalKey, string> = {
  steps: "",
  hrv: "ms",
  sleep: "/100",
};

const STEPS_GOAL = 10000;

export function VitalsDetailModal({
  vital,
  onClose,
}: {
  vital: VitalKey | null;
  onClose: () => void;
}) {
  const health = useStore((s) => s.health);

  const series = React.useMemo(() => {
    if (!vital) return [];
    return lastNDates(30).map((d) => {
      const log = health[d];
      let value: number | null = null;
      if (vital === "steps") value = log?.steps ?? null;
      else if (vital === "hrv") value = log?.heartRateVariability ?? null;
      else if (vital === "sleep") {
        if (log?.sleepHours) {
          value = computeSleepScore({
            sleepHours: log.sleepHours,
            sleepStages: log.sleepStages,
          })?.score ?? null;
        }
      }
      return { date: d, value };
    });
  }, [health, vital]);

  const stats = React.useMemo(() => {
    const vals = series.map((s) => s.value).filter((v): v is number => v != null);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const today = series[series.length - 1]?.value ?? null;

    let streak = 0;
    if (vital === "steps") {
      for (let i = series.length - 1; i >= 0; i--) {
        const v = series[i].value;
        if (v != null && v >= STEPS_GOAL) streak += 1;
        else break;
      }
    }
    return { avg, min, max, today, streak };
  }, [series, vital]);

  if (!vital) return null;

  const color = metricHex(vital === "sleep" ? "sleep" : vital === "hrv" ? "hrv" : "steps");
  const unit = UNITS[vital];

  return (
    <Modal open onClose={onClose} title={TITLES[vital]} size="lg" description="Last 30 days">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Avg" value={stats ? formatVal(stats.avg, vital) : "—"} unit={unit} />
          <Stat label="Min" value={stats ? formatVal(stats.min, vital) : "—"} unit={unit} />
          <Stat label="Max" value={stats ? formatVal(stats.max, vital) : "—"} unit={unit} />
        </div>

        {vital === "steps" && stats && (
          <div className="text-[12px] text-[var(--color-fg-2)]">
            Streak above {STEPS_GOAL.toLocaleString()}: <span className="tnum text-[var(--color-fg)]">{stats.streak} day{stats.streak === 1 ? "" : "s"}</span>
          </div>
        )}

        <div className="h-[220px] -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => format(fromDateStr(d), "M/d")}
                tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "var(--color-fg-3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-stroke-strong)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-stroke-strong)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-fg)",
                }}
                labelFormatter={(d) =>
                  typeof d === "string" ? format(fromDateStr(d), "EEE M/d") : String(d)
                }
                formatter={(v) =>
                  v == null || typeof v !== "number" ? "—" : `${formatVal(v, vital)}${unit}`
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card p-3">
      <div className="label">{label}</div>
      <div className="mt-1 tnum text-[20px] font-semibold text-[var(--color-fg)]">
        {value}
        {unit && value !== "—" && <span className="text-[12px] text-[var(--color-fg-3)] ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function formatVal(v: number, vital: VitalKey): string {
  if (vital === "steps") return Math.round(v).toLocaleString();
  if (vital === "hrv") return Math.round(v).toString();
  return Math.round(v).toString();
}

// avoid unused warning when round1 isn't used after future tweaks
void round1;
