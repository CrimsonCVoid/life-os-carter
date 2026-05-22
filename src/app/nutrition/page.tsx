"use client";

import * as React from "react";
import {
  Camera,
  Plus,
  ScanBarcode,
  Trash2,
  Utensils,
} from "lucide-react";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { DayProvider } from "@/components/today/day-context";
import { FuelCard } from "@/components/today/fuel-card";
import { FastingTimerCard } from "@/components/nutrition/fasting-timer-card";
import { RecipesCard } from "@/components/nutrition/recipes-card";
import { MealShortcutsRow } from "@/components/nutrition/meal-shortcuts-row";
import { PhotoFoodModal } from "@/components/today/photo-food-modal";
import { BarcodeScanModal } from "@/components/today/barcode-scan-modal";
import {
  useMealsForDate,
  createMeal,
  deleteMeal,
} from "@/lib/hooks/use-meals";
import type { MealRow } from "@/lib/data/meals";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";

/**
 * Nutrition screen — composes the v2 SWR-backed nutrition components
 * (FuelCard / FastingTimerCard / RecipesCard / MealShortcutsRow) plus a
 * meals list + log-meal modal so the whole surface reads and writes
 * through /api/data/meals rather than the legacy Zustand path.
 */
export default function NutritionPage() {
  return (
    <DayProvider>
      <NutritionBody />
    </DayProvider>
  );
}

function NutritionBody() {
  const date = todayStr();
  const { meals } = useMealsForDate(date);
  const [logOpen, setLogOpen] = React.useState(false);
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const [scanOpen, setScanOpen] = React.useState(false);

  const sortedMeals = React.useMemo(
    () => [...meals].sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
    [meals]
  );

  return (
    <Screen title="Nutrition" subtitle="Today's fuel, fasting, recipes, and meals.">
      <FuelCard />

      <FastingTimerCard />

      <MealShortcutsRow />

      <Card>
        <CardHeader>
          <CardTitle>Today&rsquo;s meals</CardTitle>
          <span className="text-[11px] text-[var(--color-fg-3)] tnum">
            {sortedMeals.length} logged
          </span>
        </CardHeader>

        {sortedMeals.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--color-fg-2)]">
            Nothing logged yet today. Tap{" "}
            <span className="font-semibold text-[var(--color-accent)]">+ Log meal</span>{" "}
            below to start.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {sortedMeals.map((m) => (
              <MealRowItem key={m.id} meal={m} />
            ))}
          </ul>
        )}

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              haptic("tap");
              setLogOpen(true);
            }}
          >
            <Plus size={13} />
            Log meal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              haptic("tap");
              setPhotoOpen(true);
            }}
          >
            <Camera size={13} />
            Photo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              haptic("tap");
              setScanOpen(true);
            }}
          >
            <ScanBarcode size={13} />
            Barcode
          </Button>
        </div>
      </Card>

      <RecipesCard />

      <LogMealModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        date={date}
      />
      <PhotoFoodModal open={photoOpen} onClose={() => setPhotoOpen(false)} />
      <BarcodeScanModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </Screen>
  );
}

/* ───────────────────────────── meal row ───────────────────────────── */

function MealRowItem({ meal }: { meal: MealRow }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const total = meal.calories ?? 0;
  const macroLine = [
    meal.protein != null ? `${Math.round(meal.protein)}p` : null,
    meal.carbs != null ? `${Math.round(meal.carbs)}c` : null,
    meal.fat != null ? `${Math.round(meal.fat)}f` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2 bg-[var(--color-elevated)] border border-[var(--color-stroke)]">
      <div className="h-9 w-9 grid place-items-center rounded-md bg-[var(--color-card)] border border-[var(--color-stroke)] shrink-0">
        <Utensils size={14} className="text-[var(--color-fg-3)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[var(--color-fg)] truncate">
          {meal.name || "Unnamed meal"}
        </div>
        <div className="text-[11px] text-[var(--color-fg-3)] tnum truncate">
          {meal.time ?? "—"} · {Math.round(total)} kcal{macroLine && ` · ${macroLine}`}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          haptic("warn");
          setConfirmDelete(true);
        }}
        aria-label="Delete meal"
        className="h-11 w-11 grid place-items-center text-[var(--color-fg-3)] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
      >
        <Trash2 size={14} />
      </button>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          void deleteMeal(meal.id, meal.date);
        }}
        title="Delete this meal?"
        description={`${meal.name || "Unnamed meal"} — this removes it from today's totals.`}
      />
    </li>
  );
}

/* ───────────────────────────── log modal ───────────────────────────── */

function LogMealModal({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) {
  const [name, setName] = React.useState("");
  const [calories, setCalories] = React.useState("");
  const [protein, setProtein] = React.useState("");
  const [carbs, setCarbs] = React.useState("");
  const [fat, setFat] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
    }
  }, [open]);

  const canSave =
    name.trim().length > 0 && Number(calories) > 0 && !pending;

  const handleSave = async () => {
    if (!canSave) return;
    setPending(true);
    try {
      await createMeal({
        date,
        time: nowHHMM(),
        name: name.trim(),
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: carbs ? Number(carbs) : null,
        fat: fat ? Number(fat) : null,
        savedMealId: null,
        photoIndexeddbKey: null,
        thumbnailDataUrl: null,
        aiLogged: false,
        aiAnalysis: null,
      });
      haptic("success");
      onClose();
    } catch {
      haptic("error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log a meal"
      description="Quick entry. Save it as a favorite later via the meal row."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            <Plus size={13} />
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grilled chicken + rice"
            className="no-zoom"
          />
        </Field>
        <Field label="Calories">
          <Input
            type="number"
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="kcal"
            className="no-zoom"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Protein (g)">
            <Input
              type="number"
              inputMode="numeric"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="no-zoom"
            />
          </Field>
          <Field label="Carbs (g)">
            <Input
              type="number"
              inputMode="numeric"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              className="no-zoom"
            />
          </Field>
          <Field label="Fat (g)">
            <Input
              type="number"
              inputMode="numeric"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              className="no-zoom"
            />
          </Field>
        </div>
        <p className="text-[11px] text-[var(--color-fg-3)] leading-snug pt-1">
          Tip: photo + barcode buttons in the meals card auto-fill these
          fields via Gemini or the product database.
        </p>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] font-semibold mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
