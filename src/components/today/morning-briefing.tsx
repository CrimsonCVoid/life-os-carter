"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Sun, ChevronDown, X, RefreshCw } from "lucide-react";
import { useStore } from "@/store";
import { getOverseerContext } from "@/store/selectors";
import { todayStr, isPast5am } from "@/lib/date";
import { geminiUserMessage } from "@/lib/gemini-error";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useIsActualToday } from "./day-context";

type ErrorKind = "quota" | "missing-key" | "timeout" | "upstream";

export function MorningBriefing() {
  const isToday = useIsActualToday();
  const today = todayStr();
  const cached = useStore((s) => s.settings.morningBriefing);
  const setBriefing = useStore((s) => s.setMorningBriefing);
  const [expanded, setExpanded] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [errorKind, setErrorKind] = React.useState<ErrorKind | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);

  React.useEffect(() => {
    if (!isToday) return;
    if (dismissed) return;
    if (!isPast5am()) return;
    // Honor the per-day cache only when there's actual text. An empty
    // cached entry was written by a previous failed call — we hold off
    // until the next day OR until the user clicks Retry.
    if (cached?.date === today && cached.text) return;

    let aborted = false;
    setLoading(true);
    setErrorKind(null);
    fetch("/api/overseer/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: getOverseerContext() }),
    })
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          const tag = await res.text().catch(() => "");
          const friendly = geminiUserMessage(res.status, tag);
          if (friendly.type === "quota") {
            // Cache empty for today so we don't keep re-calling on every
            // page load while the quota is exhausted.
            setBriefing({ date: today, text: "" });
          }
          setErrorKind(friendly.type);
          return;
        }
        const text = await res.text();
        if (!aborted && text.trim()) {
          setBriefing({ date: today, text: text.trim() });
        }
      })
      .catch(() => {
        if (!aborted) setErrorKind("upstream");
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, retryToken]);

  const text = cached?.date === today ? cached.text : null;

  if (!isToday) return null;
  if (dismissed) return null;
  if (!isPast5am()) return null;
  if (!loading && !text && !errorKind) return null;

  const isError = !!errorKind && !text;
  const canRetry = isError && errorKind !== "quota" && errorKind !== "missing-key";

  const errorMessage = errorKind ? geminiUserMessage(0, statusTagForKind(errorKind)).userMessage : "";

  const onRetry = () => {
    haptic("tap");
    setErrorKind(null);
    setRetryToken((n) => n + 1);
  };

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
              {loading
                ? "Pulling together your day…"
                : isError
                ? "Briefing unavailable"
                : "Today, in one breath"}
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
          {loading && !text && !isError && (
            <div className="h-16 rounded-lg shimmer" />
          )}
          {text && (
            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-[var(--color-fg)]">
              {text}
            </p>
          )}
          {isError && (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-[var(--color-fg-2)]">
                {errorMessage}
              </p>
              {canRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg)] hover:bg-[var(--color-card-hover)] transition"
                >
                  <RefreshCw size={12} />
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

// Round-trip the kind through a tag string so geminiUserMessage stays the
// single source of truth for the copy.
function statusTagForKind(kind: ErrorKind): string {
  if (kind === "quota") return "quota_exceeded";
  if (kind === "missing-key") return "missing-key";
  if (kind === "timeout") return "briefing_timeout";
  return "";
}
