"use client";

import * as React from "react";
import { Scale, X } from "lucide-react";
import { useWeight, setWeight } from "@/lib/hooks/use-metrics";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { isDismissed, setDismissed } from "@/lib/reminders";
import { haptic } from "@/lib/haptics";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const LB_PER_KG = 2.2046226218;

/**
 * Gentle "log today's weight" prompt. Renders nothing once today's
 * weight exists, has been dismissed, or the user is in mid-form. One
 * line, dismissible, no scary colors — just a nudge.
 *
 * `tone="strong"` (the Body screen) gets a card treatment with a
 * primary action button. `tone="subtle"` (Today screen footer) is a
 * single inline line that opens the same quick-entry modal.
 */
export function DailyWeightNudge({
  tone = "strong",
}: {
  tone?: "strong" | "subtle";
}) {
  const today = todayStr();
  const { weight, isLoading } = useWeight(today);
  const unit = useStore((s) => s.settings.units.weight);
  const [dismissed, setDismissedState] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setDismissedState(isDismissed("weight", today));
  }, [today]);

  if (isLoading || weight || dismissed) return null;

  const onDismiss = () => {
    setDismissed("weight", today);
    setDismissedState(true);
    haptic("soft");
  };

  if (tone === "subtle") {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setOpen(true);
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)] py-2"
        >
          <Scale size={12} />
          Log today&rsquo;s weight
        </button>
        <DailyWeightEntryModal
          open={open}
          onClose={() => setOpen(false)}
          unit={unit}
        />
      </>
    );
  }

  return (
    <>
      <div className="card p-4 flex items-center gap-3">
        <div
          aria-hidden
          className="h-10 w-10 grid place-items-center rounded-xl shrink-0"
          style={{
            background: "color-mix(in srgb, var(--mc-weight) 14%, transparent)",
            color: "var(--mc-weight)",
          }}
        >
          <Scale size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--color-fg)]">
            Log today&rsquo;s weight
          </div>
          <div className="text-[12px] text-[var(--color-fg-3)]">
            Quick daily entry — same time each morning is best.
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            haptic("tap");
            setOpen(true);
          }}
        >
          Log
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss reminder"
          className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:bg-[var(--color-elevated)] transition shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      <DailyWeightEntryModal
        open={open}
        onClose={() => setOpen(false)}
        unit={unit}
      />
    </>
  );
}

function DailyWeightEntryModal({
  open,
  onClose,
  unit,
}: {
  open: boolean;
  onClose: () => void;
  unit: "lb" | "kg";
}) {
  const [val, setVal] = React.useState("");
  React.useEffect(() => {
    if (open) setVal("");
  }, [open]);

  const save = () => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) {
      onClose();
      return;
    }
    const lbs = unit === "kg" ? n * LB_PER_KG : n;
    void setWeight(todayStr(), lbs);
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log today's weight"
      description={`Stored in ${unit === "kg" ? "kilograms" : "pounds"}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!val.trim()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex items-end gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="control no-zoom flex-1 h-16 text-4xl font-bold tnum text-center px-3 outline-none accent-ring"
        />
        <div className="h-16 px-4 grid place-items-center rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] text-[var(--color-fg-2)] text-sm font-medium">
          {unit}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-fg-3)] text-center">
        Try to weigh in at the same time each day — first thing in the morning is the most consistent.
      </p>
    </Modal>
  );
}

