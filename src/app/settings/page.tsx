"use client";

import * as React from "react";
import { Download, Upload, Trash2, Check, X, Plus, Sunrise, RotateCcw, Sparkles, CalendarRange, CalendarDays, RotateCw } from "lucide-react";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ToggleRow } from "@/components/ui/toggle";
import { ManageRecurringModal } from "@/components/today/recurring-manage-modal";
import { GoogleHealthCard } from "@/components/settings/google-health-card";
import { PushCard } from "@/components/settings/push-card";
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
  const setBodyProfile = useStore((s) => s.setBodyProfile);
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
          <CardTitle>Body profile</CardTitle>
          <span className="text-xs text-[var(--color-fg-3)]">For BF% & measurements</span>
        </CardHeader>
        <div className="space-y-4">
          <div>
            <div className="label mb-2">Height</div>
            <BodyHeightInput
              valueCm={settings.bodyProfile.heightCm}
              unit={settings.units.weight === "kg" ? "cm" : "in"}
              onChangeCm={(cm) => setBodyProfile({ heightCm: cm })}
            />
            <p className="mt-1.5 text-[11px] text-[var(--color-fg-3)]">
              Used to scale silhouette pixels → cm for the Navy formula. No height = no BF%.
            </p>
          </div>
          <div>
            <div className="label mb-2">Biological sex</div>
            <Segmented<"male" | "female">
              value={settings.bodyProfile.biologicalSex ?? "male"}
              onChange={(v) => setBodyProfile({ biologicalSex: v })}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
            />
            <p className="mt-1.5 text-[11px] text-[var(--color-fg-3)]">
              Navy formula uses different coefficients for each.
            </p>
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

      <EveningRoutineSettingsCard />

      <NutritionSettingsCard />

      <PhotoFoodSettingsCard />

      <DayNavigationSettingsCard />

      <InsightsSettingsCard />

      <WeeklyReviewSettingsCard />

      <VoiceJournalSettingsCard />

      <RecurringGoalsSettingsCard />

      <React.Suspense fallback={null}>
        <GoogleHealthCard />
      </React.Suspense>

      <PushCard />

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

function NutritionSettingsCard() {
  const targets = useStore((s) => s.settings.nutrition);
  const setNutritionTargets = useStore((s) => s.setNutritionTargets);
  const showOnToday = useStore((s) => s.settings.showNutritionOnToday);
  const setShowNutritionOnToday = useStore((s) => s.setShowNutritionOnToday);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition</CardTitle>
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Tracking enabled"
          description="Show macro targets and meal logging."
          checked={targets.enabled}
          onChange={(v) => setNutritionTargets({ enabled: v })}
        />
        <ToggleRow
          label="Show on Today"
          checked={showOnToday}
          onChange={setShowNutritionOnToday}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
          <div key={k}>
            <div className="label mb-2 text-[9px]">
              {k === "calories" ? "Calories" : `${k} (g)`}
            </div>
            <Input
              type="number"
              inputMode="numeric"
              value={targets[k] ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setNutritionTargets({
                  [k]: Number.isFinite(n) ? n : undefined,
                });
              }}
              placeholder="—"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function VoiceJournalSettingsCard() {
  const vj = useStore((s) => s.settings.voiceJournal);
  const setVoiceJournalSettings = useStore((s) => s.setVoiceJournalSettings);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(t);
  }, [status]);

  const onClearAll = async () => {
    setConfirmClear(false);
    try {
      const { clearAllAudio } = await import("@/lib/audio-store");
      await clearAllAudio();
      setStatus("Cleared.");
      haptic("success");
    } catch {
      setStatus("Couldn't clear.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Journal</CardTitle>
        {status && (
          <span className="text-xs text-[var(--color-success)]">{status}</span>
        )}
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Save audio recordings"
          description="Store the original audio on this device. Uses more storage."
          checked={vj.saveRecordings}
          onChange={(v) => setVoiceJournalSettings({ saveRecordings: v })}
        />
        <ToggleRow
          label="Auto-check extracted to-dos"
          description="Pre-select all extracted to-dos in the Review screen."
          checked={vj.autoCheckTodos}
          onChange={(v) => setVoiceJournalSettings({ autoCheckTodos: v })}
        />
        <ToggleRow
          label="Auto-log mood from voice entries"
          description="Write the estimated mood score to today's mood log."
          checked={vj.autoLogMood}
          onChange={(v) => setVoiceJournalSettings({ autoLogMood: v })}
        />
      </div>
      <Button
        variant="secondary"
        className="w-full mt-3"
        onClick={() => setConfirmClear(true)}
      >
        <Trash2 size={14} />
        Clear all saved audio
      </Button>
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)] leading-relaxed">
        Recordings are sent to Google’s Gemini API for transcription. On the
        free tier, Google may use your data to improve their models. Avoid
        recording sensitive information.
      </p>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all saved audio?"
        description="Removes every voice recording stored on this device. Journal entries are kept."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onClearAll}>
              <Trash2 size={14} />
              Clear
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[var(--color-fg-2)]">
          This cannot be undone.
        </div>
      </Modal>
    </Card>
  );
}

