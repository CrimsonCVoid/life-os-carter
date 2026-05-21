"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import type { LiftSession } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { detectPRs, type PR, type PRType } from "@/lib/pr-detection";
import { useStore } from "@/store";
import { HROverlayChart } from "@/components/workout/hr-overlay-chart";

export type WorkoutSummaryProps = {
  open: boolean;
  onClose: () => void;
  session: LiftSession | null;
  durationMs: number;
  history: LiftSession[];
};

const PR_TYPE_LABEL: Record<PRType, string> = {
  "top-set-weight": "Top set weight",
  "top-set-reps": "Reps at weight",
  e1rm: "Est. 1RM",
  volume: "Volume",
};

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 1) return `${h}:${String(m).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatVol(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k lb`;
  return `${Math.round(v)} lb`;
}

function formatPRRight(pr: PR): string {
  switch (pr.type) {
    case "top-set-weight": {
      if (pr.previousValue === 0) return `${pr.newValue} lb (first)`;
      return `${pr.previousValue} → ${pr.newValue} lb (+${pr.delta})`;
    }
    case "top-set-reps":
      return `${pr.previousValue} → ${pr.newValue} reps (+${pr.delta})`;
    case "e1rm":
      return `${pr.previousValue.toFixed(1)} → ${pr.newValue.toFixed(1)} (+${pr.delta.toFixed(1)})`;
    case "volume":
      return `${formatVol(pr.previousValue)} → ${formatVol(pr.newValue)} (+${formatVol(pr.delta)})`;
  }
}

export function WorkoutSummary(
  props: WorkoutSummaryProps
): React.JSX.Element | null {
  const { open, onClose, session, durationMs, history } = props;

  const prs = React.useMemo(
    () => (session ? detectPRs(session, history) : []),
    [session, history]
  );

  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (open && !prevOpenRef.current && prs.length > 0) {
      haptic("success");
    }
    prevOpenRef.current = open;
  }, [open, prs.length]);

  const workoutHRSeries = useStore((s) => s.workoutHRSeries);
  const saveWorkoutHRSeries = useStore((s) => s.saveWorkoutHRSeries);

  // Trigger HR sync once when summary opens for a session that doesn't have HR data yet.
  React.useEffect(() => {
    if (!open || !session) return;
    if (workoutHRSeries[session.id]) return;
    const startedAt = session.createdAt;
    const endedAt = new Date(
      new Date(startedAt).getTime() + durationMs
    ).toISOString();
    fetch("/api/workout-hr/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sessionId: session.id, startedAt, endedAt }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.ok) saveWorkoutHRSeries(j.series);
      })
      .catch(() => undefined);
  }, [open, session, durationMs, workoutHRSeries, saveWorkoutHRSeries]);

  if (!session) return null;

  const hrSeries = workoutHRSeries[session.id];

  const totalVolume = session.exercises.reduce(
    (acc, ex) =>
      acc + ex.sets.reduce((s, set) => s + set.weight * set.reps, 0),
    0
  );
  const totalSets = session.exercises.reduce(
    (acc, ex) => acc + ex.sets.length,
    0
  );
  const exerciseCount = session.exercises.length;

  const handleDone = () => {
    haptic("success");
    onClose();
  };

  const successBg = "color-mix(in srgb, var(--color-success) 8%, var(--color-card))";
  const successBorder =
    "color-mix(in srgb, var(--color-success) 36%, var(--color-stroke))";
  const successIconBg =
    "color-mix(in srgb, var(--color-success) 16%, transparent)";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workout complete"
      size="lg"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          haptic={false}
          onClick={handleDone}
        >
          Done
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="Duration" value={formatDuration(durationMs)} />
        <StatCell
          label="Total volume"
          value={
            totalVolume >= 1000
              ? `${(totalVolume / 1000).toFixed(1)}k lb`
              : `${Math.round(totalVolume)} lb`
          }
        />
        <StatCell
          label="Sets"
          value={`${totalSets}`}
          subtitle={`${exerciseCount} exercises`}
        />
      </div>

      {hrSeries && hrSeries.samples.length >= 3 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-3)] font-medium mb-1.5">
            Heart rate
          </div>
          <HROverlayChart series={hrSeries} />
        </div>
      )}

      {prs.length > 0 && (
        <div>
          <div className="mt-4 mb-2 flex items-center gap-2">
            <Trophy
              size={14}
              style={{ color: "var(--color-success)" }}
            />
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--color-fg)]">
              New PRs
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {prs.map((pr, i) => (
              <motion.div
                key={`${pr.normalizedName}-${pr.type}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  ease: [0.22, 1, 0.36, 1],
                  delay: i * 0.06,
                }}
                className="rounded-xl border p-3 flex items-center gap-3"
                style={{
                  background: successBg,
                  borderColor: successBorder,
                }}
              >
                <div
                  className="h-9 w-9 rounded-full grid place-items-center shrink-0"
                  style={{ background: successIconBg }}
                >
                  <Trophy
                    size={16}
                    style={{ color: "var(--color-success)" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[var(--color-fg)] truncate">
                    {pr.exerciseName}
                  </div>
                  <div className="text-[11px] text-[var(--color-fg-2)]">
                    {PR_TYPE_LABEL[pr.type]}
                  </div>
                </div>
                <div className="text-[13px] tnum text-[var(--color-fg)] text-right shrink-0">
                  {formatPRRight(pr)}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] font-medium mb-2">
          Exercises
        </div>
        <div className="flex flex-col gap-1.5">
          {session.exercises.map((ex) => {
            const perExVol = ex.sets.reduce(
              (s, set) => s + set.weight * set.reps,
              0
            );
            let topW = 0;
            let topR = 0;
            for (const set of ex.sets) {
              if (set.weight > topW) {
                topW = set.weight;
                topR = set.reps;
              } else if (set.weight === topW && set.reps > topR) {
                topR = set.reps;
              }
            }
            return (
              <div
                key={ex.id}
                className={cn(
                  "rounded-lg border border-[var(--color-stroke)] bg-[var(--color-card)] px-3 py-2",
                  "flex items-baseline justify-between gap-3"
                )}
              >
                <div className="text-[13px] font-medium text-[var(--color-fg)] truncate">
                  {ex.name}
                </div>
                <div className="text-[11px] text-[var(--color-fg-2)] tnum shrink-0">
                  {ex.sets.length} sets · {formatVol(perExVol)}
                  {topW > 0 ? ` · top ${topW}×${topR}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function StatCell({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[color:color-mix(in_srgb,var(--color-elevated)_40%,transparent)] p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1">
        {label}
      </div>
      <div className="text-[20px] font-bold tnum text-[var(--color-fg)]">
        {value}
      </div>
      {subtitle && (
        <div className="text-[10px] text-[var(--color-fg-3)] mt-0.5">
          {subtitle}
        </div>
      )}
    </div>
  );
}
