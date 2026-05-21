"use client";

import * as React from "react";
import { X, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useStore } from "@/store/index";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { Recipe, RecipeIngredient } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  recipeId: string | null;
};

const ICON_OPTIONS = [
  "🍳",
  "🥩",
  "🥗",
  "🍝",
  "🥪",
  "🍕",
  "🍱",
  "🥙",
  "🌮",
  "🫐",
  "🥑",
];

function blankIngredient(): RecipeIngredient {
  return { name: "", calories: 0 };
}

function toNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNum(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export function RecipeBuilderModal({ open, onClose, recipeId }: Props) {
  const existing = useStore((s) =>
    recipeId ? s.recipes.find((r) => r.id === recipeId) : undefined
  );
  const addRecipe = useStore((s) => s.addRecipe);
  const updateRecipe = useStore((s) => s.updateRecipe);
  const removeRecipe = useStore((s) => s.removeRecipe);

  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<string>(ICON_OPTIONS[0]);
  const [servings, setServings] = React.useState<number>(1);
  const [notes, setNotes] = React.useState("");
  const [ingredients, setIngredients] = React.useState<RecipeIngredient[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setIcon(existing.icon || ICON_OPTIONS[0]);
      setServings(existing.servings || 1);
      setNotes(existing.notes ?? "");
      setIngredients(
        existing.ingredients.length > 0
          ? existing.ingredients.map((i) => ({ ...i }))
          : []
      );
    } else {
      setName("");
      setIcon(ICON_OPTIONS[0]);
      setServings(1);
      setNotes("");
      setIngredients([]);
    }
  }, [open, existing]);

  const patchIngredient = (
    idx: number,
    patch: Partial<RecipeIngredient>
  ) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing))
    );
  };

  const removeIngredient = (idx: number) => {
    haptic("soft");
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const addIngredient = () => {
    haptic("tap");
    setIngredients((prev) => [...prev, blankIngredient()]);
  };

  const canSave =
    name.trim().length > 0 && ingredients.length > 0 && servings > 0;

  const onSave = () => {
    if (!canSave) return;
    const cleanIngredients: RecipeIngredient[] = ingredients.map((i) => ({
      name: i.name.trim(),
      quantity: i.quantity?.trim() || undefined,
      calories: i.calories || 0,
      protein: i.protein,
      carbs: i.carbs,
      fat: i.fat,
      fiber: i.fiber,
    }));

    const totals = cleanIngredients.reduce(
      (acc, i) => ({
        calories: acc.calories + (i.calories || 0),
        protein: acc.protein + (i.protein ?? 0),
        carbs: acc.carbs + (i.carbs ?? 0),
        fat: acc.fat + (i.fat ?? 0),
        fiber: acc.fiber + (i.fiber ?? 0),
        hasProtein: acc.hasProtein || i.protein !== undefined,
        hasCarbs: acc.hasCarbs || i.carbs !== undefined,
        hasFat: acc.hasFat || i.fat !== undefined,
        hasFiber: acc.hasFiber || i.fiber !== undefined,
      }),
      {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        hasProtein: false,
        hasCarbs: false,
        hasFat: false,
        hasFiber: false,
      }
    );

    const s = Math.max(1, servings);
    const payload: Omit<Recipe, "id" | "createdAt"> = {
      name: name.trim(),
      icon,
      servings: s,
      ingredients: cleanIngredients,
      caloriesPerServing: Math.round(totals.calories / s),
      proteinPerServing: totals.hasProtein
        ? Math.round((totals.protein / s) * 10) / 10
        : undefined,
      carbsPerServing: totals.hasCarbs
        ? Math.round((totals.carbs / s) * 10) / 10
        : undefined,
      fatPerServing: totals.hasFat
        ? Math.round((totals.fat / s) * 10) / 10
        : undefined,
      fiberPerServing: totals.hasFiber
        ? Math.round((totals.fiber / s) * 10) / 10
        : undefined,
      notes: notes.trim() || undefined,
    };

    if (recipeId) {
      updateRecipe(recipeId, payload);
    } else {
      addRecipe(payload);
    }
    haptic("success");
    onClose();
  };

  const onDelete = () => {
    if (!recipeId) return;
    removeRecipe(recipeId);
    haptic("success");
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={recipeId ? "Edit recipe" : "New recipe"}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <div>
              {recipeId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[var(--color-danger)]"
                >
                  Delete recipe
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={!canSave}>
                Save
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="label">Name</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sheet-pan chicken"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ICON_OPTIONS.map((opt) => {
                const active = opt === icon;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setIcon(opt);
                    }}
                    className={cn(
                      "h-9 w-9 grid place-items-center rounded-[var(--radius-control)]",
                      "border text-[18px] transition-colors",
                      active
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-stroke)] bg-[var(--color-elevated)]"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="label">Servings</div>
            <Input
              type="number"
              min={1}
              value={servings}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setServings(Number.isFinite(n) && n > 0 ? n : 1);
              }}
              className="w-28"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="label">Ingredients</div>
              <span className="text-[11px] text-[var(--color-fg-3)] tnum">
                {ingredients.length}
              </span>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-[var(--radius-control)] border border-[var(--color-stroke)]",
                    "bg-[var(--color-elevated)] p-3 space-y-2"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={ing.name}
                        onChange={(e) =>
                          patchIngredient(idx, { name: e.target.value })
                        }
                        placeholder="Chicken thigh"
                      />
                      <Input
                        value={ing.quantity ?? ""}
                        onChange={(e) =>
                          patchIngredient(idx, { quantity: e.target.value })
                        }
                        placeholder="6 oz"
                        className="h-9 text-[15px]"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Remove ingredient"
                      onClick={() => removeIngredient(idx)}
                      className={cn(
                        "h-9 w-9 grid place-items-center rounded-[var(--radius-control)]",
                        "text-[var(--color-fg-2)] bg-[var(--color-card)]",
                        "border border-[var(--color-stroke)]",
                        "active:scale-[0.96] transition-transform"
                      )}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MacroField
                      label="Calories"
                      value={ing.calories ? String(ing.calories) : ""}
                      onChange={(v) =>
                        patchIngredient(idx, { calories: toNum(v) })
                      }
                    />
                    <MacroField
                      label="Protein (g)"
                      value={ing.protein != null ? String(ing.protein) : ""}
                      onChange={(v) =>
                        patchIngredient(idx, { protein: toOptionalNum(v) })
                      }
                    />
                    <MacroField
                      label="Carbs (g)"
                      value={ing.carbs != null ? String(ing.carbs) : ""}
                      onChange={(v) =>
                        patchIngredient(idx, { carbs: toOptionalNum(v) })
                      }
                    />
                    <MacroField
                      label="Fat (g)"
                      value={ing.fat != null ? String(ing.fat) : ""}
                      onChange={(v) =>
                        patchIngredient(idx, { fat: toOptionalNum(v) })
                      }
                    />
                    <MacroField
                      label="Fiber (g)"
                      value={ing.fiber != null ? String(ing.fiber) : ""}
                      onChange={(v) =>
                        patchIngredient(idx, { fiber: toOptionalNum(v) })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={addIngredient}
              className="w-full"
            >
              <Plus size={14} />
              Add ingredient
            </Button>
          </div>

          <div className="space-y-2">
            <div className="label">Notes</div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete "${existing?.name ?? "recipe"}"?`}
        description="This can't be undone."
      />
    </>
  );
}

function MacroField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-3)] font-medium">
        {label}
      </span>
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-[15px]"
        placeholder="0"
      />
    </label>
  );
}