function RecurringGoalsSettingsCard() {
  const showIcon = useStore((s) => s.settings.showRecurringIcon);
  const setShowRecurringIcon = useStore((s) => s.setShowRecurringIcon);
  const resetRecurringGenerations = useStore(
    (s) => s.resetRecurringGenerations
  );
  const runRecurringGeneration = useStore((s) => s.runRecurringGeneration);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring Goals</CardTitle>
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Show 🔁 icon on Today"
          description="Marks goals that came from a recurring template."
          checked={showIcon}
          onChange={setShowRecurringIcon}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setManageOpen(true)}>
          Manage
        </Button>
        <Button variant="secondary" onClick={() => setConfirmReset(true)}>
          Reset generations
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)]">
        Reset wipes the generation log so today’s scheduled recurrences run
        again. Past goals already on your calendar are kept.
      </p>

      <ManageRecurringModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
      />

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all generations?"
        description="Clears the generation log. Today's recurring goals will regenerate. Existing past goals are untouched."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetRecurringGenerations();
                runRecurringGeneration();
                setConfirmReset(false);
                haptic("warn");
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[var(--color-fg-2)]" />
      </Modal>
    </Card>
  );
}

function EveningRoutineSettingsCard() {
  const settings = useStore((s) => s.settings.eveningRoutine);
  const setEveningSettings = useStore((s) => s.setEveningSettings);
  const resetEvening = useStore((s) => s.resetEveningToDefaults);
  const [confirmReset, setConfirmReset] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evening Routine</CardTitle>
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Show on Today screen"
          checked={settings.showOnTodayScreen}
          onChange={(v) => setEveningSettings({ showOnTodayScreen: v })}
        />
        <ToggleRow
          label="Auto-collapse when complete"
          checked={settings.autoCollapseWhenDone}
          onChange={(v) => setEveningSettings({ autoCollapseWhenDone: v })}
        />
        <ToggleRow
          label="Show streak count"
          checked={settings.showStreak}
          onChange={(v) => setEveningSettings({ showStreak: v })}
        />
      </div>
      <Button
        variant="secondary"
        className="w-full mt-3"
        onClick={() => setConfirmReset(true)}
      >
        <RotateCcw size={14} />
        Reset to defaults
      </Button>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset evening routine?"
        description="Replaces your current items with the original 6 defaults. History is kept."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetEvening();
                setConfirmReset(false);
                haptic("warn");
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[var(--color-fg-2)]" />
      </Modal>
    </Card>
  );
}


