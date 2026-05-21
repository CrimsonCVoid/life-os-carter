"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { computeReadiness, type ReadinessResult } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * Whoop-style daily readiness hero.
 *
 * Big circular score (0-100), bracket-tinted (green/yellow/red), with a
 * one-line headline and 4 small dimension breakdowns underneath. Tap the
 * score to expand a detail sheet (TODO — for now just haptic).
 */
export function ReadinessHero() {
  const date = todayStr();
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);

  const result = React.useMemo<ReadinessResult>(
    () =>
      computeReadiness({
        health,
        liftSessions,
        today: date,
        waterTargetOz,
      }),
    [health, liftSessions, date, waterTargetOz]
  );

  const tone = bracketColor(result.bracket);
  const unknown = result.bracket === "unknown";

  return (
    <button
      type="button"
      onClick={() => haptic("tap")}
      className={cn(
        "relative w-full overflow-hidden rounded-[28px] p-5",
        "bg-[var(--color-card)] border border-[var(--color-stroke)]",
        "text-left active:scale-[0.99] transition-transform duration-[80ms] ease-out"
      )}
      style={{
        background: unknown
          ? "var(--color-card)"
          : `radial-gradient(120% 80% at 80% -10%, color-mix(in srgb, ${tone} 22%, transparent), var(--color-card) 60%)`,
        borderColor: `color-mix(in srgb, ${tone} 28%, var(--color-stroke))`,
      }}
    >
      <div className="flex items-center gap-5">
        <ReadinessRing
          value={result.score}
          color={tone}
          unknown={unknown}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.18em] font-semibold"
            style={{ color: tone }}
          >
            {bracketLabel(result.bracket)}
          </div>
          <div className="mt-0.5 text-[14px] text-[var(--color-fg)] leading-snug">
            {result.headline}
          </div>
        </div>
      </div>

      {result.dimensions.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--color-stroke)] grid grid-cols-2 gap-y-2 gap-x-3">
          {result.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-2 min-w-0">
              <div
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: dimensionTone(d.key) }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] leading-none">
                  {d.label}
                </div>
                <div className="text-[12px] truncate text-[var(--color-fg-2)] tnum">
                  {d.score}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function ReadinessRing({
  value,
  color,
  unknown,
}: {
  value: number;
  color: string;
  unknown: boolean;
}) {
  const SIZE = 96;
  const STROKE = 9;
  const r = SIZE / 2 - STROKE / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = unknown ? 0 : Math.max(0, Math.min(1, value / 100));
  const offset = c * (1 - pct);

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={0.16}
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{
            transition: "stroke-dashoffset 600ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div
            className="text-[34px] font-bold tnum tracking-tight leading-none"
            style={{ color: unknown ? "var(--color-fg-3)" : "var(--color-fg)" }}
          >
            {unknown ? "—" : value}
          </div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--color-fg-3)] mt-0.5">
            Readiness
          </div>
        </div>
      </div>
    </div>
  );
}

function bracketColor(b: ReadinessResult["bracket"]): string {
  switch (b) {
    case "optimal":
      return "var(--readiness-optimal)";
    case "green":
      return "var(--readiness-green)";
    case "yellow":
      return "var(--readiness-yellow)";
    case "red":
      return "var(--readiness-red)";
    case "unknown":
    default:
      return "var(--color-fg-3)";
  }
}

function bracketLabel(b: ReadinessResult["bracket"]): string {
  switch (b) {
    case "optimal":
      return "Optimal";
    case "green":
      return "Recovered";
    case "yellow":
      return "Moderate";
    case "red":
      return "Rest";
    case "unknown":
    default:
      return "No data";
  }
}

function dimensionTone(key: string): string {
  switch (key) {
    case "sleep":
      return "var(--pillar-sleep)";
    case "recovery":
      return "var(--pillar-recovery)";
    case "strain":
      return "var(--pillar-strain)";
    case "habits":
    default:
      return "var(--color-fg-2)";
  }
}
