"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Moon, ChevronDown } from "lucide-react";
import { useStore } from "@/store";
import { useDay } from "@/components/today/day-context";
import { computeSleepNeed } from "@/lib/sleep-need";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export function SleepNeedCard() {
  const { date, isFuture } = useDay();
  const health = useStore((s) => s.health);
  const liftSessions = useStore((s) => s.liftSessions);

  const result = React.useMemo(
    () => computeSleepNeed({ health, liftSessions, today: date }),
    [health, liftSessions, date]
  );

  const [open, setOpen] = React.useState(false);

  if (isFuture) return null;
  if (!Number.isFinite(result.recommendedHours) || result.recommendedHours < 6) {
    return null;
  }

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => {
        setOpen((v) => !v);
        haptic("tap");
      }}
      className={cn(
        "w-full text-left overflow-hidden rounded-2xl p-4",
        "border active:scale-[0.99] transition-transform duration-[80ms] ease-out"
      )}
      style={{
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--pillar-sleep) 14%, var(--color-card)) 0%, var(--color-card) 70%)",
        borderColor:
          "color-mix(in srgb, var(--pillar-sleep) 28%, var(--color-stroke))",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-11 w-11 grid place-items-center rounded-full shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--pillar-sleep) 22%, transparent)",
          }}
        >
          <Moon size={18} style={{ color: "var(--pillar-sleep)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.16em] font-semibold"
            style={{ color: "var(--pillar-sleep)" }}
          >
            Tonight
          </div>
          <div className="text-[24px] font-bold tnum tracking-tight leading-tight">
            {formatHM(result.recommendedHours)}
          </div>
          <div className="text-[11px] text-[var(--color-fg-2)] mt-0.5 line-clamp-2">
            {result.rationale}
          </div>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-[var(--color-fg-3)] transition-transform duration-[160ms]",
            open ? "rotate-180" : ""
          )}
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="sleep-need-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-[var(--color-stroke)] grid grid-cols-3 gap-2 text-center">
              <DetailStat
                label="Avg 5 nights"
                value={`${result.recentAvgHours.toFixed(1)}h`}
              />
              <DetailStat
                label="Sleep debt"
                value={`${result.debtHours.toFixed(1)}h`}
              />
              <DetailStat
                label="Strain add"
                value={`+${formatHM(result.strainAdjustmentHours)}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="text-[13px] font-semibold tnum mt-0.5">{value}</div>
    </div>
  );
}

function formatHM(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
