"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Camera, Plus, ScanBarcode, Trash2, Utensils, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store";
import {
  computeTotalsForDay,
  useMealsForDay,
  useTopSavedMeals,
} from "@/store/selectors";
import { Meal, NutritionTargets, SavedMeal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSelectedDate } from "./day-context";
import { haptic } from "@/lib/haptics";
import { PhotoFoodModal } from "./photo-food-modal";
import { BarcodeScanModal } from "./barcode-scan-modal";
import { getMealPhoto } from "@/lib/meal-photo-store";
import { metricColors } from "@/lib/metric-colors";
import { MetricBar } from "@/components/ui/metric-bar";

export function Nutrition() {
  const today = useSelectedDate();
  const targets = useStore((s) => s.settings.nutrition);
  const meals = useMealsForDay(today);
  // surface most-used favorites first; tap-count bumps automatically
  const saved = useTopSavedMeals(20);
  const addMeal = useStore((s) => s.addMeal);
  const updateMeal = useStore((s) => s.updateMeal);
  const removeMeal = useStore((s) => s.removeMeal);
  const logSavedMeal = useStore((s) => s.logSavedMeal);
  const addSavedMeal = useStore((s) => s.addSavedMeal);
  const removeSavedMeal = useStore((s) => s.removeSavedMeal);
  const setNutritionTargets = useStore((s) => s.setNutritionTargets);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Meal | null>(null);
  const [targetsOpen, setTargetsOpen] = React.useState(false);
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const [scanOpen, setScanOpen] = React.useState(false);
  const photoFoodSettings = useStore((s) => s.settings.photoFood);
  const setPhotoFoodSettings = useStore((s) => s.setPhotoFoodSettings);

  const dismissTooltip = () =>
    setPhotoFoodSettings({ seenTooltip: true });

  const totals = computeTotalsForDay(meals);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition</CardTitle>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTargetsOpen(true)}
            title="Set macro targets"
          >
            Targets
          </Button>
          <Button
            size="sm"
            onClick={() => {
              dismissTooltip();
              setPhotoOpen(true);
            }}
          >
            <Camera size={12} />
            Photo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setScanOpen(true)}
            title="Scan a packaged food barcode"
          >
            <ScanBarcode size={12} />
            Scan
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <Plus size={12} />
            Log meal
          </Button>
        </div>
      </CardHeader>

      {!photoFoodSettings.seenTooltip && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-[var(--color-accent-soft)] border border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)] flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--color-accent)] leading-snug">
            <span className="font-semibold">New:</span> tap{" "}
            <Camera size={11} className="inline" /> Photo to log a meal from a
            picture — AI estimates macros for you.
          </div>
          <button
            type="button"
            onClick={dismissTooltip}
            aria-label="Dismiss"
            className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {!targets.enabled && (
        <div className="mb-3 px-3 py-2.5 rounded-xl border border-dashed border-[var(--color-stroke-strong)] flex items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--color-fg-3)] leading-snug">
            Logging meals works without targets — but adding them gives you
            progress bars and adherence stats.
          </div>
          <Button size="sm" variant="secondary" onClick={() => setTargetsOpen(true)}>
            Set targets
          </Button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Macro
          metric="calories"
          label="Cal"
          value={totals.calories}
          target={targets.calories}
          unit=""
        />
        <Macro
          metric="protein"
          label="Protein"
          value={totals.protein}
          target={targets.protein}
          unit="g"
        />
        <Macro
          metric="carbs"
          label="Carbs"
          value={totals.carbs}
          target={targets.carbs}
          unit="g"
        />
        <Macro
          metric="fat"
          label="Fat"
          value={totals.fat}
          target={targets.fat}
          unit="g"
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
                  logSavedMeal(sm.id, today);
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
              {m.thumbnailDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.thumbnailDataUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover shrink-0 border border-[var(--color-stroke)]"
                />
              ) : (
                <span className="text-[11px] text-[var(--color-fg-3)] tnum w-12 shrink-0">
                  {m.time}
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="flex-1 text-left text-sm truncate"
              >
                {m.name || "Meal"}
                {m.thumbnailDataUrl && (
                  <span className="block text-[10px] text-[var(--color-fg-3)] tnum">
                    {m.time}
                  </span>
                )}
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
        date={today}
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
      <TargetsModal
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        targets={targets}
        onSave={(patch) => {
          setNutritionTargets(patch);
          setTargetsOpen(false);
          haptic("success");
        }}
      />
      <PhotoFoodModal
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
      />
      <BarcodeScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onFallbackManual={() => setOpen(true)}
        onFallbackPhoto={() => setPhotoOpen(true)}
      />
    </Card>
  );
}

function TargetsModal({
  open,
  onClose,
  targets,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  targets: NutritionTargets;
  onSave: (patch: Partial<NutritionTargets>) => void;
}) {
  const [enabled, setEnabled] = React.useState(targets.enabled);
  const [cal, setCal] = React.useState(
    targets.calories != null ? String(targets.calories) : ""
  );
  const [protein, setProtein] = React.useState(
    targets.protein != null ? String(targets.protein) : ""
  );
  const [carbs, setCarbs] = React.useState(
    targets.carbs != null ? String(targets.carbs) : ""
  );
  const [fat, setFat] = React.useState(
    targets.fat != null ? String(targets.fat) : ""
  );

  React.useEffect(() => {
    if (open) {
      setEnabled(targets.enabled);
      setCal(targets.calories != null ? String(targets.calories) : "");
      setProtein(targets.protein != null ? String(targets.protein) : "");
      setCarbs(targets.carbs != null ? String(targets.carbs) : "");
      setFat(targets.fat != null ? String(targets.fat) : "");
    }
  }, [open, targets]);

  const toNum = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Macro targets"
      description="Daily numbers used for the progress bars + adherence stats."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                enabled: enabled || !!(toNum(cal) || toNum(protein)),
                calories: toNum(cal),
                protein: toNum(protein),
                carbs: toNum(carbs),
                fat: toNum(fat),
              })
            }
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="label mb-2">Calories</div>
          <Input
            type="number"
            inputMode="numeric"
            value={cal}
            onChange={(e) => setCal(e.target.value)}
            placeholder="2200"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="label mb-2 text-[9px]">Protein (g)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="180"
            />
          </div>
          <div>
            <div className="label mb-2 text-[9px]">Carbs (g)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="—"
            />
          </div>
          <div>
            <div className="label mb-2 text-[9px]">Fat (g)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              placeholder="—"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-fg-2)] cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-accent-strong)]"
          />
          Show progress bars (auto-on once any target is set)
        </label>
      </div>
    </Modal>
  );
}

