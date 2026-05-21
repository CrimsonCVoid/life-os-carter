"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ChefHat, Plus } from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { uid } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecipeBuilderModal } from "@/components/nutrition/recipe-builder-modal";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export function RecipesCard() {
  const recipes = useStore((s) => s.recipes);
  const addMeal = useStore((s) => s.addMeal);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const openNew = () => {
    setEditingId(null);
    setEditorOpen(true);
    haptic("tap");
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setEditorOpen(true);
    haptic("tap");
  };

  const logServing = (recipeId: string) => {
    const r = recipes.find((x) => x.id === recipeId);
    if (!r) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    addMeal({
      date: todayStr(),
      time: `${hh}:${mm}`,
      name: r.name,
      calories: Math.round(r.caloriesPerServing),
      protein: Math.round(r.proteinPerServing ?? 0),
      carbs: r.carbsPerServing != null ? Math.round(r.carbsPerServing) : undefined,
      fat: r.fatPerServing != null ? Math.round(r.fatPerServing) : undefined,
    });
    haptic("success");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recipes</CardTitle>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--color-accent)] active:opacity-70"
          >
            <Plus size={12} />
            New
          </button>
        </CardHeader>

        {recipes.length === 0 ? (
          <div className="py-8 text-center">
            <ChefHat
              size={20}
              className="mx-auto mb-2 text-[var(--color-fg-3)]"
            />
            <div className="text-sm text-[var(--color-fg-2)]">
              No recipes yet.
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={openNew}
            >
              <Plus size={12} />
              Build your first
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {recipes.map((r) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 px-3 py-2.5 flex items-center gap-3"
              >
                <span className="text-[22px] leading-none shrink-0">
                  {r.icon || "🍽"}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(r.id)}
                  className="flex-1 min-w-0 text-left active:opacity-70"
                >
                  <div className="text-[14px] font-semibold tracking-tight truncate">
                    {r.name}
                  </div>
                  <div className="text-[10px] text-[var(--color-fg-3)] tnum mt-0.5">
                    {Math.round(r.caloriesPerServing)} kcal
                    {r.proteinPerServing != null
                      ? ` · ${Math.round(r.proteinPerServing)}g P`
                      : ""}
                    {` · ${r.servings} serving${r.servings === 1 ? "" : "s"}`}
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => logServing(r.id)}
                >
                  Log 1
                </Button>
              </motion.li>
            ))}
          </ul>
        )}
      </Card>

      <RecipeBuilderModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        recipeId={editingId}
      />
    </>
  );
}

void uid;
void cn;
