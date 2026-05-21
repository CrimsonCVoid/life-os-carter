"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useStore } from "@/store";
import { useDay } from "@/components/today/day-context";
import { computePillars, type PillarSnapshot } from "@/lib/pillars";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Whoop-style three-pillar tier — Recovery / Strain / Sleep.
 *
 * Sits directly under the Readiness hero so the composite score lands first
 * and the per-pillar drill-downs follow. Each tile is tappable and links
 * into the page that owns that pillar's deeper history.
 */
export function PillarTiles() {
  const { date, isFuture } = useDay();
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);

  const pillars = React.useMemo(
    () => computePillars({ health, liftSessions, today: date }),
    [health, liftSessions, date]
  );

  if (isFuture) return null;

  return (
    <section aria-label="Pillars">
      <div className="grid grid-cols-3 gap-2">
        <PillarTile pillar={pillars.recovery} href="/stats" index={0} />
        <PillarTile pillar={pillars.strain} href="/gym" index={1} />
        <PillarTile pillar={pillars.sleep} href="/stats" index={2} />
      </div>
    </section>
  );
}

const PILLAR_TONE: Record<PillarSnapshot["key"], { base: string; soft: string }> = {
  recovery: { base: "var(--pillar-recovery)", soft: "var(--pillar-recovery-soft)" },
  strain: { base: "var(--pillar-strain)", soft: "var(--pillar-strain-soft)" },
  sleep: { base: "var(--pillar-sleep)", soft: "var(--pillar-sleep-soft)" },
};

function PillarTile({
  pillar,
  href,
  index,
}: {
  pillar: PillarSnapshot;
  href: string;
  index: number;
}) {
  const tone = PILLAR_TONE[pillar.key];
  const empty = pillar.value == null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: index * 0.04,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Link
        href={href}
        onClick={() => haptic("tap")}
        className={cn(
          "relative block overflow-hidden rounded-2xl p-3 h-[132px]",
          "border bg-[var(--color-card)]",
          "transition-transform duration-[80ms] ease-out active:scale-[0.98]"
        )}
        style={{
          background: empty
            ? "var(--color-card)"
            : `linear-gradient(160deg, color-mix(in srgb, ${tone.base} 14%, var(--color-card)) 0%, var(--color-card) 70%)`,
          borderColor: empty
            ? "var(--color-stroke)"
            : `color-mix(in srgb, ${tone.base} 26%, var(--color-stroke))`,
        }}
      >
        <div className="flex items-center justify-between">
          <div
            className="text-[10px] uppercase tracking-[0.16em] font-semibold"
            style={{ color: empty ? "var(--color-fg-3)" : tone.base }}
          >
            {pillar.label}
          </div>
          {pillar.bracket && !empty && (
            <div
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
              style={{
                background: `color-mix(in srgb, ${tone.base} 14%, transparent)`,
                color: tone.base,
              }}
            >
              {pillar.bracket}
            </div>
          )}
        </div>

        <div className="mt-2">
          <div
            className="text-[26px] font-bold tnum tracking-tight leading-none"
            style={{ color: empty ? "var(--color-fg-3)" : "var(--color-fg)" }}
          >
            {pillar.display}
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-fg-3)] truncate">
            {pillar.subtitle}
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-2.5 h-[28px]">
          <Sparkline trend={pillar.trend} color={tone.base} />
        </div>
      </Link>
    </motion.div>
  );
}

function Sparkline({
  trend,
  color,
}: {
  trend: (number | null)[];
  color: string;
}) {
  const gradientId = React.useId();
  const W = 100;
  const H = 28;
  const padY = 3;

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
  const y = (v: number) =>
    H - padY - ((v - min) / span) * (H - padY * 2);

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
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
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
