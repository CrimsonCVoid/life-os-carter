"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { computeReadiness, type ReadinessResult } from "@/lib/readiness";
import { computePillars, type PillarSnapshot } from "@/lib/pillars";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * Composite WHOOP-style hero: the daily Readiness score plus the three
 * pillar metrics (Recovery / Strain / Sleep) in one elevated frame, tinted
 * by the readiness bracket. Replaces the previously separate ReadinessHero
 * + PillarTiles stack so the top of the screen reads as one thing.
 */
export function DashboardHero() {
  const date = todayStr();
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);

  const readiness = React.useMemo<ReadinessResult>(
    () => computeReadiness({ health, liftSessions, today: date, waterTargetOz }),
    [health, liftSessions, date, waterTargetOz]
  );

  const pillars = React.useMemo(
    () => computePillars({ health, liftSessions, today: date }),
    [health, liftSessions, date]
  );

  const tone = bracketColor(readiness.bracket);
  const unknown = readiness.bracket === "unknown";

  return (
    <button
      type="button"
      onClick={() => haptic("tap")}
      className={cn(
        "relative w-full overflow-hidden rounded-[28px] text-left",
        "border bg-[var(--color-card)]",
        "transition-transform duration-[80ms] ease-out active:scale-[0.99]"
      )}
      style={{
        background: unknown
          ? "var(--color-card)"
          : `radial-gradient(140% 100% at 85% -10%, color-mix(in srgb, ${tone} 22%, transparent) 0%, var(--color-card) 55%)`,
        borderColor: `color-mix(in srgb, ${tone} 32%, var(--color-stroke))`,
        boxShadow: unknown
          ? "var(--shadow-card)"
          : `inset 0 1px 0 0 rgba(255,255,255,0.04), 0 8px 32px -16px color-mix(in srgb, ${tone} 50%, #000), var(--shadow-card)`,
      }}
    >
      {/* Top — composite readiness score */}
      <div className="flex items-center gap-5 p-5">
        <ReadinessRing value={readiness.score} color={tone} unknown={unknown} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.18em] font-semibold"
            style={{ color: tone }}
          >
            {bracketLabel(readiness.bracket)}
          </div>
          <div className="mt-1 text-[15px] text-[var(--color-fg)] leading-snug">
            {readiness.headline}
          </div>
        </div>
      </div>

      {/* Bottom — three pillars in one row */}
      <div
        className="grid grid-cols-3 border-t"
        style={{
          borderColor: `color-mix(in srgb, ${tone} 18%, var(--color-stroke))`,
        }}
      >
        <PillarCell pillar={pillars.recovery} />
        <DividerCell tone={tone} />
        <PillarCell pillar={pillars.strain} />
        <DividerCell tone={tone} />
        <PillarCell pillar={pillars.sleep} />
      </div>
    </button>
  );
}

const PILLAR_TONE: Record<PillarSnapshot["key"], string> = {
  recovery: "var(--pillar-recovery)",
  strain: "var(--pillar-strain)",
  sleep: "var(--pillar-sleep)",
};

function PillarCell({ pillar }: { pillar: PillarSnapshot }) {
  const tone = PILLAR_TONE[pillar.key];
  const empty = pillar.value == null;

  return (
    <div className="col-span-1 px-3 py-3.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: empty ? "var(--color-fg-3)" : tone }}
        />
        <span
          className="text-[10px] uppercase tracking-[0.14em] font-semibold truncate"
          style={{ color: empty ? "var(--color-fg-3)" : tone }}
        >
          {pillar.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="text-[22px] font-bold tnum leading-none tracking-tight"
          style={{ color: empty ? "var(--color-fg-3)" : "var(--color-fg)" }}
        >
          {pillar.display}
        </span>
        {pillar.bracket && !empty && (
          <span
            className="text-[9px] uppercase tracking-wider font-semibold leading-none"
            style={{ color: `color-mix(in srgb, ${tone} 85%, white)` }}
          >
            {pillar.bracket}
          </span>
        )}
      </div>
      <div className="mt-2 h-[22px]">
        <PillarSparkline trend={pillar.trend} color={tone} />
      </div>
    </div>
  );
}

function DividerCell({ tone }: { tone: string }) {
  return (
    <div
      aria-hidden
      className="col-span-0 w-px self-stretch my-3 hidden"
      style={{ background: `color-mix(in srgb, ${tone} 16%, var(--color-stroke))` }}
    />
  );
}

function PillarSparkline({
  trend,
  color,
}: {
  trend: (number | null)[];
  color: string;
}) {
  const gradientId = React.useId();
  const W = 100;
  const H = 22;
  const padY = 2;

  const points = trend.map((v, i) => ({
    x: trend.length === 1 ? W / 2 : (i / (trend.length - 1)) * W,
    v,
  }));

  const values = trend.filter((n): n is number => n != null);
  if (values.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
        <line
          x1={0}
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke="var(--color-stroke-strong)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => H - padY - ((v - min) / span) * (H - padY * 2);

  const segments: string[] = [];
  let current = "";
  for (const p of points) {
    if (p.v == null) {
      if (current) {
        segments.push(current);
        current = "";
      }
      continue;
    }
    const cmd = current ? "L" : "M";
    current += `${cmd}${p.x.toFixed(2)} ${y(p.v).toFixed(2)} `;
  }
  if (current) segments.push(current);

  const linePath = segments.join("");
  const firstX = points.find((p) => p.v != null)?.x ?? 0;
  const lastX = [...points].reverse().find((p) => p.v != null)?.x ?? W;
  const areaPath = `${linePath} L${lastX.toFixed(2)} ${H} L${firstX.toFixed(2)} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) =>
        p.v == null ? null : i === points.length - 1 ? (
          <circle key={i} cx={p.x} cy={y(p.v)} r={2.2} fill={color} />
        ) : null
      )}
    </svg>
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
  const SIZE = 110;
  const STROKE = 10;
  const r = SIZE / 2 - STROKE / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = unknown ? 0 : Math.max(0, Math.min(1, value / 100));
  const offset = c * (1 - pct);
  const gid = React.useId();

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={1} />
            <stop
              offset="100%"
              stopColor={`color-mix(in srgb, ${color} 60%, white)`}
              stopOpacity={1}
            />
          </linearGradient>
        </defs>
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
          stroke={`url(#${gid})`}
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
            className="text-[42px] font-bold tnum tracking-tight leading-none"
            style={{ color: unknown ? "var(--color-fg-3)" : "var(--color-fg)" }}
          >
            {unknown ? "—" : value}
          </div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--color-fg-3)] mt-1">
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
