"use client";

import { Flame } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useHabits } from "@/store/selectors";
import { todayStr } from "@/lib/date";
import { streakForHabit } from "@/lib/score";
import { HabitGlyph } from "@/components/habit-icon";

export function StreakLeaderboard() {
  const habits = useHabits();
  const today = todayStr();
  const ranked = habits
    .map((h) => ({ h, streak: streakForHabit(h.history, today) }))
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Streaks</CardTitle>
      </CardHeader>
      {ranked.length === 0 ? (
        <div className="text-xs text-[var(--color-fg-3)] text-center py-4">
          No habits yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {ranked.map(({ h, streak }, idx) => (
            <li
              key={h.id}
              className="flex items-center gap-3 px-1.5 py-1.5 rounded-xl"
            >
              <span className="w-5 text-center text-xs font-semibold tnum text-[var(--color-fg-3)]">
                {idx + 1}
              </span>
              <div className="h-8 w-8 grid place-items-center rounded-lg bg-[var(--color-elevated)] text-[var(--color-fg-2)]">
                <HabitGlyph name={h.icon} size={14} />
              </div>
              <span className="flex-1 text-sm">{h.name}</span>
              <span className="flex items-center gap-1 text-xs font-semibold tnum text-[var(--color-warning)]">
                <Flame size={12} fill="currentColor" />
                {streak}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
