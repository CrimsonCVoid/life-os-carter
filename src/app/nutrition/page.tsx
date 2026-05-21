"use client";

import { Screen } from "@/components/screen";
import { Nutrition } from "@/components/today/nutrition";
import { MealShortcutsRow } from "@/components/nutrition/meal-shortcuts-row";
import { RecipesCard } from "@/components/nutrition/recipes-card";
import { MacroRings } from "@/components/today/macro-rings";
import { FastingTimerCard } from "@/components/nutrition/fasting-timer-card";
import { BarcodeQuickAdd } from "@/components/nutrition/barcode-quick-add";

export default function NutritionPage() {
  return (
    <Screen title="Nutrition" subtitle="Macros, recipes, and meal shortcuts.">
      <MacroRings />
      <FastingTimerCard />
      <BarcodeQuickAdd />
      <MealShortcutsRow />
      <RecipesCard />
      <Nutrition />
    </Screen>
  );
}
