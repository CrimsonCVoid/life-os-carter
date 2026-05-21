"use client";

import * as React from "react";
import { Droplet, Footprints, Moon, Plus } from "lucide-react";
import { useStore } from "@/store";
import { InlineEdit } from "@/components/ui/inline-edit";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Close-the-rings dashboard. Three rings, Apple Health-style:
 *   - Hydration: today's water vs settings.waterTargetOz
 *   - Movement:  today's steps  vs 10,000
 *   - Recovery:  last night's sleep vs 8h
 *
 * Tap a ring → opens its inline log. Long-press → opens the full modal.
 *
 * The whole component is a single SVG so the three rings nest concentrically
 * with the right outer→inner stacking and look like one cohesive dial.
 */

const STEP_TARGET = 10_000;
const SLEEP_TARGET_HOURS = 8;

export function ActivityRings() {
  const date = todayStr();
  const setHealth = useStore((s) => s.setHealth);
  const log = useStore((s) => s.health[date]);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);

  const water = log?.waterOz ?? 0;
  const steps = log?.steps ?? 0;
  const sleepHours = log?.sleepHours ?? 0;

  const waterPct = clamp01(water / Math.max(1, waterTargetOz));
  const stepsPct = clamp01(steps / STEP_TARGET);
  const sleepPct = clamp01(sleepHours / SLEEP_TARGET_HOURS);

  // SVG concentric rings only need color + pct. The right-side RingRows
  // own the rest of the metric UI.
  const rings = [
    { key: "hydration", pct: waterPct, color: "var(--mc-water)" },
    { key: "movement", pct: stepsPct, color: "var(--mc-steps)" },
    { key: "recovery", pct: sleepPct, color: "var(--mc-sleep)" },
  ];

  const editWater = (next: string) => {
    const n = parseFloat(next);
    setHealth(date, { waterOz: Number.isFinite(n) ? Math.max(0, n) : 0 });
    haptic("soft");
  };
  const editSteps = (next: string) => {
    const n = parseInt(next.replace(/,/g, ""), 10);
    setHealth(date, { steps: Number.isFinite(n) ? Math.max(0, n) : 0 });
    haptic("soft");
  };

  return (
    <div className="rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-card)] p-3">
      <div className="flex items-center gap-4">
        <ConcentricRings rings={rings} />
        <div className="flex-1 grid grid-cols-1 gap-2">
          {/* Hydration row — inline-edit oz + dedicated +16 quick button */}
          <RingRow
            color="var(--mc-water)"
            icon={<Droplet size={13} fill="currentColor" />}
            label="Water"
            pct={waterPct}
            inline={
              <InlineEdit
                value={String(water)}
                onCommit={editWater}
                unit="oz"
                inputMode="numeric"
                step={1}
                min={0}
                className="text-[15px] font-semibold"
                aria-label="Water in ounces"
                treatZeroAsEmpty
              />
            }
            sideAction={{
              icon: <Plus size={12} />,
              ariaLabel: "Add 16oz",
              onPress: () => {
                setHealth(date, { waterOz: water + 16 });
                haptic("tap");
              },
            }}
          />

          {/* Steps — inline-editable count. Synced sources will overwrite
              unless the user just hand-edited. */}
          <RingRow
            color="var(--mc-steps)"
            icon={<Footprints size={13} />}
            label="Steps"
            pct={stepsPct}
            inline={
              <InlineEdit
                value={String(steps)}
                onCommit={editSteps}
                inputMode="numeric"
                step={100}
                min={0}
                className="text-[15px] font-semibold"
                aria-label="Steps count"
                treatZeroAsEmpty
              />
            }
          />

          {/* Sleep — read-only. Fitbit / Google Health sync owns this metric;
              we don't want a manual override surface that drifts from device data. */}
          <RingRow
            color="var(--mc-sleep)"
            icon={<Moon size={13} />}
            label="Sleep"
            pct={sleepPct}
            inline={
              <span className={cn("tnum", sleepHours <= 0 && "text-[var(--color-fg-3)]")}>
                <span className="text-[15px] font-semibold">
                  {sleepHours > 0 ? sleepHours.toFixed(1) : "—"}
                </span>
                {sleepHours > 0 && (
                  <span className="text-[11px] text-[var(--color-fg-3)] ml-0.5">h</span>
                )}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}

function RingRow({
  color,
  icon,
  label,
  pct,
  inline,
  sideAction,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  pct: number;
  inline: React.ReactNode;
  sideAction?: { icon: React.ReactNode; ariaLabel: string; onPress: () => void };
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-6 w-6 grid place-items-center rounded-full shrink-0"
        style={{
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] leading-none">
          {label}
        </div>
        <div className="flex items-baseline gap-1 mt-0.5">
          {inline}
          <span className="text-[10px] text-[var(--color-fg-3)] ml-auto tnum">
            {Math.round(pct * 100)}%
          </span>
        </div>
      </div>
      {sideAction && (
        <button
          type="button"
          aria-label={sideAction.ariaLabel}
          onClick={sideAction.onPress}
          className={cn(
            "h-7 w-7 grid place-items-center rounded-full shrink-0",
            "bg-[var(--color-elevated)] border border-[var(--color-stroke)]",
            "text-[var(--color-fg-2)] active:scale-[0.92]",
            "transition-transform duration-[60ms]"
          )}
        >
          {sideAction.icon}
        </button>
      )}
    </div>
  );
}

function ConcentricRings({
  rings,
}: {
  rings: Array<{ key: string; pct: number; color: string }>;
}) {
  // 3 nested rings — outer first (largest radius). 90×90 viewBox.
  const SIZE = 110;
  const CENTER = SIZE / 2;
  const STROKE = 10;
  const GAP = 3;
  // Outer radius = (SIZE/2) - stroke/2 - small margin.
  const radii = [
    CENTER - STROKE / 2 - 2,
    CENTER - STROKE - GAP - STROKE / 2 - 2,
    CENTER - (STROKE + GAP) * 2 - STROKE / 2 - 2,
  ];

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      // GPU layer so the dash transition is compositor-driven.
      style={{ transform: "translateZ(0)" }}
    >
      {rings.map((r, i) => {
        const radius = radii[i];
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - r.pct);
        return (
          <g key={r.key}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={radius}
              fill="none"
              stroke={r.color}
              strokeOpacity={0.18}
              strokeWidth={STROKE}
            />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={radius}
              fill="none"
              stroke={r.color}
              strokeWidth={STROKE}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              style={{
                transition: "stroke-dashoffset 480ms cubic-bezier(0.32, 0.72, 0, 1)",
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

