"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useMealsRaw } from "@/store/selectors";
import { useStore } from "@/store";
import { lastNDates, format, fromDateStr } from "@/lib/date";

const tickStyle = { fill: "var(--color-fg-3)", fontSize: 10 };
const gridStroke = "var(--color-stroke)";

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-stroke-strong)] bg-[var(--color-card)] px-2.5 py-1.5 shadow-[var(--shadow-card)] text-xs">
      <div className="text-[10px] text-[var(--color-fg-3)]">{label}</div>
      {payload.map((p: any) => (
        <div
          key={p.dataKey}
          className="tnum"
          style={{ color: p.color || "var(--color-fg)" }}
        >
          {p.name}: {Math.round(p.value)}
        </div>
      ))}
    </div>
  );
}

export function NutritionStatsCard({ days }: { days: number }) {
  const enabled = useStore((s) => s.settings.nutrition.enabled);
  const targets = useStore((s) => s.settings.nutrition);
  const meals = useMealsRaw();

  const data = React.useMemo(() => {
    const dates = lastNDates(days);
    return dates.map((d) => {
      const dm = meals.filter((m) => m.date === d);
      return {
        date: format(fromDateStr(d), "M/d"),
        calories: dm.reduce((a, m) => a + m.calories, 0),
        protein: dm.reduce((a, m) => a + m.protein, 0),
      };
    });
  }, [meals, days]);

  const totals = React.useMemo(() => {
    const validCal = data.filter((d) => d.calories > 0);
    const validProtein = data.filter((d) => d.protein > 0);
    return {
      avgCal: validCal.length
        ? Math.round(
            validCal.reduce((a, b) => a + b.calories, 0) / validCal.length
          )
        : 0,
      avgProtein: validProtein.length
        ? Math.round(
            validProtein.reduce((a, b) => a + b.protein, 0) /
              validProtein.length
          )
        : 0,
      adherencePct:
        targets.protein && data.length
          ? Math.round(
              (data.filter((d) => d.protein >= (targets.protein ?? 0)).length /
                data.length) *
                100
            )
          : null,
    };
  }, [data, targets.protein]);

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nutrition</CardTitle>
        </CardHeader>
        <div className="text-xs text-[var(--color-fg-3)] text-center py-6">
          Enable nutrition tracking in Settings to see this card.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition · {days}d</CardTitle>
        {totals.adherencePct != null && (
          <span className="text-xs text-[var(--color-fg-2)] tnum">
            {totals.adherencePct}% protein adherence
          </span>
        )}
      </CardHeader>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat
          label="Avg cal"
          value={totals.avgCal}
          target={targets.calories}
        />
        <Stat
          label="Avg protein"
          value={totals.avgProtein}
          target={targets.protein}
          unit="g"
          highlight
        />
      </div>

      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
            <XAxis dataKey="date" tick={tickStyle} stroke={gridStroke} />
            <YAxis
              yAxisId="cal"
              tick={tickStyle}
              stroke={gridStroke}
              width={32}
            />
            <YAxis
              yAxisId="protein"
              orientation="right"
              tick={tickStyle}
              stroke={gridStroke}
              width={26}
            />
            <Tooltip content={<TooltipBox />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 10, color: "var(--color-fg-2)" }}
            />
            <Bar
              yAxisId="cal"
              dataKey="calories"
              name="Calories"
              fill="color-mix(in srgb, var(--color-fg-2) 30%, transparent)"
              radius={[4, 4, 0, 0]}
            />
            {targets.calories && (
              <ReferenceLine
                yAxisId="cal"
                y={targets.calories}
                stroke="var(--color-fg-2)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
            <Line
              yAxisId="protein"
              type="monotone"
              dataKey="protein"
              name="Protein"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
            />
            {targets.protein && (
              <ReferenceLine
                yAxisId="protein"
                y={targets.protein}
                stroke="var(--color-accent)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  target,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  target?: number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-2">
      <div className="label text-[9px]">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-0.5">
        <span
          className={
            "text-base font-semibold tnum " +
            (highlight ? "text-[var(--color-accent)]" : "")
          }
        >
          {value}
        </span>
        {target != null && (
          <span className="text-[10px] text-[var(--color-fg-3)] tnum">
            /{target}
            {unit ?? ""}
          </span>
        )}
      </div>
    </div>
  );
}
