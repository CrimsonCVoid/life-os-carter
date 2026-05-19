"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/sparkline";
import { lastNDates } from "@/lib/date";
import { useStore } from "@/store";
import { setWeight, useWeight } from "@/lib/hooks/use-metrics";
import { round1 } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useSelectedDate } from "../day-context";

export function WeightLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const date = useSelectedDate();
  const { weight } = useWeight(date);
  // Trend still reads from Zustand for now — chart sweep moves to a SWR
  // range hook in a follow-up. The single-day input is the live source.
  const health = useStore((s) => s.health);
  const unit = useStore((s) => s.settings.units.weight);

  const initial = weight?.lb ?? 0;
  const initialDisplay =
    unit === "kg" ? round1(initial * 0.453592) : round1(initial);
  const [val, setVal] = React.useState(initialDisplay > 0 ? String(initialDisplay) : "");

  React.useEffect(() => {
    if (open) {
      const v = weight?.lb ?? 0;
      const d = unit === "kg" ? round1(v * 0.453592) : round1(v);
      setVal(d > 0 ? String(d) : "");
    }
  }, [open, weight, unit]);

  const trend = lastNDates(7).map((d) => {
    const w = health[d]?.weight;
    if (w == null) return null;
    return unit === "kg" ? w * 0.453592 : w;
  });

  const save = () => {
    const numeric = parseFloat(val);
    if (!Number.isFinite(numeric)) {
      onClose();
      return;
    }
    const lbs = unit === "kg" ? numeric / 0.453592 : numeric;
    void setWeight(date, lbs);
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log weight"
      description={`Stored in ${unit === "kg" ? "kilograms" : "pounds"}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="0"
            className="control no-zoom flex-1 h-16 text-4xl font-bold tnum text-center px-3 outline-none accent-ring"
          />
          <div className="h-16 px-4 grid place-items-center rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] text-[var(--color-fg-2)] text-sm font-medium">
            {unit}
          </div>
        </div>
        <div>
          <div className="label mb-2">7-day trend</div>
          <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-3 flex items-center justify-center">
            <Sparkline values={trend} width={240} height={60} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
