"use client";

import * as React from "react";
import { Timer, Play, Square, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { ActiveWorkoutPage } from "./active-workout-page";

/**
 * Persistent banner shown across every screen while a workout session is
 * live. Taps the timer area → opens the full set-logger sheet. Pinned just
 * above the bottom nav on mobile, top-right floating chip on desktop.
 */
export function ActiveWorkoutBanner() {
  const pathname = usePathname();
  const active = useStore((s) => s.activeWorkout);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Don't render on auth / onboarding (consistent with other chrome).
  if (pathname === "/login" || pathname.startsWith("/onboarding")) return null;
  if (!active) return null;

  return (
    <>
      <div
        className={cn(
          // Mobile: full-width pill above BottomNav. Desktop: floating chip.
          "fixed left-2 right-2 z-40 md:left-auto md:right-4 md:max-w-sm",
          "bottom-[calc(env(safe-area-inset-bottom)+3.75rem)]",
          "md:bottom-4"
        )}
      >
        <div
          className={cn(
            "ios-blur-card rounded-2xl border border-[var(--color-stroke-strong)]",
            "shadow-[var(--shadow-float)] p-2.5 flex items-center gap-2"
          )}
          style={{ willChange: "transform" }}
        >
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={cn(
              "flex-1 flex items-center gap-3 px-1.5 py-1 text-left rounded-lg",
              "active:scale-[0.98] transition-transform duration-[60ms]"
            )}
          >
            <span
              className="h-9 w-9 grid place-items-center rounded-full"
              style={{
                background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
                color: "var(--color-accent)",
              }}
            >
              <Timer size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <ElapsedTime startedAt={active.startedAt} />
                {active.workoutType && (
                  <span className="text-[11px] text-[var(--color-fg-3)]">
                    · {active.workoutType}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--color-fg-3)] tnum">
                {totalSets(active.exercises)} sets ·{" "}
                {active.exercises.length} exercise
                {active.exercises.length === 1 ? "" : "s"}
              </div>
            </div>
            <ChevronRight size={14} className="text-[var(--color-fg-3)] ml-auto" />
          </button>
        </div>
      </div>
      <ActiveWorkoutPage open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ms = Math.max(0, now - new Date(startedAt).getTime());
  return (
    <span className="text-[15px] font-semibold tnum">{fmtElapsed(ms)}</span>
  );
}

function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function totalSets(exs: { sets: unknown[] }[]): number {
  return exs.reduce((acc, e) => acc + e.sets.length, 0);
}

export { Play, Square };
