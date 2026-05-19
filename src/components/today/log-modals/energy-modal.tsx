"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  clearEnergy,
  setEnergy,
  useEnergy,
} from "@/lib/hooks/use-metrics";
import { useSelectedDate } from "../day-context";
import { haptic } from "@/lib/haptics";
import {
  EnergyPeriod,
  ENERGY_PERIODS,
  ENERGY_PERIOD_LABELS,
} from "@/lib/types";
import { currentPeriod } from "@/store/selectors";
import { cn } from "@/lib/utils";

export function EnergyLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const date = useSelectedDate();
  const { energy } = useEnergy(date);

  /** Build the value-by-period map the original UI consumed. */
  const valuesByPeriod = React.useMemo(() => {
    const out: Partial<Record<EnergyPeriod, number>> = {};
    for (const row of energy) {
      out[row.period as EnergyPeriod] = row.value;
    }
    return out;
  }, [energy]);

  const period = React.useMemo(() => currentPeriod(), []);
  const [val, setVal] = React.useState<number>(valuesByPeriod[period] ?? 6);

  React.useEffect(() => {
    if (open) {
      setVal(valuesByPeriod[period] ?? 6);
    }
  }, [open, valuesByPeriod, period]);

  const save = () => {
    void setEnergy(date, period, val);
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Log ${ENERGY_PERIOD_LABELS[period].toLowerCase()} energy`}
      description="One log per period — track your rhythm across the day."
      size="md"
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
        <div className="text-center">
          <div className="label text-[10px]">
            {ENERGY_PERIOD_LABELS[period]}
          </div>
          <div className="text-6xl font-bold tnum mt-2">{val}</div>
          <div className="text-sm text-[var(--color-fg-2)] mt-1">out of 10</div>
        </div>
        <Slider
          value={val}
          min={1}
          max={10}
          step={1}
          onChange={setVal}
          marks={[1, 5, 10]}
        />

        <div className="pt-3 border-t border-[var(--color-stroke)]">
          <div className="label mb-2">Other periods today</div>
          <ul className="space-y-1.5">
            {ENERGY_PERIODS.filter((p) => p !== period).map((p) => (
              <PeriodRow
                key={p}
                period={p}
                value={valuesByPeriod[p]}
                onChange={(v) => void setEnergy(date, p, v)}
                onClear={() => void clearEnergy(date, p)}
              />
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function PeriodRow({
  period,
  value,
  onChange,
  onClear,
}: {
  period: EnergyPeriod;
  value?: number;
  onChange: (v: number) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = React.useState(value ?? 6);
  React.useEffect(() => {
    setDraft(value ?? 6);
  }, [value]);
  return (
    <li className="flex items-center gap-3">
      <div className="w-20 text-xs text-[var(--color-fg-2)]">
        {ENERGY_PERIOD_LABELS[period]}
      </div>
      <Slider
        value={draft}
        min={1}
        max={10}
        step={1}
        onChange={(v) => {
          setDraft(v);
          onChange(v);
          haptic("soft");
        }}
        className="flex-1"
      />
      <div
        className={cn(
          "w-8 text-right text-xs tnum",
          value != null
            ? "text-[var(--color-fg)]"
            : "text-[var(--color-fg-3)]"
        )}
      >
        {value ?? "—"}
      </div>
      {value != null && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
        >
          clear
        </button>
      )}
    </li>
  );
}
