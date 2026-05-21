"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Dumbbell, ChevronRight, Trophy, Timer } from "lucide-react";
import { useDay } from "@/components/today/day-context";
import { useStore } from "@/store";
import { findLastSessionFor } from "@/lib/workout-history";
import { topSet, totalVolume } from "@/lib/repcount";
import type { LiftSet } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { LiftSession } from "@/lib/types";

/**
 * Performance lane — the "lift today" surface. Three states:
 *   1. Active session in progress: live banner with elapsed time + sets count
 *      and a "Resume" CTA
 *   2. Today's workout already finished: summary chip with sets / top / vol
 *      and any PR badges
 *   3. Nothing yet today: shows last session age + a "Start workout" CTA,
 *      letting the user pick up the cadence
 */
export function PerformanceLane() {
  const { date } = useDay();
  const liftSessions = useStore((s) => s.liftSessions);
  const activeWorkout = useStore((s) => s.activeWorkout);

  const todaysSession = React.useMemo(
    () => liftSessions.find((s) => s.date === date) ?? null,
    [liftSessions, date]
  );

  const lastSession = React.useMemo<LiftSession | null>(() => {
    if (todaysSession) return null;
    if (liftSessions.length === 0) return null;
    return [...liftSessions]
      .filter((s) => s.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }, [liftSessions, todaysSession, date]);

  const accent = "var(--pillar-strain)";

  if (activeWorkout) {
    return <ActiveBanner accent={accent} />;
  }

  if (todaysSession) {
    return <CompletedSummary session={todaysSession} accent={accent} liftSessions={liftSessions} />;
  }

  return <ColdStart lastSession={lastSession} accent={accent} />;
}

function LaneShell({
  href,
  accent,
  children,
}: {
  href: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} aria-label="Performance details">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative w-full rounded-2xl border overflow-hidden p-4",
          "active:scale-[0.995] transition-transform duration-[80ms]"
        )}
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, var(--color-card)) 0%, var(--color-card) 70%)`,
          borderColor: `color-mix(in srgb, ${accent} 28%, var(--color-stroke))`,
        }}
      >
        {children}
      </motion.div>
    </Link>
  );
}

function LaneHeader({
  accent,
  label,
  icon,
}: {
  accent: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5">
        <span style={{ color: accent }} className="inline-grid place-items-center">
          {icon}
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.16em] font-semibold"
          style={{ color: accent }}
        >
          {label}
        </span>
      </div>
      <ChevronRight size={14} className="text-[var(--color-fg-3)]" />
    </div>
  );
}

function ActiveBanner({ accent }: { accent: string }) {
  return (
    <LaneShell href="/gym" accent={accent}>
      <LaneHeader accent={accent} label="Performance · live" icon={<Timer size={13} />} />
      <div className="flex items-baseline justify-between">
        <span className="text-[18px] font-semibold text-[var(--color-fg)]">
          Workout in progress
        </span>
        <span className="text-[12px] font-semibold" style={{ color: accent }}>
          Resume →
        </span>
      </div>
      <div className="text-[11px] text-[var(--color-fg-3)] mt-0.5">
        Tap the floating banner anywhere to jump back in.
      </div>
    </LaneShell>
  );
}

function CompletedSummary({
  session,
  accent,
  liftSessions,
}: {
  session: LiftSession;
  accent: string;
  liftSessions: LiftSession[];
}) {
  const sets = session.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const volume = session.exercises.reduce(
    (acc, ex) => acc + totalVolume(ex.sets),
    0
  );
  type TopRow = { name: string; top: LiftSet };
  const topPerExercise = session.exercises
    .map((ex) => {
      const t = topSet(ex.sets);
      return t ? ({ name: ex.name, top: t } satisfies TopRow) : null;
    })
    .filter((x): x is TopRow => x !== null);
  const heaviest = topPerExercise.reduce<TopRow | null>(
    (best, e) => (!best || e.top.weight > best.top.weight ? e : best),
    null
  );

  // PR badge: any exercise's top weight beats the most recent prior best for
  // that exercise → trophy.
  const hasPR = React.useMemo(() => {
    const otherSessions = liftSessions.filter((s) => s.id !== session.id);
    for (const ex of session.exercises) {
      const last = findLastSessionFor(otherSessions, ex.name);
      if (!last) continue;
      const lastBest = last.sets.reduce((m, s) => Math.max(m, s.weight), 0);
      const todayBest = ex.sets.reduce((m, s) => Math.max(m, s.weight), 0);
      if (todayBest > lastBest) return true;
    }
    return false;
  }, [session, liftSessions]);

  return (
    <LaneShell href="/gym" accent={accent}>
      <LaneHeader accent={accent} label="Performance · done" icon={<Dumbbell size={13} />} />
      <div className="flex items-baseline justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[24px] font-bold tnum leading-none text-[var(--color-fg)]">
              {sets}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
              sets
            </span>
            <span className="text-[20px] font-bold tnum leading-none text-[var(--color-fg)] ml-2">
              {volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : Math.round(volume)}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-fg-3)]">
              lb total
            </span>
          </div>
          {heaviest?.top && (
            <div className="text-[11px] text-[var(--color-fg-2)] mt-1 truncate">
              Top: {heaviest.name} · {heaviest.top.weight} × {heaviest.top.reps}
            </div>
          )}
        </div>
        {hasPR && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--color-success) 18%, transparent)",
              color: "var(--color-success)",
            }}
          >
            <Trophy size={10} />
            New PR
          </span>
        )}
      </div>
    </LaneShell>
  );
}

function ColdStart({
  lastSession,
  accent,
}: {
  lastSession: LiftSession | null;
  accent: string;
}) {
  const daysSince = lastSession
    ? Math.max(0, Math.floor((Date.now() - new Date(lastSession.date).getTime()) / 86400000))
    : null;

  return (
    <LaneShell href="/gym" accent={accent}>
      <LaneHeader accent={accent} label="Performance" icon={<Dumbbell size={13} />} />
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[18px] font-semibold text-[var(--color-fg)]">
            Start workout
          </div>
          <div className="text-[11px] text-[var(--color-fg-3)] mt-0.5">
            {daysSince == null
              ? "Log your first session to start tracking."
              : daysSince === 0
                ? "You lifted earlier today — start another?"
                : daysSince === 1
                  ? "Last lifted yesterday."
                  : `Last lifted ${daysSince} days ago.`}
          </div>
        </div>
        <span className="text-[12px] font-semibold" style={{ color: accent }}>
          Open →
        </span>
      </div>
    </LaneShell>
  );
}
