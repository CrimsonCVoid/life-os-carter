"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import { DEFAULT_MACRO_TARGETS, type MacroTargets } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type FieldKey = keyof MacroTargets;

type FieldDef = {
  key: FieldKey;
  label: string;
  unit: string;
  kcalPerGram?: number;
};

const FIELDS: FieldDef[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g", kcalPerGram: 4 },
  { key: "carbs", label: "Carbs", unit: "g", kcalPerGram: 4 },
  { key: "fat", label: "Fat", unit: "g", kcalPerGram: 9 },
  { key: "fiber", label: "Fiber", unit: "g", kcalPerGram: 2 },
];

type DraftMap = Record<FieldKey, string>;

function targetsToDraft(t: MacroTargets | undefined): DraftMap {
  return {
    calories: t?.calories != null ? String(t.calories) : "",
    protein: t?.protein != null ? String(t.protein) : "",
    carbs: t?.carbs != null ? String(t.carbs) : "",
    fat: t?.fat != null ? String(t.fat) : "",
    fiber: t?.fiber != null ? String(t.fiber) : "",
  };
}

function draftToTargets(d: DraftMap): MacroTargets {
  const out: MacroTargets = {};
  for (const f of FIELDS) {
    const raw = d[f.key].trim();
    if (!raw) continue;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    out[f.key] = Math.round(n);
  }
  return out;
}

export function MacroGoalsCard() {
  const stored = useStore((s) => s.settings.macroTargets);
  const updateSettings = useStore((s) => s.updateSettings);

  const [draft, setDraft] = React.useState<DraftMap>(() => targetsToDraft(stored));
  const [savedSnapshot, setSavedSnapshot] = React.useState<string>(() =>
    JSON.stringify(targetsToDraft(stored))
  );

  React.useEffect(() => {
    const next = targetsToDraft(stored);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
  }, [stored]);

  const calorieTarget = (() => {
    const n = parseFloat(draft.calories);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  const dirty = JSON.stringify(draft) !== savedSnapshot;

  const setField = (key: FieldKey, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const applyDefaults = () => {
    setDraft(targetsToDraft(DEFAULT_MACRO_TARGETS));
    haptic("tap");
  };

  const resetTargets = () => {
    updateSettings({ macroTargets: undefined });
    setDraft(targetsToDraft(undefined));
    haptic("soft");
  };

  const save = () => {
    const next = draftToTargets(draft);
    updateSettings({ macroTargets: next });
    setSavedSnapshot(JSON.stringify(targetsToDraft(next)));
    haptic("success");
  };

  return (
    <Card id="macros">
      <CardHeader>
        <CardTitle>Macro targets</CardTitle>
        <Button size="sm" variant="secondary" onClick={applyDefaults}>
          Use defaults
        </Button>
      </CardHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => {
          const grams = parseFloat(draft[f.key]);
          const percentOfCal =
            f.kcalPerGram && calorieTarget > 0 && Number.isFinite(grams) && grams > 0
              ? Math.round((grams * f.kcalPerGram * 100) / calorieTarget)
              : null;
          return (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--color-fg-2)] font-medium">
                {f.label}{" "}
                <span className="text-[var(--color-fg-3)] font-normal">
                  ({f.unit})
                </span>
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft[f.key]}
                placeholder="0"
                onChange={(e) => setField(f.key, e.target.value)}
              />
              <span className="text-[11px] text-[var(--color-fg-3)] tnum min-h-[14px]">
                {percentOfCal !== null ? `${percentOfCal}% of cal` : " "}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={resetTargets}>
          Reset (turn off)
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty}
          onClick={save}
          className={cn(!dirty && "opacity-50")}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
