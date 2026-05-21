"use client";

import * as React from "react";
import { Utensils, Zap } from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import type { Meal, SavedMeal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type Shortcut = {
  key: string;
  name: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  source: "saved" | "frequent";
  savedMealId?: string;
};

export function MealShortcutsRow() {
  const meals = useStore((s) => s.meals);
  const savedMeals = useStore((s) => s.savedMeals);
  const addMeal = useStore((s) => s.addMeal);

  const shortcuts = React.useMemo(
    () => buildShortcuts(meals, savedMeals),
    [meals, savedMeals]
  );

  if (shortcuts.length === 0) return null;

  const logShortcut = (s: Shortcut) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    addMeal({
      date: todayStr(),
      time: `${hh}:${mm}`,
      name: s.name,
      calories: s.calories,
      protein: s.protein,
      carbs: s.carbs,
      fat: s.fat,
      savedMealId: s.savedMealId,
    });
    haptic("success");
  };

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-3)] font-medium mb-2 px-1">
        Quick log
      </div>
      <div className="-mx-4 px-4 overflow-x-auto hide-scroll">
        <div className="flex gap-2 snap-x snap-mandatory">
          {shortcuts.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => logShortcut(s)}
              className={cn(
                "snap-start shrink-0 w-[110px] h-[88px] rounded-xl",
                "border border-[var(--color-stroke)] bg-[var(--color-card)]",
                "p-2.5 text-left active:scale-[0.97]",
                "transition-transform duration-[80ms] ease-out"
              )}
            >
              <div className="flex items-center gap-1.5">
                {s.source === "frequent" ? (
                  <Zap
                    size={11}
                    className="text-[var(--color-warning)]"
                  />
                ) : (
                  <Utensils
                    size={11}
                    className="text-[var(--color-fg-3)]"
                  />
                )}
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)]">
                  {s.source === "frequent" ? "Frequent" : "Saved"}
                </span>
              </div>
              <div className="mt-1 text-[12px] font-semibold truncate">
                {s.name}
              </div>
              <div className="text-[10px] text-[var(--color-fg-3)] tnum mt-0.5">
                {s.calories} kcal · {s.protein}g P
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildShortcuts(meals: Meal[], savedMeals: SavedMeal[]): Shortcut[] {
  const out: Shortcut[] = [];
  const seen = new Set<string>();

  const topSaved = [...savedMeals]
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 4);
  for (const s of topSaved) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: `saved-${s.id}`,
      name: s.name,
      calories: s.calories,
      protein: s.protein,
      carbs: s.carbs,
      fat: s.fat,
      source: "saved",
      savedMealId: s.id,
    });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const counts = new Map<
    string,
    { count: number; sample: Meal }
  >();
  for (const m of meals) {
    if (!m.name) continue;
    if (m.date < cutoffStr) continue;
    const key = m.name.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, sample: m });
    }
  }
  const frequent = Array.from(counts.entries())
    .filter(([k]) => !seen.has(k))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4);
  for (const [key, { sample }] of frequent) {
    seen.add(key);
    out.push({
      key: `freq-${key}`,
      name: sample.name ?? "",
      calories: sample.calories,
      protein: sample.protein,
      carbs: sample.carbs,
      fat: sample.fat,
      source: "frequent",
    });
  }

  return out;
}
