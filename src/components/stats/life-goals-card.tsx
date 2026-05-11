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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useLifeGoalsRaw } from "@/store/selectors";
import {
  LIFE_GOAL_CATEGORIES,
  LifeGoalCategory,
} from "@/lib/types";

const tickStyle = { fill: "var(--color-fg-3)", fontSize: 10 };
const gridStroke = "var(--color-stroke)";

const CATEGORY_COLORS: Record<LifeGoalCategory, string> = {
  travel: "#60A5FA",
  experience: "#F472B6",
  learn: "#A78BFA",
  health: "#34D399",
  career: "#FBBF24",
  financial: "#22D3EE",
  relationships: "#FB7185",
  personal: "#94A3B8",
};

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-stroke-strong)] bg-[var(--color-card)] px-2.5 py-1.5 shadow-[var(--shadow-card)] text-xs">
      <div className="text-[10px] text-[var(--color-fg-3)]">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="tnum" style={{ color: p.color || "var(--color-fg)" }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export function LifeGoalsCard() {
  const goals = useLifeGoalsRaw();
  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);

  const perYear = React.useMemo(() => {
    if (completed.length === 0) return [];
    const counts = new Map<number, number>();
    for (const g of completed) {
      const year = g.completedAt
        ? new Date(g.completedAt).getFullYear()
        : new Date(g.createdAt).getFullYear();
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, n]) => ({ year: String(year), completed: n }));
  }, [completed]);

  const byCategory = React.useMemo(() => {
    const counts = new Map<LifeGoalCategory, number>();
    for (const g of goals) {
      counts.set(g.category, (counts.get(g.category) ?? 0) + 1);
    }
    return LIFE_GOAL_CATEGORIES.filter((c) => (counts.get(c.key) ?? 0) > 0).map(
      (c) => ({
        key: c.key,
        label: c.label,
        value: counts.get(c.key) ?? 0,
      })
    );
  }, [goals]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Life goals</CardTitle>
        <span className="text-xs text-[var(--color-fg-2)] tnum">
          {active.length} active · {completed.length} done
        </span>
      </CardHeader>

      {goals.length === 0 ? (
        <div className="text-xs text-[var(--color-fg-3)] text-center py-6">
          Add a life goal to see your big picture.
        </div>
      ) : (
        <>
          {perYear.length > 0 && (
            <div className="mb-4">
              <div className="label text-[10px] mb-2">Completed per year</div>
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={perYear}
                    margin={{ top: 5, right: 6, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 4" />
                    <XAxis dataKey="year" tick={tickStyle} stroke={gridStroke} />
                    <YAxis
                      tick={tickStyle}
                      stroke={gridStroke}
                      width={20}
                      allowDecimals={false}
                    />
                    <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--color-elevated)" }} />
                    <Bar
                      dataKey="completed"
                      fill="var(--color-accent)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {byCategory.length > 0 && (
            <div>
              <div className="label text-[10px] mb-2">By category</div>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {byCategory.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={CATEGORY_COLORS[entry.key]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<TooltipBox />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 10, color: "var(--color-fg-2)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
