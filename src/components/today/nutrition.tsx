"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Plus, Trash2, Utensils } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import {
  computeTotalsForDay,
  useMealsForDay,
  useSavedMealsRaw,
} from "@/store/selectors";
import { Meal, NutritionTargets, SavedMeal } from "@/lib/types";
import { todayStr } from "@/lib/date";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export function Nutrition() {
  const today = todayStr();
  const showOnToday = useStore((s) => s.settings.showNutritionOnToday);
  const targets = useStore((s) => s.settings.nutrition);
  const meals = useMealsForDay(today);
  const saved = useSavedMealsRaw();
  const addMeal = useStore((s) => s.addMeal);
  const updateMeal = useStore((s) => s.updateMeal);
  const removeMeal = useStore((s) => s.removeMeal);
  const logSavedMeal = useStore((s) => s.logSavedMeal);
  const addSavedMeal = useStore((s) => s.addSavedMeal);
  const removeSavedMeal = useStore((s) => s.removeSavedMeal);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Meal | null>(null);

  if (!showOnToday || !targets.enabled) return null;

  const totals = computeTotalsForDay(meals);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition</CardTitle>
        <Button size="sm" variant="soft" onClick={() => setOpen(true)}>
          <Plus size={12} />
          Log meal
        </Button>
      </CardHeader>

      <div className="grid grid-cols-4 gap-2">
        <Macro
          label="Cal"
          value={totals.calories}
          target={targets.calories}
          unit=""
          highlight={false}
        />
        <Macro
          label="Protein"
          value={totals.protein}
          target={targets.protein}
          unit="g"
          highlight
        />
        <Macro
          label="Carbs"
          value={totals.carbs}
          target={targets.carbs}
          unit="g"
          highlight={false}
        />
        <Macro
          label="Fat"
          value={totals.fat}
          target={targets.fat}
          unit="g"
          highlight={false}
        />
      </div>

      {saved.length > 0 && (
        <div className="mt-4 -mx-1 px-1 overflow-x-auto hide-scroll">
          <div className="flex gap-1.5 pb-1">
            {saved.map((sm) => (
              <SavedChip
                key={sm.id}
                meal={sm}
                onTap={() => {
                  logSavedMeal(sm.id);
                  haptic("success");
                }}
                onDelete={() => removeSavedMeal(sm.id)}
              />
            ))}
          </div>
        </div>
      )}

      {meals.length > 0 && (
        <ul className="mt-3 space-y-1">
          {meals.map((m) => (
            <li
              key={m.id}
              className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--color-elevated)]"
            >
              <span className="text-[11px] text-[var(--color-fg-3)] tnum w-12 shrink-0">
                {m.time}
              </span>
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="flex-1 text-left text-sm truncate"
              >
                {m.name || "Meal"}
              </button>
              <span className="text-xs tnum text-[var(--color-fg-2)] shrink-0">
                {m.calories} cal · {m.protein}g
              </span>
              <button
                type="button"
                onClick={() => {
                  removeMeal(m.id);
                  haptic("warn");
                }}
                aria-label="Delete"
                className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {meals.length === 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full mt-3 py-3 rounded-xl border border-dashed border-[var(--color-stroke-strong)] text-xs text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:border-[var(--color-fg-3)] transition inline-flex items-center justify-center gap-1.5"
        >
          <Utensils size={14} />
          No meals logged yet
        </button>
      )}

      <LogMealModal
        open={open}
        onClose={() => setOpen(false)}
        savedMeals={saved}
        onCreate={(meal, saveFav) => {
          addMeal(meal);
          if (saveFav && meal.name) {
            addSavedMeal({
              name: meal.name,
              calories: meal.calories,
              protein: meal.protein,
              carbs: meal.carbs,
              fat: meal.fat,
            });
          }
          haptic("success");
        }}
      />
      <EditMealModal
        meal={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          updateMeal(editing.id, patch);
          setEditing(null);
        }}
      />
    </Card>
  );
}

