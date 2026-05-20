"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Sun, ChevronDown, X } from "lucide-react";
import { useStore } from "@/store";
import { getOverseerContext } from "@/store/selectors";
import { todayStr, isPast5am } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useIsActualToday } from "./day-context";

export function MorningBriefing() {
  const isToday = useIsActualToday();
  const today = todayStr();
  const cached = useStore((s) => s.settings.morningBriefing);
  const setBriefing = useStore((s) => s.setMorningBriefing);
  const [expanded, setExpanded] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!isToday) return;
    if (dismissed) return;
    if (!isPast5am()) return;
    if (cached?.date === today) return;

    let aborted = false;
    setLoading(true);
    fetch("/api/overseer/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: getOverseerContext() }),
    })
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          if (res.status === 503) {
            // no key; silently skip
            setDismissed(true);
            return;
          }
          throw new Error(await res.text());
        }
        const text = await res.text();
        if (!aborted && text.trim()) {
          setBriefing({ date: today, text: text.trim() });
        }
      })
      .catch((e) => {
        if (!aborted) setError(e.message);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const text = cached?.date === today ? cached.text : null;

  if (!isToday) return null;
  if (dismissed) return null;
  if (!loading && !text && !error) return null;
  if (!isPast5am()) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-0 overflow-hidden border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
    >
      <div className="flex items-stretch p-4 gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <div className="h-9 w-9 grid place-items-center rounded-xl grad-hero text-white">
            <Sun size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="label text-[10px]">Morning briefing</div>
            <div className="text-sm font-semibold tracking-tight">
              {loading ? "Pulling together your day…" : "Today, in one breath"}
            </div>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "text-[var(--color-fg-3)] transition-transform",
              expanded ? "" : "-rotate-90"
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:bg-[var(--color-elevated)] self-center"
        >
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 -mt-2">
          {loading && !text && (
            <div className="h-16 rounded-lg shimmer" />
          )}
          {text && (
            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-[var(--color-fg)]">
              {text}
            </p>
          )}
          {error && (
            <p className="text-xs text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>
      )}
    </motion.section>
  );
}
