"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Activity, X } from "lucide-react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  LiftExercise,
  LiftSession,
  WorkoutHRSeries,
} from "@/lib/types";
import { haptic } from "@/lib/haptics";

type DetectedSession = {
  startTime: string;
  endTime: string;
  activityType?: string;
  caloriesBurned?: number;
  source?: string;
};

const DISMISS_KEY = "life-os:detected-session-dismissed";

export function DetectedSessionCard() {
  const liftSessions = useStore((s) => s.liftSessions);
  const addLiftSession = useStore((s) => s.addLiftSession);
  const saveWorkoutHRSeries = useStore((s) => s.saveWorkoutHRSeries);

  const [detected, setDetected] = React.useState<DetectedSession[]>([]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  });

  React.useEffect(() => {
    const today = todayStr();
    fetch(
      `/api/workout-hr/detected-sessions?start=${today}&end=${today}`,
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.ok) setDetected(j.sessions ?? []);
      })
      .catch(() => undefined);
  }, []);

  const persistDismissed = (next: Set<string>) => {
    setDismissed(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          DISMISS_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch {
        /* localStorage full / unavailable — non-fatal */
      }
    }
  };

  const candidates = React.useMemo(
    () =>
      detected.filter((d) => {
        if (dismissed.has(d.startTime)) return false;
        const dStart = new Date(d.startTime).getTime();
        const overlap = liftSessions.some((s) => {
          if (s.date !== todayStr()) return false;
          const sStart = new Date(s.createdAt).getTime();
          return Math.abs(sStart - dStart) < 15 * 60 * 1000;
        });
        return !overlap;
      }),
    [detected, dismissed, liftSessions]
  );

  if (candidates.length === 0) return null;

  const importSession = (d: DetectedSession) => {
    const sessionId = uid();
    const startedAt = d.startTime;
    const endedAt = d.endTime;
    const stubExercise: LiftExercise = {
      id: uid(),
      name: prettyActivity(d.activityType ?? "Cardio"),
      normalizedName: prettyActivity(d.activityType ?? "cardio").toLowerCase(),
      sets: [],
    };
    const session: LiftSession = {
      id: sessionId,
      date: todayStr(),
      exercises: [stubExercise],
      createdAt: startedAt,
    };
    addLiftSession(session);

    // Stub HR series; client will trigger a real sync after this.
    const stub: WorkoutHRSeries = {
      sessionId,
      startedAt,
      endedAt,
      samples: [],
      caloriesBurned: d.caloriesBurned,
      syncedAt: new Date().toISOString(),
    };
    saveWorkoutHRSeries(stub);

    fetch("/api/workout-hr/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sessionId, startedAt, endedAt }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.ok) saveWorkoutHRSeries(j.series);
      })
      .catch(() => undefined);

    const next = new Set(dismissed);
    next.add(d.startTime);
    persistDismissed(next);
    haptic("success");
  };

  return (
    <div className="space-y-2">
      {candidates.map((d) => (
        <motion.div
          key={d.startTime}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="rounded-2xl border border-[color:color-mix(in_srgb,var(--pillar-strain)_36%,var(--color-stroke))] bg-[color:color-mix(in_srgb,var(--pillar-strain)_10%,var(--color-card))] p-3 flex items-center gap-3"
        >
          <div className="h-10 w-10 grid place-items-center rounded-full bg-[var(--color-card)] border border-[var(--color-stroke)]">
            <Activity
              size={16}
              style={{ color: "var(--pillar-strain)" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "var(--pillar-strain)" }}>
              Fitbit detected workout
            </div>
            <div className="text-[12px] tnum text-[var(--color-fg-2)]">
              {fmtTime(d.startTime)} · {fmtDuration(d)} ·{" "}
              {prettyActivity(d.activityType)}
              {d.caloriesBurned != null && ` · ${Math.round(d.caloriesBurned)} kcal`}
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            haptic="success"
            onClick={() => importSession(d)}
          >
            Import
          </Button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              const next = new Set(dismissed);
              next.add(d.startTime);
              persistDismissed(next);
              haptic("soft");
            }}
            className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] active:scale-90"
          >
            <X size={13} />
          </button>
        </motion.div>
      ))}
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDuration(d: DetectedSession): string {
  const ms =
    new Date(d.endTime).getTime() - new Date(d.startTime).getTime();
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function prettyActivity(type: string | undefined): string {
  if (!type) return "Workout";
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