function Macro({
  label,
  value,
  target,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
  highlight: boolean;
}) {
  const pct = target ? Math.min(1, value / target) : 0;
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-2">
      <div className="label text-[9px]">{label}</div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span
          className={cn(
            "text-base font-semibold tnum",
            highlight ? "text-[var(--color-accent)]" : ""
          )}
        >
          {Math.round(value)}
        </span>
        {target && (
          <span className="text-[10px] text-[var(--color-fg-3)] tnum">
            /{target}
            {unit}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-[var(--color-card)] overflow-hidden">
        <motion.div
          className={cn(
            "h-full",
            highlight
              ? "bg-[var(--color-accent)]"
              : "bg-[var(--color-fg-2)]/40"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function SavedChip({
  meal,
  onTap,
  onDelete,
}: {
  meal: SavedMeal;
  onTap: () => void;
  onDelete: () => void;
}) {
  const pressTimer = React.useRef<number | null>(null);
  const startPress = () => {
    pressTimer.current = window.setTimeout(() => {
      haptic("long");
      if (confirm(`Delete "${meal.name}"?`)) onDelete();
    }, 600);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  return (
    <button
      type="button"
      onClick={onTap}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-[var(--color-stroke)] bg-[var(--color-elevated)] text-xs hover:border-[var(--color-stroke-strong)] active:scale-[0.97] transition"
    >
      <span className="truncate max-w-[120px]">{meal.name}</span>
      <span className="text-[10px] text-[var(--color-fg-3)] tnum">
        {meal.calories}c · {meal.protein}p
      </span>
    </button>
  );
}

function LogMealModal({
  open,
  onClose,
  savedMeals,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  savedMeals: SavedMeal[];
  onCreate: (
    meal: Omit<Meal, "id" | "createdAt">,
    saveAsFav: boolean
  ) => void;
}) {
  const [name, setName] = React.useState("");
  const [calories, setCalories] = React.useState("");
  const [protein, setProtein] = React.useState("");
  const [carbs, setCarbs] = React.useState("");
  const [fat, setFat] = React.useState("");
  const [time, setTime] = React.useState(() => nowTime());
  const [saveFav, setSaveFav] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setTime(nowTime());
      setSaveFav(false);
    }
  }, [open]);

  const apply = (sm: SavedMeal) => {
    setName(sm.name);
    setCalories(String(sm.calories));
    setProtein(String(sm.protein));
    setCarbs(sm.carbs ? String(sm.carbs) : "");
    setFat(sm.fat ? String(sm.fat) : "");
  };

  const save = (alsoAdd: boolean) => {
    const c = parseInt(calories, 10);
    const p = parseInt(protein, 10);
    if (!Number.isFinite(c) || !Number.isFinite(p)) return;
    onCreate(
      {
        date: todayStr(),
        time,
        name: name.trim() || undefined,
        calories: c,
        protein: p,
        carbs: carbs ? parseInt(carbs, 10) : undefined,
        fat: fat ? parseInt(fat, 10) : undefined,
      },
      saveFav
    );
    if (alsoAdd) {
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setSaveFav(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log meal"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save(true)}>
            Save & add another
          </Button>
          <Button onClick={() => save(false)}>Save</Button>
        </div>
      }
    >
      {savedMeals.length > 0 && (
        <div className="mb-4">
          <div className="label mb-2">Favorites</div>
          <div className="flex gap-1.5 flex-wrap">
            {savedMeals.map((sm) => (
              <button
                key={sm.id}
                type="button"
                onClick={() => apply(sm)}
                className="h-8 px-3 rounded-full border border-[var(--color-stroke)] bg-[var(--color-elevated)] text-xs"
              >
                {sm.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <div className="label mb-2">Name (optional)</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Chicken & rice bowl"
            list="meal-names"
          />
          {savedMeals.length > 0 && (
            <datalist id="meal-names">
              {savedMeals.map((sm) => (
                <option key={sm.id} value={sm.name} />
              ))}
            </datalist>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Calories" value={calories} onChange={setCalories} />
          <NumField label="Protein (g)" value={protein} onChange={setProtein} />
          <NumField label="Carbs (g)" value={carbs} onChange={setCarbs} />
          <NumField label="Fat (g)" value={fat} onChange={setFat} />
        </div>
        <div>
          <div className="label mb-2">Time</div>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-fg-2)] pt-1">
          <input
            type="checkbox"
            checked={saveFav}
            onChange={(e) => setSaveFav(e.target.checked)}
            className="h-4 w-4"
          />
          Save as favorite
        </label>
      </div>
    </Modal>
  );
}

function EditMealModal({
  meal,
  onClose,
  onSave,
}: {
  meal: Meal | null;
  onClose: () => void;
  onSave: (patch: Partial<Meal>) => void;
}) {
  const open = !!meal;
  const [name, setName] = React.useState("");
  const [calories, setCalories] = React.useState("");
  const [protein, setProtein] = React.useState("");
  const [carbs, setCarbs] = React.useState("");
  const [fat, setFat] = React.useState("");
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    if (!meal) return;
    setName(meal.name ?? "");
    setCalories(String(meal.calories));
    setProtein(String(meal.protein));
    setCarbs(meal.carbs != null ? String(meal.carbs) : "");
    setFat(meal.fat != null ? String(meal.fat) : "");
    setTime(meal.time);
  }, [meal]);

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit meal"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim() || undefined,
                calories: parseInt(calories, 10) || meal.calories,
                protein: parseInt(protein, 10) || meal.protein,
                carbs: carbs ? parseInt(carbs, 10) : undefined,
                fat: fat ? parseInt(fat, 10) : undefined,
                time,
              })
            }
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Calories" value={calories} onChange={setCalories} />
          <NumField label="Protein (g)" value={protein} onChange={setProtein} />
          <NumField label="Carbs (g)" value={carbs} onChange={setCarbs} />
          <NumField label="Fat (g)" value={fat} onChange={setFat} />
        </div>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
    </Modal>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="label mb-2 text-[9px]">{label}</div>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </div>
  );
}

function nowTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

/** Exported so onboarding can set targets via the same helper UI later. */
export type _NutritionTargets = NutritionTargets;
