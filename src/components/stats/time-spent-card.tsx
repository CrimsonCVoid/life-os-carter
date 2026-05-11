"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useBlocksRaw } from "@/store/selectors";
import { BlockType, BLOCK_COLORS, BLOCK_TYPE_LABELS } from "@/lib/types";
import { lastNDates, format, fromDateStr } from "@/lib/date";

const BLOCK_TYPES: BlockType[] = [
  "goal",
  "workout",
  "meal",
  "focus",
  "meeting",
  "rest",
  "other",
];

const tickStyle = { fill: "var(--color-fg-3)", fontSize: 10 };
const gridStroke = "var(--color-stroke)";

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-stroke-strong)] bg-[var(--color-card)] px-2.5 py-1.5 shadow-[var(--shadow-card)] text-xs">
      <div className="text-[10px] text-[var(--color-fg-3)]">{label}</div>
      {payload
        .filter((p: any) => (p.value ?? 0) > 0)
        .map((p: any) => (
          <div key={p.dataKey} className="tnum" style={{ color: p.color }}>
            {BLOCK_TYPE_LABELS[p.dataKey as BlockType]}: {p.value} min
          </div>
        ))}
    </div>
  );
}

export function TimeSpentCard({ days }: { days: number }) {
  const blocks = useBlocksRaw();

  const data = React.useMemo(() => {
    const dates = lastNDates(days);
    return dates.map((d) => {
      const row: Record<string, number | string> = {
        date: format(fromDateStr(d), "M/d"),
      };
      for (const t of BLOCK_TYPES) row[t] = 0;
      for (const b of blocks) {
        if (b.date !== d) continue;
        row[b.type] = (row[b.type] as number) + (b.endMin - b.startMin);
      }
      return row;
    });
  }, [blocks, days]);

  const totalScheduled = React.useMemo(
    () =>
      data.reduce(
        (sum, row) =>
          sum +
          BLOCK_TYPES.reduce(
            (s, t) => s + (typeof row[t] === "number" ? (row[t] as number) : 0),
            0
          ),
        0
      ),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time spent · {days}d</CardTitle>
        <span className="text-xs text-[var(--color-fg-2)] tnum">
          {Math.round(totalScheduled / 60)}h scheduled
        </span>
      </CardHeader>
      {totalScheduled === 0 ? (
        <div className="text-xs text-[var(--color-fg-3)] text-center py-6">
          No scheduled blocks in this range.
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
              <XAxis dataKey="date" tick={tickStyle} stroke={gridStroke} />
              <YAxis
                tick={tickStyle}
                stroke={gridStroke}
                width={28}
                tickFormatter={(v) => `${Math.round(v / 60)}h`}
              />
              <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--color-elevated)" }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 10, color: "var(--color-fg-2)" }}
                formatter={(value) =>
                  BLOCK_TYPE_LABELS[value as BlockType] ?? value
                }
              />
              {BLOCK_TYPES.map((t) => (
                <Bar
                  key={t}
                  dataKey={t}
                  stackId="a"
                  fill={BLOCK_COLORS[t].fg}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
