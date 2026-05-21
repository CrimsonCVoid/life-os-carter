import type { Meal, MacroTargets } from "@/lib/types";

export type MacroProgress = {
  metric: "calories" | "protein" | "carbs" | "fat" | "fiber";
  label: string;
  current: number;
  target: number;
  pct: number;
  status: "over" | "under" | "on";
  color: string;
};

type MealLike = Meal & { fiber?: number };

const FALLBACK_COLOR: Record<MacroProgress["metric"], string> = {
  calories: "var(--mc-calories, var(--color-accent))",
  protein: "var(--mc-protein, var(--pillar-strain, var(--color-accent)))",
  carbs: "var(--mc-carbs, var(--pillar-recovery, var(--color-accent)))",
  fat: "var(--mc-fat, var(--color-warning))",
  fiber: "var(--mc-fiber, var(--color-success))",
};

const LABEL: Record<MacroProgress["metric"], string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  fiber: "Fiber",
};

function statusFromPct(pct: number): MacroProgress["status"] {
  if (pct > 1.1) return "over";
  if (pct >= 0.95) return "on";
  return "under";
}

export function computeMacroProgress(args: {
  meals: Meal[];
  date: string;
  targets: MacroTargets;
}): MacroProgress[] {
  const { meals, date, targets } = args;
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const m of meals) {
    if (m.date !== date) continue;
    const meal = m as MealLike;
    if (typeof meal.calories === "number") totals.calories += meal.calories;
    if (typeof meal.protein === "number") totals.protein += meal.protein;
    if (typeof meal.carbs === "number") totals.carbs += meal.carbs;
    if (typeof meal.fat === "number") totals.fat += meal.fat;
    if (typeof meal.fiber === "number") totals.fiber += meal.fiber;
  }

  const out: MacroProgress[] = [];
  const order: MacroProgress["metric"][] = ["calories", "protein", "carbs", "fat", "fiber"];
  for (const metric of order) {
    const target = targets[metric];
    if (typeof target !== "number" || target <= 0) continue;
    const current = totals[metric];
    const pct = current / target;
    out.push({
      metric,
      label: LABEL[metric],
      current,
      target,
      pct,
      status: statusFromPct(pct),
      color: FALLBACK_COLOR[metric],
    });
  }
  return out;
}
