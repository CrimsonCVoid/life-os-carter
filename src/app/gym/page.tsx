"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ChevronDown, Dumbbell, Plus, Trash2, TrendingUp, Trophy, Sparkles, Settings as SettingsIcon, X } from "lucide-react";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { ActiveWorkoutPage } from "@/components/workout/active-workout-page";
import { RoutineEditor } from "@/components/workout/routine-editor";
import { DetectedSessionCard } from "@/components/workout/detected-session-card";
import { useWorkoutRoutines } from "@/lib/hooks/use-workout-routines";
import { liftSessionsToCsv, downloadCsv } from "@/lib/csv-export";
import { compoundRecords } from "@/lib/pr-detection";
import { Trophy as TrophyIcon, Flame as StreakIcon } from "lucide-react";
import { useStore } from "@/store";
import {
  LiftExercise,
  LiftSession,
  Workout,
} from "@/lib/types";
import {
  bestE1RM,
  estimated1RM,
  parseRepCount,
  parseResultToSession,
  topSet,
  totalVolume,
} from "@/lib/repcount";
import {
  buildPrefillFromLast,
  exercisePR,
  isPRSession,
  lastSessionFor,
  resolveExerciseSettings,
  suggestionFor,
  type Suggestion,
} from "@/lib/gym-coach";
import { todayStr, format, fromDateStr } from "@/lib/date";
import { round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useUnifiedGymSessions } from "@/store/selectors";

type Metric = "top" | "e1rm" | "volume";

const METRIC_LABEL: Record<Metric, string> = {
  top: "Top set (lb)",
  e1rm: "Est. 1RM (lb)",
  volume: "Volume (lb)",
};

