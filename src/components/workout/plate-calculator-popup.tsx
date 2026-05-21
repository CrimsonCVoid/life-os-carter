"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import {
  DEFAULT_BAR_WEIGHTS_LB,
  calculatePlates,
  formatPerSide,
} from "@/lib/plate-calculator";

type Props = {
  open: boolean;
  onClose: () => void;
  totalWeight: number;
  barWeight: number;
  onChangeBarWeight: (n: number) => void;
};

const PLATE_HEIGHT_PX: Record<number, number> = {
  45: 60,
  35: 52,
  25: 44,
  10: 30,
  5: 24,
  2.5: 20,
};

const PLATE_BG: Record<number, string> = {
  45: "color-mix(in srgb, var(--color-danger) 70%, black)",
  35: "color-mix(in srgb, var(--pillar-strain) 70%, black)",
  25: "color-mix(in srgb, var(--color-success) 70%, black)",
  10: "color-mix(in srgb, var(--color-fg-2) 50%, var(--color-elevated))",
  5: "color-mix(in srgb, var(--color-warning) 60%, black)",
  2.5: "color-mix(in srgb, var(--color-fg-3) 60%, var(--color-elevated))",
};

export function PlateCalculatorPopup({
  open,
  onClose,
  totalWeight,
  barWeight,
  onChangeBarWeight,
}: Props) {
  const breakdown = React.useMemo(
    () => calculatePlates(totalWeight, barWeight),
    [totalWeight, barWeight]
  );
  const { perSide, remainder } = breakdown;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plate calculator"
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose} className="w-full">
          Done
        </Button>
      }
    >
      <div className="text-center pb-3 border-b border-[var(--color-stroke)]">
        <div className="text-[40px] font-bold tnum tracking-tight leading-none">
          {totalWeight}
        </div>
        <div className="text-[11px] text-[var(--color-fg-3)] mt-1">lb</div>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1.5 mt-3">
        Bar
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEFAULT_BAR_WEIGHTS_LB.map((w) => {
          const selected = w === barWeight;
          return (
            <button
              key={w}
              type="button"
              onClick={() => {
                onChangeBarWeight(w);
                haptic("soft");
              }}
              className={cn(
                "h-8 px-3 rounded-full text-[12px] tnum transition-colors",
                selected
                  ? "bg-[var(--color-accent-strong)] text-white border border-transparent"
                  : "bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)]"
              )}
            >
              {w === 0 ? "None" : `${w} lb`}
            </button>
          );
        })}
      </div>

      <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-3)] mb-1.5 mt-4">
        Per side
      </div>

      {perSide.length > 0 ? (
        <div className="flex items-end justify-start gap-1 h-[64px] px-1">
          {perSide.map((w, i) => (
            <motion.div
              key={`${w}-${i}`}
              initial={{ scaleY: 0.2, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: 0.32,
                delay: i * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                transformOrigin: "bottom",
                background: PLATE_BG[w],
                height: PLATE_HEIGHT_PX[w],
                width: 22,
              }}
              className="rounded-md flex items-center justify-center shrink-0"
            >
              <span className="text-white text-[10px] tnum font-semibold">
                {w}
              </span>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="h-[64px] grid place-items-center text-[var(--color-fg-3)] text-[18px]">
          —
        </div>
      )}

      <div className="h-px bg-[var(--color-stroke-strong)] mt-1" />

      <div className="text-[13px] tnum text-center mt-3">
        {perSide.length > 0 && remainder === 0 && (
          <span className="text-[var(--color-fg-2)]">
            {formatPerSide(perSide)} per side
          </span>
        )}
        {perSide.length > 0 && remainder !== 0 && (
          <span className="text-[var(--color-fg-2)]">
            {formatPerSide(perSide)} per side ·{" "}
            <span className="text-[var(--color-warning)]">
              {remainder > 0 ? "+" : ""}
              {remainder} lb gap
            </span>
          </span>
        )}
        {perSide.length === 0 && remainder < 0 && (
          <span className="text-[var(--color-fg-3)]">
            Target is below bar weight.
          </span>
        )}
        {perSide.length === 0 && remainder >= 0 && (
          <span className="text-[var(--color-warning)]">
            Add {remainder} lb to load.
          </span>
        )}
      </div>
    </Modal>
  );
}
