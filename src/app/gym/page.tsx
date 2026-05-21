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
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, Download, Pencil, Plus, Square, Timer, Trash2 } from "lucide-react";
import { ActiveWorkoutPage } from "@/components/workout/active-workout-page";
import { RoutineEditor } from "@/components/workout/routine-editor";
import { DetectedSessionCard } from "@/components/workout/detected-session-card";
import { liftSessionsToCsv, downloadCsv } from "@/lib/csv-export";
import { WEEK_DAY_LABELS } from "@/lib/types";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { useStore } from "@/store";
import {
  LiftExercise,
  LiftSession,
  Workout,
} from "@/lib/types";
import {
  bestE1RM,
  estimated1RM,
  topSet,
  totalVolume,
} from "@/lib/repcount";
import { format, fromDateStr } from "@/lib/date";
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
  const unified = useUnifiedGymSessions();

  const [deleteTarget, setDeleteTarget] = React.useState<{
    liftSessionId?: string;
    workoutId?: string;
    date: string;
  } | null>(null);
  const [metric, setMetric] = React.useState<Metric>("top");

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
      subtitle="Start a workout. Routines and progress live below."
    >
      <DetectedSessionCard />
      <TodayRoutineCard />
      <StartWorkoutCTA />
      <RoutinesSection />

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
              No sessions yet — tap "Start workout" above.
            </div>
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

      <ExportCsvButton />

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
  name,
  points,
  metric,
}: {
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
    <Link
      href={`/gym/exercise/${encodeURIComponent(name)}`}
      className="block rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)]/40 p-3 active:scale-[0.99] transition-transform duration-[80ms]"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium truncate inline-flex items-center gap-1">
          {name}
          <ChevronRight size={12} className="text-[var(--color-fg-3)]" />
        </span>
        <span className="text-xs tnum text-[var(--color-fg-2)]">
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
        </span>
      </div>
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
    </Link>
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
          className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
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
            <ExerciseDetail key={ex.id} ex={ex} />
          ))}
        </div>
      )}
    </li>
  );
}

function ExerciseDetail({ ex }: { ex: LiftExercise }) {
  const top = topSet(ex.sets);
  const e1 = bestE1RM(ex.sets);
  return (
    <div className="rounded-lg bg-[var(--color-card)] border border-[var(--color-stroke)] p-2.5">
      <Link
        href={`/gym/exercise/${encodeURIComponent(ex.name)}`}
        className="flex items-center justify-between gap-2 active:opacity-70"
      >
        <span className="text-sm font-medium inline-flex items-center gap-1 min-w-0">
          <span className="truncate">{ex.name}</span>
          <ChevronRight size={12} className="text-[var(--color-fg-3)] shrink-0" />
        </span>
        <span className="text-[10px] text-[var(--color-fg-3)] tnum shrink-0">
          {top &&
            (top.weight > 0
              ? `top ${top.weight}×${top.reps}`
              : `top ${top.reps} reps`)}
          {e1 > 0 && ` · e1RM ${round1(e1)}`}
        </span>
      </Link>
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
            {s.isDropSet && (
              <span className="text-[9px] uppercase tracking-wider text-[var(--color-warning)]">
                drop
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoutinesSection() {
  const templates = useStore((s) => s.workoutTemplates);
  const active = useStore((s) => s.activeWorkout);
  const startFromTemplate = useStore((s) => s.startWorkoutFromTemplate);
  const [pageOpen, setPageOpen] = React.useState(false);
  const [editorRoutineId, setEditorRoutineId] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);

  if (active) return null;

  const openEditor = (id: string | null) => {
    setEditorRoutineId(id);
    setEditorOpen(true);
    haptic("tap");
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="label">Routines</div>
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="text-[11px] text-[var(--color-accent)] active:opacity-70 inline-flex items-center gap-1"
          >
            <Plus size={11} />
            New
          </button>
        </div>
        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-stroke-strong)] py-5 text-center">
            <div className="text-[12px] text-[var(--color-fg-3)] mb-2">
              No routines yet.
            </div>
            <Button variant="secondary" size="sm" onClick={() => openEditor(null)}>
              <Plus size={12} />
              Create routine
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)]",
                  "p-2.5 relative"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    startFromTemplate(t.id);
                    setPageOpen(true);
                  }}
                  className="block w-full text-left active:scale-[0.98] transition-transform duration-[80ms]"
                >
                  <div className="text-[20px] leading-none">{t.icon ?? "🏋️"}</div>
                  <div className="mt-1.5 text-[13px] font-semibold truncate">
                    {t.name}
                  </div>
                  <div className="text-[10px] text-[var(--color-fg-3)] tnum">
                    {t.exercises.length} ex
                    {t.exercises.some((e) => (e.plannedSets?.length ?? 0) > 0)
                      ? " · planned"
                      : ""}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditor(t.id);
                  }}
                  aria-label="Edit routine"
                  className="absolute top-1.5 right-1.5 h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-90"
                >
                  <Pencil size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ActiveWorkoutPage open={pageOpen} onClose={() => setPageOpen(false)} />
      <RoutineEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        routineId={editorRoutineId}
      />
    </>
  );
}

