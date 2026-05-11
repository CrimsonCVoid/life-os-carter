"use client";

import * as React from "react";
import { Download, Upload, Trash2, Check, X, Plus, Sunrise, RotateCcw } from "lucide-react";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleRow } from "@/components/ui/toggle";
import { useStore } from "@/store";
import { AccentColor } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ACCENT_SWATCH: Array<{
  key: AccentColor;
  label: string;
  grad: string;
}> = [
  { key: "violet", label: "Violet", grad: "linear-gradient(135deg,#8B5CF6,#6366F1)" },
  { key: "emerald", label: "Emerald", grad: "linear-gradient(135deg,#10B981,#059669)" },
  { key: "rose", label: "Rose", grad: "linear-gradient(135deg,#F43F5E,#BE185D)" },
  { key: "amber", label: "Amber", grad: "linear-gradient(135deg,#F59E0B,#D97706)" },
];

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const setUnits = useStore((s) => s.setUnits);
  const setAccent = useStore((s) => s.setAccent);
  const setWaterTarget = useStore((s) => s.setWaterTarget);
  const addDayType = useStore((s) => s.addDayType);
  const removeDayType = useStore((s) => s.removeDayType);
  const setRoutineSettings = useStore((s) => s.setRoutineSettings);
  const resetRoutine = useStore((s) => s.resetRoutineToDefaults);
  const exportAll = useStore((s) => s.exportAll);
  const importAll = useStore((s) => s.importAll);
  const clearAll = useStore((s) => s.clearAll);

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [confirmResetRoutine, setConfirmResetRoutine] = React.useState(false);
  const [status, setStatus] = React.useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [newDayType, setNewDayType] = React.useState("");

  React.useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(t);
  }, [status]);

  const onExport = () => {
    const blob = new Blob([exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `life-os-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: "ok", text: "Exported." });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const ok = importAll(text);
    setStatus(
      ok
        ? { kind: "ok", text: "Restored from file." }
        : { kind: "err", text: "Couldn't parse that file." }
    );
    if (ok) haptic("success");
  };

  return (
    <Screen title="Settings">
      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <div>
            <div className="label mb-2">Weight</div>
            <Segmented<"lb" | "kg">
              value={settings.units.weight}
              onChange={(v) => setUnits({ weight: v })}
              options={[
                { value: "lb", label: "Pounds (lb)" },
                { value: "kg", label: "Kilograms (kg)" },
              ]}
            />
          </div>
          <div>
            <div className="label mb-2">Liquid</div>
            <Segmented<"oz" | "ml">
              value={settings.units.liquid}
              onChange={(v) => setUnits({ liquid: v })}
              options={[
                { value: "oz", label: "Ounces (oz)" },
                { value: "ml", label: "Milliliters (ml)" },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accent color</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-4 gap-2">
          {ACCENT_SWATCH.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAccent(a.key)}
              className={cn(
                "h-16 rounded-xl text-white text-[11px] font-medium relative overflow-hidden border-2 transition",
                settings.accent === a.key
                  ? "border-white/40"
                  : "border-transparent"
              )}
              style={{ background: a.grad }}
            >
              <span className="absolute left-2 bottom-1.5">{a.label}</span>
              {settings.accent === a.key && (
                <span className="absolute top-1.5 right-1.5 h-5 w-5 grid place-items-center rounded-full bg-white/20">
                  <Check size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Water target</CardTitle>
          <span className="text-sm tnum">
            {settings.units.liquid === "ml"
              ? `${Math.round(settings.waterTargetOz * 29.5735)} ml`
              : `${settings.waterTargetOz} oz`}
          </span>
        </CardHeader>
        <Slider
          value={settings.waterTargetOz}
          min={32}
          max={160}
          step={8}
          onChange={setWaterTarget}
          marks={[32, 96, 160]}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Day types</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-1.5">
          {settings.dayTypePresets.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => removeDayType(d)}
              className="group h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-stroke)] text-xs text-[var(--color-fg-2)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_32%,transparent)] transition"
            >
              {d}
              <X size={11} className="opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = newDayType.trim();
            if (!v) return;
            addDayType(v);
            setNewDayType("");
          }}
          className="mt-3 flex items-center gap-2"
        >
          <Input
            value={newDayType}
            onChange={(e) => setNewDayType(e.target.value)}
            placeholder="Add a day type"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newDayType.trim()}
            aria-label="Add"
          >
            <Plus size={16} />
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Morning Routine</CardTitle>
          <Sunrise size={14} className="text-[var(--color-accent)]" />
        </CardHeader>
        <div className="space-y-1">
          <ToggleRow
            label="Show on Today screen"
            checked={settings.morningRoutine.showOnTodayScreen}
            onChange={(v) => setRoutineSettings({ showOnTodayScreen: v })}
          />
          <ToggleRow
            label="Auto-collapse when complete"
            checked={settings.morningRoutine.autoCollapseWhenDone}
            onChange={(v) => setRoutineSettings({ autoCollapseWhenDone: v })}
          />
          <ToggleRow
            label="Show streak count"
            checked={settings.morningRoutine.showStreak}
            onChange={(v) => setRoutineSettings({ showStreak: v })}
          />
        </div>
        <Button
          variant="secondary"
          className="w-full mt-3"
          onClick={() => setConfirmResetRoutine(true)}
        >
          <RotateCcw size={14} />
          Reset to defaults
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          {status && (
            <span
              className={
                "text-xs " +
                (status.kind === "ok"
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]")
              }
            >
              {status.text}
            </span>
          )}
        </CardHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onExport}>
            <Download size={15} />
            Export JSON
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFile}
          />
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-fg-3)]">
          All data lives in your browser. Export before clearing site data.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger</CardTitle>
        </CardHeader>
        <Button
          variant="danger"
          className="w-full"
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 size={15} />
          Clear all data
        </Button>
      </Card>

      <Modal
        open={confirmResetRoutine}
        onClose={() => setConfirmResetRoutine(false)}
        title="Reset morning routine?"
        description="Replaces your current items with the original 8 defaults. History is kept."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmResetRoutine(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                resetRoutine();
                setConfirmResetRoutine(false);
                setStatus({ kind: "ok", text: "Routine reset." });
                haptic("success");
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-fg-2)]">
          Your daily completion history stays in the device — only the list of items is replaced. You can still edit anything afterwards.
        </p>
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all data?"
        description="This removes goals, habits, workouts, vitals, and journals from this device. Can't be undone."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearAll();
                setConfirmClear(false);
                setStatus({ kind: "ok", text: "All data cleared." });
                haptic("error");
              }}
            >
              Clear everything
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-fg-2)]">
          You should export a JSON backup first if you want to keep this data.
        </p>
      </Modal>
    </Screen>
  );
}
