"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useStore } from "@/store";
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
  const energyMap = useStore((s) => s.energy);
  const setEnergy = useStore((s) => s.setEnergy);
  const clearEnergy = useStore((s) => s.clearEnergy);

  const log = energyMap[date];
  const period = React.useMemo(() => currentPeriod(), []);
  const [val, setVal] = React.useState<number>(
    log?.values[period] ?? 6
  );

  React.useEffect(() => {
    if (open) {
      setVal(log?.values[period] ?? 6);
    }
  }, [open, log, period]);

  const save = () => {
    setEnergy(date, period, val);
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
                value={log?.values[p]}
                onChange={(v) => setEnergy(date, p, v)}
                onClear={() => clearEnergy(date, p)}
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
