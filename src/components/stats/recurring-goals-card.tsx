"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/store";
import {
  useActiveRecurringGoals,
  useRecurringGenerations,
  patternSummary,
} from "@/store/selectors";
import { shouldGenerateForDate } from "@/lib/recurrence";
import { lastNDates } from "@/lib/date";
import { Goal, RecurringGoal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Repeat } from "lucide-react";

export function RecurringGoalsCard({ days }: { days: number }) {
  const items = useActiveRecurringGoals();
  const generations = useRecurringGenerations();
  const goals = useStore((s) => s.goals);

  const completedById = React.useMemo(
    () => new Map(goals.map((g) => [g.id, g.completed])),
    [goals]
  );

  const dates = React.useMemo(() => lastNDates(days), [days]);
  const dates60 = React.useMemo(() => lastNDates(60), []);

  const rows = React.useMemo(() => {
    return items
      .map((rg) => {
        let scheduled = 0;
        let completed = 0;
        for (const d of dates) {
          if (!shouldGenerateForDate(rg, d)) continue;
          scheduled += 1;
          const gen = generations.find(
            (g) => g.recurringGoalId === rg.id && g.date === d
          );
          if (gen && completedById.get(gen.generatedGoalId)) completed += 1;
        }
        const pct = scheduled === 0 ? null : Math.round((completed / scheduled) * 100);
        return { rg, scheduled, completed, pct };
      })
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  }, [items, dates, generations, completedById]);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <Repeat size={13} />
            Recurring Goals
          </span>
        </CardTitle>
        <span className="text-xs text-[var(--color-fg-3)]">last {days}d</span>
      </CardHeader>
      <ul className="space-y-2">
        {rows.map((row) => (
          <RecurringStatsRow
            key={row.rg.id}
            rg={row.rg}
            scheduled={row.scheduled}
            completed={row.completed}
            pct={row.pct}
            grid60Dates={dates60}
            generations={generations}
            goalsById={completedById}
          />
        ))}
      </ul>
    </Card>
  );
}

function RecurringStatsRow({
  rg,
  scheduled,
  completed,
  pct,
  grid60Dates,
  generations,
  goalsById,
}: {
  rg: RecurringGoal;
  scheduled: number;
  completed: number;
  pct: number | null;
  grid60Dates: string[];
  generations: ReturnType<typeof useRecurringGenerations>;
  goalsById: Map<Goal["id"], boolean>;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <li className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-3 flex items-center gap-3 text-left"
      >
        {rg.emoji && (
          <span className="text-base leading-none shrink-0">{rg.emoji}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{rg.text}</div>
          <div className="text-[11px] text-[var(--color-fg-3)] truncate">
            {patternSummary(rg)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] tnum text-[var(--color-fg-2)]">
            {scheduled === 0
              ? "—"
              : `${completed}/${scheduled}${pct != null ? ` · ${pct}%` : ""}`}
          </div>
          <div className="mt-1 h-1.5 w-24 rounded-full bg-[var(--color-stroke)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)]"
              style={{
                width: pct == null ? 0 : `${pct}%`,
                transition: "width 280ms ease",
              }}
            />
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-[var(--color-fg-3)] transition-transform",
            expanded ? "rotate-180" : ""
          )}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
          >
            {grid60Dates.map((d) => {
              const isScheduled = shouldGenerateForDate(rg, d);
              const gen = generations.find(
                (g) => g.recurringGoalId === rg.id && g.date === d
              );
              const done = !!gen && goalsById.get(gen.generatedGoalId) === true;
              const skipped = gen?.status === "skipped";
              let bg = "var(--color-stroke)";
              if (isScheduled) {
                if (done) bg = "var(--color-accent)";
                else if (skipped)
                  bg = "color-mix(in srgb, var(--color-danger) 60%, transparent)";
                else
                  bg = "color-mix(in srgb, var(--color-fg-3) 30%, transparent)";
              }
              return (
                <div
                  key={d}
                  title={d}
                  className="aspect-square rounded-[2px]"
                  style={{ background: bg }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--color-fg-3)]">
            <LegendDot color="var(--color-accent)" label="Done" />
            <LegendDot
              color="color-mix(in srgb, var(--color-danger) 60%, transparent)"
              label="Skipped"
            />
            <LegendDot
              color="color-mix(in srgb, var(--color-fg-3) 30%, transparent)"
              label="Missed"
            />
            <LegendDot color="var(--color-stroke)" label="Not scheduled" />
          </div>
        </div>
      )}
    </li>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="h-2 w-2 rounded-[2px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
