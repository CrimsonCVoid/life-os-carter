"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { todayStr, format, fromDateStr } from "@/lib/date";
import { getPhotoDayWindow, isDismissed, setDismissed } from "@/lib/reminders";
import { haptic } from "@/lib/haptics";
import { useBodyPhotoSessions } from "@/lib/hooks/use-body-photo-sessions";
import { PhotoSessionCaptureModal } from "./photo-session-capture-modal";

/**
 * Prominent "Photo day" reminder. Renders only on the 1st-3rd or
 * 15th-17th, and only when no session exists for that target date.
 * Self-dismissed for the current day via localStorage so a hide here
 * doesn't leak to tomorrow.
 *
 * `placement="today"` is a slightly more compact treatment so the
 * banner doesn't dwarf the Today screen's other cards; the Body
 * placement uses the same component (default) which leans into the
 * "this is the headline action" framing.
 */
export function PhotoDayBanner({
  placement = "body",
}: {
  placement?: "today" | "body";
}) {
  const today = todayStr();
  const window = React.useMemo(() => getPhotoDayWindow(today), [today]);
  const { sessions, isLoading } = useBodyPhotoSessions();
  const [dismissed, setDismissedState] = React.useState(false);
  const [captureOpen, setCaptureOpen] = React.useState(false);

  React.useEffect(() => {
    if (window) setDismissedState(isDismissed("photo-day", today));
  }, [today, window]);

  if (!window) return null;
  if (isLoading) return null;
  // Already took photos for the target period → nothing to nag about.
  if (sessions.some((s) => s.date === window.target)) return null;
  if (dismissed) return null;

  const dateLabel = format(fromDateStr(window.target), "MMMM d");
  const heading = window.onTarget
    ? "Body composition photo day"
    : `You missed photo day on ${dateLabel}`;
  const subhead = window.onTarget
    ? `It's the ${window.target.endsWith("-01") ? "1st" : "15th"} — take your progress photos.`
    : `Want to take them ${window.daysLate === 1 ? "today" : "now"}?`;

  const onDismiss = () => {
    setDismissed("photo-day", today);
    setDismissedState(true);
    haptic("soft");
  };

  return (
    <>
      <div
        className="card p-4 relative overflow-hidden"
        style={{
          borderColor:
            "color-mix(in srgb, var(--color-accent) 36%, var(--color-stroke))",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 14%, var(--color-card)) 0%, var(--color-card) 70%)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="h-10 w-10 grid place-items-center rounded-xl shrink-0"
            style={{
              background:
                "color-mix(in srgb, var(--color-accent) 22%, transparent)",
              color: "var(--color-accent)",
            }}
          >
            <Camera size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[var(--color-fg)]">
              {heading}
            </div>
            <div className="text-[12px] text-[var(--color-fg-2)] mt-0.5">
              {subhead}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss for today"
            className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:bg-[var(--color-elevated)] transition shrink-0 -mr-2 -mt-2"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              haptic("tap");
              setCaptureOpen(true);
            }}
          >
            <Camera size={13} />
            Take photos
          </Button>
          {placement === "today" && (
            <Link
              href="/body"
              className="text-[12px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)] px-2 py-1"
            >
              Open Body →
            </Link>
          )}
        </div>
      </div>

      <PhotoSessionCaptureModal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
      />
    </>
  );
}
