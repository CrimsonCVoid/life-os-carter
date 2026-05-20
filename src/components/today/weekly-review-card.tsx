"use client";

import * as React from "react";
import { CalendarRange, ChevronRight, X } from "lucide-react";
import { useStore } from "@/store";
import { buildWeeklyContext, weekBounds } from "@/lib/insights";
import { format, fromDateStr, todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import type { WeeklyReviewData } from "@/lib/types";
import { WeeklyReviewModal } from "./weekly-review-modal";
import { useIsActualToday } from "./day-context";

/** True when local time has passed {triggerDay, triggerHour} for the current week. */
function isTriggerPast(triggerDay: number, triggerHour: number): boolean {
  const now = new Date();
  const dow = now.getDay();
  if (dow > triggerDay) return true;
  if (dow < triggerDay) return false;
  return now.getHours() >= triggerHour;
}

/** Returns the weekStart string for the most recent review-eligible week. */
function lastReviewWeekStart(triggerDay: number, triggerHour: number): string {
  const today = todayStr();
  if (isTriggerPast(triggerDay, triggerHour)) {
    return weekBounds(today).start;
  }
  // Trigger hasn't hit this week yet — show last week's review instead
  const d = new Date(today);
  d.setDate(d.getDate() - 7);
  return weekBounds(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`
  ).start;
}

export function WeeklyReviewCard() {
  const isToday = useIsActualToday();
  const settings = useStore((s) => s.settings.weeklyReview);
  const reviews = useStore((s) => s.weeklyReviews);
  const saveWeeklyReview = useStore((s) => s.saveWeeklyReview);
  const fetchedRef = React.useRef<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const eligible = settings.enabled;
  const targetWeekStart = lastReviewWeekStart(
    settings.triggerDay,
    settings.triggerHour
  );
  const existing = reviews.find((r) => r.weekStart === targetWeekStart);

  React.useEffect(() => {
    if (!eligible) return;
    if (existing) return;
    if (!isTriggerPast(settings.triggerDay, settings.triggerHour)) return;
    if (fetchedRef.current === targetWeekStart) return;
    fetchedRef.current = targetWeekStart;
    (async () => {
      setLoading(true);
      try {
        const bounds = weekBounds(targetWeekStart);
        const context = buildWeeklyContext(bounds.start, bounds.end);
        const res = await fetch("/api/weekly-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const review: WeeklyReviewData = {
          weekStart: bounds.start,
          weekEnd: bounds.end,
          summary: data.summary || "",
          wins: data.wins || [],
          struggles: data.struggles || [],
          trends: data.trends || [],
          nextWeekPriorities: data.nextWeekPriorities || [],
          generatedAt: new Date().toISOString(),
        };
        saveWeeklyReview(review);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, existing, targetWeekStart]);

  if (!eligible) return null;
  if (!isToday) return null;
  if (loading) {
    return (
      <div className="card p-3 flex items-center gap-2 animate-pulse">
        <CalendarRange size={14} className="text-[var(--color-accent)]" />
        <span className="text-xs text-[var(--color-fg-3)]">
          Writing your weekly review…
        </span>
      </div>
    );
  }
  if (!existing) return null;
  if (existing.dismissed) return null;

  const range = `${format(
    fromDateStr(existing.weekStart),
    "MMM d"
  )} – ${format(fromDateStr(existing.weekEnd), "MMM d")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="animate-card-in w-full text-left rounded-[var(--radius-card)] border p-4 relative overflow-hidden card-hover"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 14%, var(--color-card)) 0%, var(--color-card) 70%)",
          borderColor:
            "color-mix(in srgb, var(--color-accent) 28%, transparent)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 grid place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] shrink-0">
            <CalendarRange size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-accent)] font-semibold">
              Your week · {range}
            </div>
            <div className="text-sm leading-snug mt-1 text-[var(--color-fg)]">
              {existing.summary || "Tap to open your weekly review."}
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-accent)]">
              Open review
              <ChevronRight size={12} />
            </div>
          </div>
        </div>
      </button>

      <WeeklyReviewModal
        open={open}
        onClose={() => setOpen(false)}
        review={existing}
      />
    </>
  );
}

/** Small inline X to dismiss-for-this-week — exposed for callers that want it. */
export function DismissWeeklyReviewButton({
  weekStart,
}: {
  weekStart: string;
}) {
  const dismissWeeklyReview = useStore((s) => s.dismissWeeklyReview);
  return (
    <button
      type="button"
      onClick={() => {
        dismissWeeklyReview(weekStart);
        haptic("soft");
      }}
      aria-label="Dismiss this week's review"
      className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)]"
    >
      <X size={13} />
    </button>
  );
}