function Macro({
  metric,
  label,
  value,
  target,
  unit,
}: {
  metric: import("@/lib/metric-colors").Metric;
  label: string;
  value: number;
  target?: number;
  unit: string;
}) {
  const c = metricColors(metric);
  const pct = target ? value / target : 0;
  return (
    <div
      className="rounded-xl border p-2"
      style={{
        background: c.soft,
        borderColor: `color-mix(in srgb, ${c.base} 26%, transparent)`,
      }}
    >
      <div
        className="label text-[9px]"
        style={{ color: c.base, opacity: 0.85 }}
      >
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span
          className="text-base font-semibold tnum"
          style={{ color: c.base }}
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
      <MetricBar metric={metric} value={pct} height={8} className="mt-1.5" />
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
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const pressTimer = React.useRef<number | null>(null);
  const startPress = () => {
    pressTimer.current = window.setTimeout(() => {
      haptic("long");
      setConfirmOpen(true);
    }, 600);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  return (
    <>
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
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onDelete}
        title={`Delete "${meal.name}"?`}
        description="It'll be removed from your favorites."
      />
    </>
  );
}

function LogMealModal({
  open,
  onClose,
  savedMeals,
  date,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  savedMeals: SavedMeal[];
  date: string;
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
        date,
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
        {meal.photoId && <MealPhotoView photoId={meal.photoId} />}
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Calories" value={calories} onChange={setCalories} />
          <NumField label="Protein (g)" value={protein} onChange={setProtein} />
          <NumField label="Carbs (g)" value={carbs} onChange={setCarbs} />
          <NumField label="Fat (g)" value={fat} onChange={setFat} />
        </div>
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        {meal.aiAnalysis && (
          <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)]">
                AI analysis
              </span>
              <Pill
                tone={
                  meal.aiAnalysis.overallConfidence === "high"
                    ? "success"
                    : meal.aiAnalysis.overallConfidence === "medium"
                    ? "warn"
                    : "danger"
                }
                className="h-5 px-2 text-[10px] capitalize"
              >
                {meal.aiAnalysis.overallConfidence} confidence
              </Pill>
            </div>
            {meal.aiAnalysis.identifiedItems.length > 0 && (
              <ul className="text-[11px] text-[var(--color-fg-2)] space-y-0.5">
                {meal.aiAnalysis.identifiedItems.map((it, i) => (
                  <li key={i}>
                    • {it.name}{" "}
                    <span className="text-[var(--color-fg-3)] tnum">
                      ({it.estimatedGrams}g)
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {meal.aiAnalysis.notes && (
              <div className="text-[11px] italic text-[var(--color-fg-3)] leading-relaxed">
                {meal.aiAnalysis.notes}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MealPhotoView({ photoId }: { photoId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    let created: string | null = null;
    getMealPhoto(photoId)
      .then((blob) => {
        if (!blob) {
          if (alive) setMissing(true);
          return;
        }
        created = URL.createObjectURL(blob);
        if (alive) setUrl(created);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photoId]);

  if (missing) {
    return (
      <div className="text-[11px] text-[var(--color-fg-3)] italic">
        Original photo not found on this device.
      </div>
    );
  }
  if (!url) {
    return (
      <div className="h-40 rounded-xl bg-[var(--color-elevated)] grid place-items-center text-[11px] text-[var(--color-fg-3)]">
        loading photo…
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Meal"
      className="w-full max-h-64 object-contain rounded-xl bg-[var(--color-elevated)]"
    />
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