const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DayNavigationSettingsCard() {
  const dn = useStore((s) => s.settings.dayNavigation);
  const setDayNavSettings = useStore((s) => s.setDayNavSettings);

  const clampBack = (n: number) => Math.max(7, Math.min(365, n));
  const clampForward = (n: number) => Math.max(0, Math.min(30, n));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Day Navigation</CardTitle>
        <CalendarDays size={14} className="text-[var(--color-accent)]" />
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Swipe between days"
          description="Horizontal swipe on the Day screen jumps to previous/next day."
          checked={dn.swipeEnabled}
          onChange={(v) => setDayNavSettings({ swipeEnabled: v })}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="label mb-2">Days back</div>
          <Input
            type="number"
            inputMode="numeric"
            value={dn.daysBack}
            min={7}
            max={365}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) {
                setDayNavSettings({ daysBack: clampBack(n) });
              }
            }}
          />
          <div className="mt-1 text-[10px] text-[var(--color-fg-3)]">
            7 – 365
          </div>
        </div>
        <div>
          <div className="label mb-2">Days forward</div>
          <Input
            type="number"
            inputMode="numeric"
            value={dn.daysForward}
            min={0}
            max={30}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) {
                setDayNavSettings({ daysForward: clampForward(n) });
              }
            }}
          />
          <div className="mt-1 text-[10px] text-[var(--color-fg-3)]">
            0 – 30
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)] leading-relaxed">
        Backfill past days or plan ahead — use the arrows in the Day header
        or swipe horizontally to navigate.
      </p>
    </Card>
  );
}

function InsightsSettingsCard() {
  const settings = useStore((s) => s.settings.insights);
  const setInsightsSettings = useStore((s) => s.setInsightsSettings);
  const dismissed = useStore((s) => s.dismissedPatterns);
  const restoreDismissedPattern = useStore((s) => s.restoreDismissedPattern);
  const clearDismissedPatterns = useStore((s) => s.clearDismissedPatterns);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Patterns</CardTitle>
        <Sparkles size={14} className="text-[var(--color-accent)]" />
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Surface daily patterns"
          description="Look for trends and correlations across the last 30 days."
          checked={settings.enabled}
          onChange={(v) => setInsightsSettings({ enabled: v })}
        />
      </div>
      <div className="mt-3">
        <div className="label mb-2">Refresh frequency</div>
        <Segmented<"daily" | "every-3" | "weekly">
          value={settings.frequency}
          onChange={(v) => setInsightsSettings({ frequency: v })}
          options={[
            { value: "daily", label: "Daily" },
            { value: "every-3", label: "Every 3 days" },
            { value: "weekly", label: "Weekly" },
          ]}
        />
      </div>
      {dismissed.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="label">Dismissed ({dismissed.length})</div>
            <button
              type="button"
              onClick={() => clearDismissedPatterns()}
              className="text-[11px] text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
            >
              Clear all
            </button>
          </div>
          <ul className="space-y-1">
            {dismissed.slice(0, 8).map((d) => (
              <li
                key={d.fingerprint}
                className="flex items-start gap-2 py-1 px-2 rounded-md hover:bg-[var(--color-elevated)]"
              >
                <span className="flex-1 text-xs text-[var(--color-fg-2)] leading-snug">
                  {d.headline}
                </span>
                <button
                  type="button"
                  onClick={() => restoreDismissedPattern(d.fingerprint)}
                  aria-label="Restore"
                  className="h-6 w-6 grid place-items-center rounded text-[var(--color-fg-3)] hover:text-[var(--color-accent)]"
                >
                  <RotateCw size={11} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)] leading-relaxed">
        Insights are generated by Google's Gemini API from your local 30-day
        data. Honest signal only — empty days happen.
      </p>
    </Card>
  );
}

function WeeklyReviewSettingsCard() {
  const settings = useStore((s) => s.settings.weeklyReview);
  const setWeeklyReviewSettings = useStore((s) => s.setWeeklyReviewSettings);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Review</CardTitle>
        <CalendarRange size={14} className="text-[var(--color-accent)]" />
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Generate weekly review"
          description="An AI-drafted summary of your week, with wins, struggles, and priorities."
          checked={settings.enabled}
          onChange={(v) => setWeeklyReviewSettings({ enabled: v })}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="label mb-2">Trigger day</div>
          <select
            value={settings.triggerDay}
            onChange={(e) =>
              setWeeklyReviewSettings({ triggerDay: parseInt(e.target.value, 10) })
            }
            className="w-full h-10 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] px-3 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
          >
            {DOW_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="label mb-2">Trigger hour</div>
          <select
            value={settings.triggerHour}
            onChange={(e) =>
              setWeeklyReviewSettings({ triggerHour: parseInt(e.target.value, 10) })
            }
            className="w-full h-10 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] px-3 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0
                  ? "12 AM"
                  : i < 12
                  ? `${i} AM`
                  : i === 12
                  ? "12 PM"
                  : `${i - 12} PM`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)] leading-relaxed">
        Review is generated lazily the first time you open the app after this
        time on the selected day.
      </p>
    </Card>
  );
}