export default function GymPage() {
  const liftSessions = useStore((s) => s.liftSessions);
  const removeLiftSession = useStore((s) => s.removeLiftSession);
  const removeWorkout = useStore((s) => s.removeWorkout);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const startActiveWorkout = useStore((s) => s.startActiveWorkout);
  const unified = useUnifiedGymSessions();
  const { routines } = useWorkoutRoutines();

  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [activePageOpen, setActivePageOpen] = React.useState(false);
  const [routineEditor, setRoutineEditor] = React.useState<{ open: boolean; routineId?: string }>(
    { open: false }
  );
  const [deleteTarget, setDeleteTarget] = React.useState<{
    liftSessionId?: string;
    workoutId?: string;
    date: string;
  } | null>(null);
  const [metric, setMetric] = React.useState<Metric>("top");

  const handleStartWorkout = () => {
    haptic("tap");
    if (!activeWorkout) startActiveWorkout();
    setActivePageOpen(true);
  };

  // Progress charts — unchanged: pure from liftSessions
  const byExercise = React.useMemo(() => {
    const sorted = [...liftSessions].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const map = new Map<
      string,
      {
        displayName: string;
        points: Array<{
          date: string;
          dateLabel: string;
          top: number;
          e1rm: number;
          volume: number;
          repsAtTop: number;
        }>;
      }
    >();
    for (const ses of sorted) {
      for (const ex of ses.exercises) {
        const key = ex.normalizedName;
        const ts = topSet(ex.sets);
        if (!ts) continue;
        const entry =
          map.get(key) ?? {
            displayName: ex.name,
            points: [],
          };
        entry.displayName = entry.displayName || ex.name;
        entry.points.push({
          date: ses.date,
          dateLabel: format(fromDateStr(ses.date), "M/d"),
          top: ts.weight,
          e1rm: bestE1RM(ex.sets),
          volume: totalVolume(ex.sets),
          repsAtTop: ts.reps,
        });
        map.set(key, entry);
      }
    }
    for (const v of map.values()) {
      v.points.sort((a, b) => a.date.localeCompare(b.date));
    }
    return Array.from(map.entries()).sort(
      (a, b) => b[1].points.length - a[1].points.length
    );
  }, [liftSessions]);

  return (
    <Screen
      title="Gym"
      subtitle="Type + duration + sets, all on one screen. Paste from RepCount."
    >
      <Button onClick={handleStartWorkout} className="w-full" size="lg">
        <Dumbbell size={18} />
        {activeWorkout ? "Continue workout" : "Start workout"}
      </Button>

      <RecordsCard liftSessions={liftSessions} />

      <DetectedSessionCard />

      {routines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Routines</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRoutineEditor({ open: true })}
            >
              <Plus size={14} />
              New
            </Button>
          </CardHeader>
          <ul className="space-y-2">
            {routines.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-control)] p-3",
                  "bg-[var(--color-elevated)] border border-[var(--color-stroke)]"
                )}
              >
                <span className="text-lg">{r.icon ?? "💪"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-[var(--color-fg-3)] tnum">
                    {r.exercises.length} exercise
                    {r.exercises.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRoutineEditor({ open: true, routineId: r.id })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    haptic("tap");
                    useStore.getState().startWorkoutFromTemplate(r);
                    setActivePageOpen(true);
                  }}
                  disabled={!!activeWorkout}
                >
                  Start
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {routines.length === 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRoutineEditor({ open: true })}
          className="w-full"
        >
          <Plus size={14} />
          Create your first routine
        </Button>
      )}

      <details className="text-xs text-[var(--color-fg-3)]">
        <summary className="cursor-pointer select-none">More tools</summary>
        <div className="mt-2 flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPasteOpen(true)}
          >
            <Plus size={14} />
            Paste from RepCount
          </Button>
          {liftSessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                haptic("tap");
                downloadCsv(
                  `life-os-workouts-${todayStr()}.csv`,
                  liftSessionsToCsv(liftSessions)
                );
              }}
            >
              Export CSV
            </Button>
          )}
        </div>
      </details>

      {byExercise.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <Segmented<Metric>
              value={metric}
              onChange={setMetric}
              options={[
                { value: "top", label: "Top" },
                { value: "e1rm", label: "1RM" },
                { value: "volume", label: "Vol" },
              ]}
              size="sm"
            />
          </CardHeader>
          <div className="space-y-3">
            {byExercise.map(([key, { displayName, points }]) => (
              <ExerciseChart
                key={key}
                normalizedName={key}
                name={displayName}
                points={points}
                metric={metric}
              />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <span className="text-xs text-[var(--color-fg-3)]">
            {unified.length}{" "}
            {unified.length === 1 ? "session" : "sessions"}
          </span>
        </CardHeader>
        {unified.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-sm text-[var(--color-fg-2)]">
              No sessions yet.
            </div>
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="mt-2 text-xs text-[var(--color-accent)]"
            >
              Log your first →
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {unified.map((s) => (
              <SessionRow
                key={s.date}
                date={s.date}
                workout={s.workout}
                liftSession={s.liftSession}
                onDelete={() =>
                  setDeleteTarget({
                    liftSessionId: s.liftSession?.id,
                    workoutId: s.workout?.id,
                    date: s.date,
                  })
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <NewSessionModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
      />

      <ActiveWorkoutPage
        open={activePageOpen}
        onClose={() => setActivePageOpen(false)}
      />

      <RoutineEditor
        open={routineEditor.open}
        routineId={routineEditor.routineId ?? null}
        onClose={() => setRoutineEditor({ open: false })}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.liftSessionId)
            removeLiftSession(deleteTarget.liftSessionId);
          if (deleteTarget.workoutId)
            removeWorkout(deleteTarget.workoutId);
          haptic("warn");
        }}
        title="Delete this session?"
        description="Removes the workout metadata and any logged sets for this date. Charts update automatically."
      />
    </Screen>
  );
}

function ExerciseChart({
  normalizedName,
  name,
  points,
  metric,
}: {
  normalizedName: string;
  name: string;
  points: Array<{
    date: string;
    dateLabel: string;
    top: number;
    e1rm: number;
    volume: number;
    repsAtTop: number;
  }>;
  metric: Metric;
}) {
  const liftSessions = useStore((s) => s.liftSessions);
  const gymSettings = useStore((s) => s.settings.gym);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const settings = React.useMemo(
    () =>
      resolveExerciseSettings(
        normalizedName,
        {
          targetReps: gymSettings.defaultTargetReps,
          incrementLb: gymSettings.defaultIncrementLb,
        },
        gymSettings.perExercise
      ),
    [normalizedName, gymSettings]
  );
  const last = React.useMemo(
    () => lastSessionFor(liftSessions, normalizedName),
    [liftSessions, normalizedName]
  );
  const suggestion = React.useMemo(
    () => suggestionFor(last, settings),
    [last, settings]
  );
  const pr = React.useMemo(
    () => exercisePR(liftSessions, normalizedName),
    [liftSessions, normalizedName]
  );

  const latest = points[points.length - 1];
  const first = points[0];
  const data = points.map((p) => ({
    date: p.dateLabel,
    v: metric === "top" ? p.top : metric === "e1rm" ? p.e1rm : p.volume,
    reps: p.repsAtTop,
  }));
  const latestV =
    metric === "top"
      ? latest.top
      : metric === "e1rm"
      ? latest.e1rm
      : latest.volume;
  const firstV =
    metric === "top"
      ? first.top
      : metric === "e1rm"
      ? first.e1rm
      : first.volume;
  const delta = latestV - firstV;
  const deltaPct = firstV > 0 ? (delta / firstV) * 100 : null;

  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-3">
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className="text-sm font-medium truncate flex items-center gap-1.5">
          {name}
          {pr && pr.topWeight > 0 && (
            <Trophy
              size={11}
              className="text-[var(--color-warning)] shrink-0"
              aria-label={`PR: ${pr.topWeight}×${pr.topReps}`}
            />
          )}
        </span>
        <span className="text-xs tnum text-[var(--color-fg-2)] flex items-center gap-2">
          {round1(latestV)}
          {metric === "top" || metric === "e1rm" ? " lb" : ""}
          {points.length > 1 && deltaPct != null && (
            <span
              className={cn(
                "ml-2 text-[10px]",
                delta >= 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              )}
            >
              {delta >= 0 ? "+" : ""}
              {round1(delta)}
              {deltaPct != null
                ? ` (${delta >= 0 ? "+" : ""}${Math.round(deltaPct)}%)`
                : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Coach settings"
            className="h-7 w-7 -mr-1 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-accent)]"
          >
            <SettingsIcon size={11} />
          </button>
        </span>
      </div>
      <CoachSuggestion suggestion={suggestion} />
      {pr && pr.e1RM > 0 && (
        <div className="text-[10px] text-[var(--color-fg-3)] mb-1 tnum">
          PR: {pr.topWeight > 0 ? `${pr.topWeight}×${pr.topReps}` : `${pr.topReps} reps`}
          {pr.e1RM > 0 && ` · e1RM ${round1(pr.e1RM)}lb`}
        </div>
      )}
      <div className="text-[10px] text-[var(--color-fg-3)] mb-1">
        {METRIC_LABEL[metric]} · {points.length} sessions
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 2, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="var(--color-stroke)" strokeDasharray="2 4" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "var(--color-fg-3)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-stroke-strong)",
                fontSize: 11,
                borderRadius: 8,
              }}
              labelStyle={{ color: "var(--color-fg-3)" }}
              formatter={(v) => {
                const n = typeof v === "number" ? v : Number(v);
                return metric === "top" || metric === "e1rm"
                  ? `${round1(n)} lb`
                  : `${round1(n)}`;
              }}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="var(--color-accent)"
              strokeWidth={1.6}
              dot={{ r: 2, fill: "var(--color-accent)" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ExerciseCoachSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        normalizedName={normalizedName}
        displayName={name}
        current={settings}
        defaults={{
          targetReps: gymSettings.defaultTargetReps,
          incrementLb: gymSettings.defaultIncrementLb,
        }}
      />
    </div>
  );
}

function CoachSuggestion({ suggestion }: { suggestion: Suggestion }) {
  const Icon =
    suggestion.kind === "graduate"
      ? TrendingUp
      : suggestion.kind === "push"
      ? Sparkles
      : Sparkles;
  const tone =
    suggestion.kind === "graduate"
      ? "var(--color-success)"
      : suggestion.kind === "push"
      ? "var(--color-warning)"
      : "var(--color-fg-3)";
  return (
    <div
      className="mt-0.5 mb-1.5 text-[11px] inline-flex items-center gap-1.5"
      style={{ color: tone }}
    >
      <Icon size={11} />
      <span>{suggestion.message}</span>
    </div>
  );
}

function ExerciseCoachSettingsModal({
  open,
  onClose,
  normalizedName,
  displayName,
  current,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  normalizedName: string;
  displayName: string;
  current: { targetReps: number; incrementLb: number };
  defaults: { targetReps: number; incrementLb: number };
}) {
  const setExSettings = useStore((s) => s.setGymExerciseSettings);
  const overrideRow = useStore(
    (s) => s.settings.gym.perExercise[normalizedName]
  );
  const [targetReps, setTargetReps] = React.useState(current.targetReps);
  const [incrementLb, setIncrementLb] = React.useState(current.incrementLb);

  React.useEffect(() => {
    if (open) {
      setTargetReps(current.targetReps);
      setIncrementLb(current.incrementLb);
    }
  }, [open, current.targetReps, current.incrementLb]);

  const save = () => {
    const patch: { targetReps?: number; incrementLb?: number } = {};
    // Only persist when the value differs from the global default — that
    // way "reset to default" just clears the override row.
    if (targetReps !== defaults.targetReps) patch.targetReps = targetReps;
    if (incrementLb !== defaults.incrementLb) patch.incrementLb = incrementLb;
    setExSettings(normalizedName, patch);
    haptic("success");
    onClose();
  };

  const resetToDefault = () => {
    setExSettings(normalizedName, {
      targetReps: undefined,
      incrementLb: undefined,
    });
    haptic("warn");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Coach: ${displayName}`}
      description="Per-exercise overrides for the progression target and load jump."
      footer={
        <div className="flex items-center justify-end gap-2">
          {overrideRow ? (
            <Button variant="ghost" onClick={resetToDefault}>
              Reset to default
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">
            Target reps (top set){" "}
            <span className="text-[var(--color-fg-3)] tnum normal-case">
              default {defaults.targetReps}
            </span>
          </div>
          <Input
            type="number"
            inputMode="numeric"
            value={targetReps}
            min={1}
            max={30}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) setTargetReps(Math.max(1, Math.min(30, n)));
            }}
          />
          <p className="mt-1 text-[11px] text-[var(--color-fg-3)]">
            Hit this rep count on the top set → coach suggests adding weight.
          </p>
        </div>
        <div>
          <div className="label mb-2">
            Load increment (lb){" "}
            <span className="text-[var(--color-fg-3)] tnum normal-case">
              default {defaults.incrementLb}
            </span>
          </div>
          <Input
            type="number"
            inputMode="decimal"
            step={0.5}
            value={incrementLb}
            min={0.5}
            max={25}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) setIncrementLb(Math.max(0.5, Math.min(25, n)));
            }}
          />
          <p className="mt-1 text-[11px] text-[var(--color-fg-3)]">
            Jump size suggested when you graduate. Squat 5lb, isolation 2.5lb is typical.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function SessionRow({
  date,
  workout,
  liftSession,
  onDelete,
}: {
  date: string;
  workout?: Workout;
  liftSession?: LiftSession;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const upsertWorkoutForDate = useStore((s) => s.upsertWorkoutForDate);
  const dayTypePresets = useStore((s) => s.settings.dayTypePresets);

  const exerciseCount = liftSession?.exercises.length ?? 0;
  const setCount =
    liftSession?.exercises.reduce((a, e) => a + e.sets.length, 0) ?? 0;

  const updateMeta = (
    patch: Partial<Pick<Workout, "type" | "durationMin" | "intensity">>
  ) => upsertWorkoutForDate(date, patch);

  return (
    <li className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {format(fromDateStr(date), "EEEE, MMM d, yyyy")}
            </span>
            {workout?.type && workout.type !== "Other" && (
              <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]">
                {workout.type}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-fg-3)] truncate mt-0.5">
            {liftSession ? (
              <>
                {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} ·{" "}
                {setCount} set{setCount === 1 ? "" : "s"}
              </>
            ) : (
              <>No lift log</>
            )}
            {workout?.durationMin ? ` · ${workout.durationMin} min` : ""}
            {workout?.intensity
              ? ` · intensity ${workout.intensity}/10`
              : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete session"
          className="h-11 w-11 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={13} />
        </button>
        <ChevronDown
          size={14}
          className={cn(
            "text-[var(--color-fg-3)] transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Inline-edit metadata */}
          <div className="rounded-lg bg-[var(--color-card)] border border-[var(--color-stroke)] p-2.5 space-y-2.5">
            <div>
              <div className="label text-[9px] mb-1.5">Workout type</div>
              <div className="flex flex-wrap gap-1.5">
                {dayTypePresets.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => updateMeta({ type: t })}
                    className={cn(
                      "h-7 px-2.5 rounded-full text-[11px] border transition",
                      workout?.type === t
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                        : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="label text-[9px] mb-1.5">Duration (min)</div>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={workout?.durationMin ?? ""}
                  onChange={(e) =>
                    updateMeta({
                      durationMin: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  placeholder="—"
                />
              </div>
              <div>
                <div className="label text-[9px] mb-1.5">
                  Intensity {workout?.intensity ?? 0}/10
                </div>
                <Slider
                  value={workout?.intensity ?? 0}
                  min={0}
                  max={10}
                  step={1}
                  onChange={(v) => updateMeta({ intensity: v })}
                />
              </div>
            </div>
          </div>

          {/* Lift detail */}
          {liftSession?.exercises.map((ex) => (
            <ExerciseDetail key={ex.id} ex={ex} sessionDate={date} />
          ))}
        </div>
      )}
    </li>
  );
}

function ExerciseDetail({ ex, sessionDate }: { ex: LiftExercise; sessionDate: string }) {
  const top = topSet(ex.sets);
  const e1 = bestE1RM(ex.sets);
  const liftSessions = useStore((s) => s.liftSessions);
  const isPR = React.useMemo(
    () => isPRSession(liftSessions, sessionDate, ex.normalizedName, ex.sets),
    [liftSessions, sessionDate, ex.normalizedName, ex.sets]
  );
  return (
    <div className="rounded-lg bg-[var(--color-card)] border border-[var(--color-stroke)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium flex items-center gap-1.5">
          {ex.name}
          {isPR && (
            <span
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium"
              style={{
                background: "color-mix(in srgb, var(--color-warning) 14%, transparent)",
                color: "var(--color-warning)",
              }}
              title="Personal record on this session"
            >
              <Trophy size={9} />
              PR
            </span>
          )}
        </span>
        <span className="text-[10px] text-[var(--color-fg-3)] tnum">
          {top &&
            (top.weight > 0
              ? `top ${top.weight}×${top.reps}`
              : `top ${top.reps} reps`)}
          {e1 > 0 && ` · e1RM ${round1(e1)}`}
        </span>
      </div>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {ex.sets.map((s, i) => (
          <li
            key={i}
            className="text-[12px] text-[var(--color-fg-2)] tnum flex items-baseline gap-2"
          >
            <span className="text-[10px] text-[var(--color-fg-3)] w-4 text-right">
              {i + 1}.
            </span>
            <span>
              {s.weight > 0
                ? `${s.weight} × ${s.reps}`
                : `bodyweight × ${s.reps}`}
            </span>
            {s.weight > 0 && (
              <span className="text-[10px] text-[var(--color-fg-3)]">
                ({round1(estimated1RM(s.weight, s.reps))})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewSessionModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addLiftSession = useStore((s) => s.addLiftSession);
  const upsertWorkoutForDate = useStore((s) => s.upsertWorkoutForDate);
  const dayTypePresets = useStore((s) => s.settings.dayTypePresets);
  const liftSessions = useStore((s) => s.liftSessions);
  const prefillTemplate = React.useMemo(
    () => buildPrefillFromLast(liftSessions),
    [liftSessions]
  );
  const [raw, setRaw] = React.useState("");
  const [fallbackDate, setFallbackDate] = React.useState(todayStr());
  const [workoutType, setWorkoutType] = React.useState("");
  const [durationMin, setDurationMin] = React.useState("");
  const [intensity, setIntensity] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setRaw("");
      setFallbackDate(todayStr());
      setWorkoutType("");
      setDurationMin("");
      setIntensity(0);
    }
  }, [open]);

  const parsed = React.useMemo(
    () => (raw.trim() ? parseRepCount(raw, fallbackDate) : null),
    [raw, fallbackDate]
  );

  const hasMetadata =
    workoutType.trim().length > 0 ||
    durationMin.trim().length > 0 ||
    intensity > 0;
  const hasLog = !!parsed && parsed.exercises.length > 0;
  const canSave = hasLog || hasMetadata;

  const save = () => {
    const date = parsed?.date ?? fallbackDate;
    if (hasLog && parsed) {
      const session = parseResultToSession(parsed, raw);
      addLiftSession(session);
    }
    if (hasMetadata) {
      const dur = parseInt(durationMin, 10);
      upsertWorkoutForDate(date, {
        type: workoutType.trim() || undefined,
        durationMin: Number.isFinite(dur) ? dur : undefined,
        intensity: intensity > 0 ? intensity : undefined,
      });
    }
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New gym session"
      description="Type + duration + intensity are optional. Paste a log for set-by-set tracking."
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Workout type (optional)</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {dayTypePresets.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setWorkoutType(t)}
                className={cn(
                  "h-8 px-3 rounded-full text-xs border transition",
                  workoutType === t
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <Input
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            placeholder="Or type a custom name…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-2">Duration (min)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="—"
            />
          </div>
          <div>
            <div className="label mb-2">Intensity {intensity}/10</div>
            <Slider
              value={intensity}
              min={0}
              max={10}
              step={1}
              onChange={setIntensity}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="label">Paste log (optional)</div>
            {prefillTemplate && !raw && (
              <button
                type="button"
                onClick={() => {
                  setRaw(prefillTemplate);
                  haptic("tap");
                }}
                className="text-[11px] inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
              >
                <Sparkles size={11} />
                Use last session
              </button>
            )}
          </div>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            placeholder={`May 11, 2026

Machine chest press
110 x 13
130 x 9
130 x 10

Pushups
0 x 24
0 x 21

Logged using RepCount`}
            className="font-mono text-[13px]"
          />
        </div>

        <div>
          <div className="label mb-2">Default date (if missing in log)</div>
          <Input
            type="date"
            value={fallbackDate}
            onChange={(e) => setFallbackDate(e.target.value)}
          />
        </div>

        {parsed && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="label">Preview</div>
              <div className="text-[11px] text-[var(--color-fg-3)] tnum">
                {format(fromDateStr(parsed.date), "MMM d, yyyy")} ·{" "}
                {parsed.exercises.length} exercise
                {parsed.exercises.length === 1 ? "" : "s"}
              </div>
            </div>
            {parsed.exercises.length === 0 ? (
              <div className="text-xs text-[var(--color-fg-3)] text-center py-3">
                Nothing parsed yet.
              </div>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto nice-scroll pr-1">
                {parsed.exercises.map((ex, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] p-2.5"
                  >
                    <div className="text-sm font-medium">{ex.name}</div>
                    <div className="mt-1 text-[12px] text-[var(--color-fg-2)] tnum flex flex-wrap gap-x-3">
                      {ex.sets.map((s, j) => (
                        <span key={j}>
                          {s.weight > 0
                            ? `${s.weight}×${s.reps}`
                            : `bw×${s.reps}`}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {parsed.warnings.length > 0 && (
              <details className="text-[11px] text-[var(--color-warning)]">
                <summary className="cursor-pointer">
                  <X size={10} className="inline" /> {parsed.warnings.length}{" "}
                  warning{parsed.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 list-disc pl-4">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------- Records card ----------------------------- */

function computeLiftingStreak(sessions: LiftSession[]): { current: number; longest: number } {
  if (sessions.length === 0) return { current: 0, longest: 0 };
  const days = Array.from(new Set(sessions.map((s) => s.date))).sort();
  let longest = 0;
  let current = 0;
  let last: string | null = null;
  for (const d of days) {
    if (last == null) {
      current = 1;
    } else {
      const prev = new Date(last + "T00:00:00").getTime();
      const cur = new Date(d + "T00:00:00").getTime();
      const gap = Math.round((cur - prev) / 86400000);
      current = gap === 1 ? current + 1 : 1;
    }
    if (current > longest) longest = current;
    last = d;
  }
  // Reset `current` if the last lift wasn't yesterday or today.
  if (last) {
    const lastTs = new Date(last + "T00:00:00").getTime();
    const now = new Date(todayStr() + "T00:00:00").getTime();
    const sinceLast = Math.round((now - lastTs) / 86400000);
    if (sinceLast > 1) current = 0;
  }
  return { current, longest };
}

function RecordsCard({ liftSessions }: { liftSessions: LiftSession[] }) {
  const records = React.useMemo(
    () => compoundRecords(liftSessions),
    [liftSessions]
  );
  const streak = React.useMemo(
    () => computeLiftingStreak(liftSessions),
    [liftSessions]
  );

  if (liftSessions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Records</CardTitle>
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-3)] tnum">
          <TrophyIcon size={11} />
          all-time
        </span>
      </CardHeader>

      <div className="grid grid-cols-2 gap-2">
        <RecordTile
          icon={<StreakIcon size={12} />}
          label="Current streak"
          value={`${streak.current}`}
          unit="days"
          accent="var(--color-accent)"
        />
        <RecordTile
          icon={<TrophyIcon size={12} />}
          label="Longest streak"
          value={`${streak.longest}`}
          unit="days"
          accent="var(--mc-calories)"
        />
        {records.slice(0, 4).map((r) => (
          <RecordTile
            key={r.label}
            label={r.label}
            value={
              r.value >= 1000
                ? `${(r.value / 1000).toFixed(1)}k`
                : String(r.value)
            }
            unit={r.unit}
            subtitle={
              r.date
                ? format(fromDateStr(r.date), "MMM d, yyyy")
                : undefined
            }
            accent="var(--pillar-strain)"
          />
        ))}
      </div>
    </Card>
  );
}

function RecordTile({
  icon,
  label,
  value,
  unit,
  subtitle,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  subtitle?: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        background: `color-mix(in srgb, ${accent} 8%, var(--color-card))`,
        borderColor: `color-mix(in srgb, ${accent} 22%, var(--color-stroke))`,
      }}
    >
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: accent }}
      >
        {icon}
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-[20px] font-bold tnum text-[var(--color-fg)]">
          {value}
        </span>
        <span className="text-[10px] text-[var(--color-fg-3)]">{unit}</span>
      </div>
      {subtitle && (
        <div className="mt-0.5 text-[10px] text-[var(--color-fg-3)] truncate">
          {subtitle}
        </div>
      )}
    </div>
  );
}
