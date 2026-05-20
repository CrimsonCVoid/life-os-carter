"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Sparkles, X, MessageCircle, ChevronRight } from "lucide-react";
import { useStore } from "@/store";
import { useOverseer } from "@/components/overseer/overseer-context";
import { buildInsightsContext30d, fingerprintHeadline } from "@/lib/insights";
import { metricColors, type Metric } from "@/lib/metric-colors";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import type { PatternInsight } from "@/lib/types";
import { useIsActualToday } from "./day-context";

const METRIC_FALLBACK: Metric = "protein";

function metricFor(metric: string | undefined): Metric {
  if (!metric) return METRIC_FALLBACK;
  const known: Record<string, Metric> = {
    calories: "calories",
    protein: "protein",
    carbs: "carbs",
    fat: "fat",
    water: "water",
    sleep: "sleep",
    mood: "mood",
    energy: "energy",
    weight: "weight",
    steps: "steps",
  };
  return known[metric] ?? METRIC_FALLBACK;
}

function staleByFrequency(
  date: string,
  freq: "daily" | "every-3" | "weekly"
): boolean {
  const cached = new Date(date);
  const now = new Date();
  const ageDays =
    (now.getTime() - cached.getTime()) / (1000 * 60 * 60 * 24);
  if (freq === "daily") return ageDays >= 1;
  if (freq === "every-3") return ageDays >= 3;
  return ageDays >= 7;
}

export function PatternCard() {
  const isToday = useIsActualToday();
  const settings = useStore((s) => s.settings.insights);
  const cached = useStore((s) => s.cachedPatterns);
  const dismissed = useStore((s) => s.dismissedPatterns);
  const setCachedPatterns = useStore((s) => s.setCachedPatterns);
  const dismissCurrentPattern = useStore(
    (s) => s.dismissCurrentPattern
  );
  const overseer = useOverseer();
  const fetchedRef = React.useRef(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!settings.enabled) return;
    if (fetchedRef.current) return;

    const stale =
      !cached || staleByFrequency(cached.date, settings.frequency);
    if (!stale) return;

    // Only run after 6am local (per spec — "lazy on first open after 6am")
    if (new Date().getHours() < 6) return;

    fetchedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const context = buildInsightsContext30d();
        const recentlyDismissedFingerprints = dismissed
          .filter((d) => {
            const age =
              (Date.now() - new Date(d.dismissedAt).getTime()) /
              (1000 * 60 * 60 * 24);
            return age <= 14;
          })
          .map((d) => d.fingerprint);

        const res = await fetch("/api/patterns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, recentlyDismissedFingerprints }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { patterns: PatternInsight[] };
        // Re-fingerprint client-side as a safety pass
        const withFp = data.patterns.map((p) => ({
          ...p,
          fingerprint: p.fingerprint || fingerprintHeadline(p.headline),
        }));
        setCachedPatterns({
          date: todayStr(),
          patterns: withFp,
          currentIndex: 0,
        });
      } catch {
        // silent — pattern detection is non-essential
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, settings.frequency, cached]);

  if (!settings.enabled) return null;
  if (!isToday) return null;
  if (!cached || cached.patterns.length === 0) {
    if (loading) {
      return (
        <div className="card p-3 flex items-center gap-2 animate-pulse">
          <Sparkles size={14} className="text-[var(--color-accent)]" />
          <span className="text-xs text-[var(--color-fg-3)]">
            Looking for patterns…
          </span>
        </div>
      );
    }
    return null;
  }
  const current = cached.patterns[cached.currentIndex];
  if (!current) return null;

  const metric = metricFor(current.metric);
  const c = metricColors(metric);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
      className="relative overflow-hidden rounded-[var(--radius-card)] border"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${c.base} 12%, var(--color-card)) 0%, var(--color-card) 70%)`,
        borderColor: `color-mix(in srgb, ${c.base} 24%, transparent)`,
      }}
    >
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-8 w-8 grid place-items-center rounded-lg shrink-0"
            style={{ background: c.soft, color: c.base }}
          >
            <Sparkles size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-1"
              style={{ color: c.base, opacity: 0.85 }}
            >
              {current.tone === "positive"
                ? "Pattern · win"
                : current.tone === "nudge"
                ? "Pattern · nudge"
                : "Pattern"}
            </div>
            <div className="text-sm font-medium leading-snug">
              {current.headline}
            </div>
            {current.dataPoint && (
              <div
                className="text-[11px] tnum mt-1"
                style={{ color: c.base }}
              >
                {current.dataPoint}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              haptic("soft");
              dismissCurrentPattern();
            }}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)]"
          >
            <X size={11} />
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              overseer?.open(
                `Tell me about this pattern: "${current.headline}"`
              );
            }}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium"
            style={{
              background: c.soft,
              color: c.base,
            }}
          >
            <MessageCircle size={11} />
            Tell me more
            <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