function PhotoFoodSettingsCard() {
  const photoFood = useStore((s) => s.settings.photoFood);
  const setPhotoFoodSettings = useStore((s) => s.setPhotoFoodSettings);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(t);
  }, [status]);

  const onClearAll = async () => {
    setConfirmClear(false);
    try {
      const { clearAllMealPhotos } = await import("@/lib/meal-photo-store");
      await clearAllMealPhotos();
      setStatus("Cleared.");
      haptic("success");
    } catch {
      setStatus("Couldn't clear.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photo Food Logging</CardTitle>
        {status && (
          <span className="text-xs text-[var(--color-success)]">{status}</span>
        )}
      </CardHeader>
      <div className="space-y-1">
        <ToggleRow
          label="Save meal photos"
          description="Store the original photo on this device. Uses more storage."
          checked={photoFood.saveMealPhotos}
          onChange={(v) => setPhotoFoodSettings({ saveMealPhotos: v })}
        />
        <ToggleRow
          label="Auto-fill meal name from AI"
          description="Pre-fills the meal name with the AI's suggestion."
          checked={photoFood.autoFillName}
          onChange={(v) => setPhotoFoodSettings({ autoFillName: v })}
        />
      </div>
      <Button
        variant="secondary"
        className="w-full mt-3"
        onClick={() => setConfirmClear(true)}
      >
        <Trash2 size={14} />
        Clear all saved meal photos
      </Button>
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)] leading-relaxed">
        Photos are sent to Google's Gemini API for analysis. On the free
        tier, Google may use your data to improve their models. Avoid
        photographing anything sensitive in frame.
      </p>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all saved meal photos?"
        description="Removes every meal photo stored on this device. Meal entries (names, macros) are kept."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onClearAll}>
              <Trash2 size={14} />
              Clear
            </Button>
          </div>
        }
      >
        <div className="text-sm text-[var(--color-fg-2)]">
          This cannot be undone.
        </div>
      </Modal>
    </Card>
  );
}

function BodyHeightInput({
  valueCm,
  unit,
  onChangeCm,
}: {
  valueCm: number | undefined;
  unit: "cm" | "in";
  onChangeCm: (cm: number | undefined) => void;
}) {
  if (unit === "in") {
    const totalIn = valueCm != null ? valueCm / 2.54 : NaN;
    const ft = Number.isFinite(totalIn) ? Math.floor(totalIn / 12) : "";
    const inches = Number.isFinite(totalIn)
      ? Math.round(totalIn - Math.floor(totalIn / 12) * 12)
      : "";
    const commit = (nextFt: number | "", nextIn: number | "") => {
      const f = typeof nextFt === "number" ? nextFt : 0;
      const i = typeof nextIn === "number" ? nextIn : 0;
      const cm = (f * 12 + i) * 2.54;
      onChangeCm(cm > 0 ? Math.round(cm * 10) / 10 : undefined);
    };
    return (
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={3}
          max={8}
          step={1}
          placeholder="ft"
          value={ft}
          onChange={(e) => {
            const v = e.target.value;
            commit(v === "" ? "" : Math.max(0, Math.min(9, Math.floor(Number(v)))), inches);
          }}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={11}
          step={1}
          placeholder="in"
          value={inches}
          onChange={(e) => {
            const v = e.target.value;
            commit(ft, v === "" ? "" : Math.max(0, Math.min(11, Math.floor(Number(v)))));
          }}
        />
      </div>
    );
  }
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={100}
      max={230}
      step={0.5}
      placeholder="cm"
      value={valueCm ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChangeCm(v === "" ? undefined : Number(v));
      }}
    />
  );
}
