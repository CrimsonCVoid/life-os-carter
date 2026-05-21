"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Droplets, Footprints } from "lucide-react";
import { useDay } from "@/components/today/day-context";
import { useMealsForDate } from "@/lib/hooks/use-meals";
import { useWater, useStepsRange } from "@/lib/hooks/use-metrics";
import { useStore } from "@/store";
import { computeMacroProgress, type MacroProgress } from "@/lib/macro-progress";
import { metricColors } from "@/lib/metric-colors";
import { cn } from "@/lib/utils";
import type { Meal } from "@/lib/types";

/**
 * Whoop-style composite Fuel card. Combines what used to be MacroRings +
 * ActivityRings into one frame:
 *   - Big calories ring on the left
 *   - Single stacked-segment macro bar on the right (P / C / F) with legend
 *   - Water row + Steps row stacked beneath
 *
 * Hides when there are no macro targets set AND no meals logged AND no
 * water/steps activity — empty surfaces add noise, not signal.
 */
export function FuelCard() {
  const { date, isFuture } = useDay();
  const { meals: mealRows } = useMealsForDate(date);
  const { water } = useWater(date);
  const stepsRange = useStepsRange(date, date);
  const macroTargets = useStore((s) => s.settings.macroTargets);
  const waterTargetOz = useStore((s) => s.settings.waterTargetOz);

  const stepsToday = React.useMemo<number>(() => {
    const data = stepsRange.data as Array<{ date: string; count?: number }> | undefined;
    const row = data?.find((r) => r?.date === date);
    return row?.count ?? 0;
  }, [stepsRange.data, date]);

  // MealRow → Meal shape conversion for the macro-progress helper. The
  // function only reads calories/protein/carbs/fat/fiber so the cast is safe.
  const progress = React.useMemo<MacroProgress[]>(() => {
    if (!macroTargets) return [];
    return computeMacroProgress({
      meals: mealRows as unknown as Meal[],
      date,
      targets: macroTargets,
    });
  }, [mealRows, date, macroTargets]);

  const calories = progress.find((p) => p.metric === "calories");
  const protein = progress.find((p) => p.metric === "protein");
  const carbs = progress.find((p) => p.metric === "carbs");
  const fat = progress.find((p) => p.metric === "fat");

  const macroMacros = [protein, carbs, fat].filter(Boolean) as MacroProgress[];
  const totalMacroGrams = macroMacros.reduce((a, m) => a + m.current, 0);

  const waterOz = water?.oz ?? 0;
  const stepsTarget = 10000;

  if (isFuture) return null;

  const hasAny =
    progress.length > 0 ||
    mealRows.length > 0 ||
    waterOz > 0 ||
    stepsToday > 0;
  if (!hasAny) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="card p-4"
    >
      <div className="label mb-3">Fuel</div>

      <div className="grid grid-cols-[112px_1fr] gap-4 items-start">
        <CaloriesRing
          current={calories?.current ?? 0}
          target={calories?.target ?? 0}
        />

        <div className="min-w-0 space-y-2">
          {macroMacros.length > 0 ? (
            <MacroStackedBar macros={macroMacros} totalGrams={totalMacroGrams} />
          ) : (
            <div className="text-[11px] text-[var(--color-fg-3)]">
              Add protein / carbs / fat targets in Settings to see macro progress.
            </div>
          )}

          <ProgressRow
            icon={<Droplets size={13} />}
            label="Water"
            value={`${Math.round(waterOz)}`}
            unit="oz"
            current={waterOz}
            target={waterTargetOz}
            color={metricColors("water").base}
          />
          <ProgressRow
            icon={<Footprints size={13} />}
            label="Steps"
            value={`${stepsToday.toLocaleString()}`}
            unit=""
            current={stepsToday}
            target={stepsTarget}
            color={metricColors("steps").base}
          />
        </div>
      </div>
    </motion.div>
  );
}

function CaloriesRing({ current, target }: { current: number; target: number }) {
  const SIZE = 112;
  const STROKE = 9;
  const r = SIZE / 2 - STROKE / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.max(0, Math.min(1.2, current / target)) : 0;
  const offset = c * (1 - Math.min(1, pct));
  const over = pct > 1.05;
  const gid = React.useId();
  const colors = metricColors("calories");

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.base} stopOpacity={1} />
            <stop offset="100%" stopColor={colors.light} stopOpacity={1} />
          </linearGradient>
        </defs>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={colors.soft}
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--color-warning)" : `url(#${gid})`}
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
          <div className="text-[24px] font-bold tnum leading-none text-[var(--color-fg)]">
            {Math.round(current)}
          </div>
          {target > 0 ? (
            <div className="text-[10px] text-[var(--color-fg-3)] mt-1 tnum">
              / {Math.round(target)} kcal
            </div>
          ) : (
            <div className="text-[10px] text-[var(--color-fg-3)] mt-1 uppercase tracking-wider">
              kcal
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MacroStackedBar({
  macros,
  totalGrams,
}: {
  macros: MacroProgress[];
  totalGrams: number;
}) {
  // Combined target = max(sum of targets, actual). Segments are scaled by
  // grams; legend chips show grams + % of target.
  const totalTarget = macros.reduce((a, m) => a + m.target, 0);
  const denom = Math.max(totalTarget, totalGrams, 1);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] font-semibold">
          Macros
        </span>
        <span className="text-[11px] text-[var(--color-fg-3)] tnum">
          {Math.round(totalGrams)} / {Math.round(totalTarget)} g
        </span>
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-[var(--color-elevated)] border border-[var(--color-stroke)]">
        {macros.map((m) => {
          const colors = metricColors(m.metric as "protein" | "carbs" | "fat");
          const w = (m.current / denom) * 100;
          if (w < 0.5) return null;
          return (
            <div
              key={m.metric}
              className="h-full"
              style={{
                width: `${w}%`,
                background: `linear-gradient(90deg, ${colors.base} 0%, ${colors.light} 100%)`,
              }}
              title={`${m.label}: ${Math.round(m.current)}g / ${m.target}g`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {macros.map((m) => {
          const colors = metricColors(m.metric as "protein" | "carbs" | "fat");
          return (
            <div
              key={m.metric}
              className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-2)]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: colors.base }}
              />
              <span className="font-semibold text-[var(--color-fg)]">{m.label}</span>
              <span className="tnum">{Math.round(m.current)}/{m.target}g</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressRow({
  icon,
  label,
  value,
  unit,
  current,
  target,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] font-semibold">
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <span className="text-[11px] tnum text-[var(--color-fg)]">
          {value}
          {unit && <span className="text-[var(--color-fg-3)] ml-0.5">{unit}</span>}
          {target > 0 && (
            <span className="text-[var(--color-fg-3)] tnum">
              {" "}/ {target.toLocaleString()}
            </span>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-elevated)] overflow-hidden border border-[var(--color-stroke)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out"
          )}
          style={{
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, ${color} 0%, color-mix(in srgb, ${color} 60%, white) 100%)`,
          }}
        />
      </div>
    </div>
  );
}