function StartWorkoutCTA() {
  const active = useStore((s) => s.activeWorkout);
  const start = useStore((s) => s.startActiveWorkout);
  const [open, setOpen] = React.useState(false);

  if (active) {
    return (
      <>
        <Button
          onClick={() => setOpen(true)}
          variant="primary"
          className="w-full"
          size="lg"
        >
          <Timer size={16} />
          Continue workout
        </Button>
        <ActiveWorkoutPage open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  return (
    <>
      <Button
        onClick={() => {
          start();
          setOpen(true);
        }}
        variant="primary"
        className="w-full"
        size="lg"
        haptic="success"
      >
        <Square size={14} />
        Start workout
      </Button>
      <ActiveWorkoutPage open={open} onClose={() => setOpen(false)} />
    </>
  );
}


function TodayRoutineCard() {
  const templates = useStore((s) => s.workoutTemplates);
  const active = useStore((s) => s.activeWorkout);
  const startFromTemplate = useStore((s) => s.startWorkoutFromTemplate);
  const [pageOpen, setPageOpen] = React.useState(false);

  if (active) return null;
  const today = new Date().getDay();
  const scheduled = templates.filter((t) =>
    (t.scheduledDays ?? []).includes(today)
  );
  if (scheduled.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--color-accent)_28%,var(--color-stroke))] bg-[color:color-mix(in_srgb,var(--color-accent)_8%,var(--color-card))] p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <CalendarDays size={12} className="text-[var(--color-accent)]" />
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-accent)]">
            On the schedule today — {WEEK_DAY_LABELS[today]}
          </span>
        </div>
        <div className="space-y-1.5">
          {scheduled.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                haptic("tap");
                startFromTemplate(t.id);
                setPageOpen(true);
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl bg-[var(--color-card)] border border-[var(--color-stroke)] active:scale-[0.99] transition-transform duration-[80ms]"
            >
              <span className="text-[20px] leading-none">{t.icon ?? "🏋️"}</span>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[14px] font-semibold tracking-tight truncate">
                  {t.name}
                </div>
                <div className="text-[10px] text-[var(--color-fg-3)] tnum">
                  {t.exercises.length} exercise{t.exercises.length === 1 ? "" : "s"}
                </div>
              </div>
              <ChevronRight size={14} className="text-[var(--color-fg-3)]" />
            </button>
          ))}
        </div>
      </div>
      <ActiveWorkoutPage open={pageOpen} onClose={() => setPageOpen(false)} />
    </>
  );
}

function ExportCsvButton() {
  const liftSessions = useStore((s) => s.liftSessions);
  if (liftSessions.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const csv = liftSessionsToCsv(liftSessions);
        const today = new Date().toISOString().slice(0, 10);
        downloadCsv(`life-os-workouts-${today}.csv`, csv);
        haptic("success");
      }}
      className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[var(--color-stroke-strong)] text-[12px] text-[var(--color-fg-2)] active:scale-[0.99] transition-transform duration-[80ms]"
    >
      <Download size={12} />
      Export all sessions to CSV
    </button>
  );
}
