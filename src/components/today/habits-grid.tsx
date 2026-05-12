"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { StreakBadge } from "@/components/ui/streak-badge";
import { useStore } from "@/store";
import { useHabits, useToday } from "@/store/selectors";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { HabitGlyph } from "@/components/habit-icon";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { Habit, DateStr } from "@/lib/types";
import { lastNDates } from "@/lib/date";
import { streakForHabit } from "@/lib/score";

export function HabitsGrid() {
  const today = useToday();
  const habits = useHabits();
  const toggleHabit = useStore((s) => s.toggleHabit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Habits</CardTitle>
        <Link
          href="/habits"
          className="text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)] transition"
        >
          Manage →
        </Link>
      </CardHeader>

      {habits.length === 0 ? (
        <EmptyHabits />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {habits.slice(0, 12).map((h) => (
            <HabitTile
              key={h.id}
              habit={h}
              today={today}
              onToggle={() => {
                toggleHabit(h.id, today);
                haptic(h.history[today] ? "soft" : "success");
              }}
            />
          ))}
          {habits.length < 12 && (
            <Link
              href="/habits"
              aria-label="Add habit"
              className="h-[112px] rounded-xl border border-dashed border-[var(--color-stroke-strong)] grid place-items-center text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:border-[var(--color-fg-3)] transition"
            >
              <Plus size={18} />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function HabitTile({
  habit,
  today,
  onToggle,
}: {
  habit: Habit;
  today: DateStr;
  onToggle: () => void;
}) {
  const doneToday = !!habit.history[today];
  const streak = streakForHabit(habit.history, today);
  const last7 = React.useMemo(() => {
    return lastNDates(7).map((d) => ({ date: d, done: !!habit.history[d] }));
  }, [habit.history]);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "h-[112px] rounded-xl p-2.5 text-left transition active:scale-[0.97] border relative overflow-hidden",
        doneToday
          ? "bg-[var(--color-accent-soft)] border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)]"
          : "bg-[var(--color-elevated)] border-[var(--color-stroke)] hover:border-[var(--color-stroke-strong)]"
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "h-7 w-7 grid place-items-center rounded-lg",
            doneToday
              ? "bg-[var(--color-accent-strong)] text-white"
              : "bg-[var(--color-card)] text-[var(--color-fg-2)]"
          )}
        >
          <HabitGlyph name={habit.icon} size={14} />
        </div>
        <StreakBadge streak={streak} size={11} className="text-[10px]" />
      </div>
      <div className="mt-2 text-[11px] font-medium text-[var(--color-fg)] line-clamp-2 leading-tight">
        {habit.name}
      </div>
      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-0.5">
        {last7.map((d) => (
          <span
            key={d.date}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              d.done
                ? "bg-[var(--color-accent)]"
                : "bg-[var(--color-stroke-strong)]"
            )}
          />
        ))}
      </div>
    </button>
  );
}

function EmptyHabits() {
  return (
    <Link
      href="/habits"
      className="block py-8 text-center"
    >
      <div className="text-sm text-[var(--color-fg-2)]">
        No habits yet
      </div>
      <div className="mt-1 text-xs text-[var(--color-accent)]">
        Add your first →
      </div>
    </Link>
  );
}
