"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Droplet, Minus, Plus } from "lucide-react";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { useSelectedDate } from "../day-context";

export function WaterLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const date = useSelectedDate();
  const log = useStore((s) => s.health[date]);
  const target = useStore((s) => s.settings.waterTargetOz);
  const unit = useStore((s) => s.settings.units.liquid);
  const addWater = useStore((s) => s.addWater);
  const setHealth = useStore((s) => s.setHealth);

  const current = log?.waterOz ?? 0;
  const pct = Math.min(1, current / Math.max(1, target));
  const r = 60;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  const fmt = (oz: number) =>
    unit === "ml" ? `${Math.round(oz * 29.5735)} ml` : `${oz} oz`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Water"
      description={`Daily target: ${fmt(target)}`}
      footer={
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setHealth(date, { waterOz: 0 });
              haptic("warn");
            }}
          >
            Reset
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative" style={{ width: 160, height: 160 }}>
          <svg width={160} height={160} className="-rotate-90">
            <circle
              cx={80}
              cy={80}
              r={r}
              stroke="var(--color-stroke-strong)"
              strokeWidth={10}
              fill="none"
            />
            <circle
              cx={80}
              cy={80}
              r={r}
              stroke="var(--color-accent-strong)"
              strokeWidth={10}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={c}
              strokeDashoffset={offset}
              className="ring-anim"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-3xl font-bold tnum">{fmt(current)}</div>
              <div className="text-xs text-[var(--color-fg-2)] mt-1">
                {Math.round(pct * 100)}%
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full">
          {[4, 8, 12, 16, 20, 32].map((oz) => (
            <button
              key={oz}
              type="button"
              onClick={() => {
                addWater(date, oz);
                haptic("tap");
              }}
              className="h-12 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] text-[var(--color-fg)] text-sm font-medium hover:border-[var(--color-stroke-strong)] active:scale-[0.97] transition flex items-center justify-center gap-1.5"
            >
              <Droplet size={14} className="text-[var(--color-accent)]" />
              +{fmt(oz)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              addWater(date, -8);
              haptic("soft");
            }}
            disabled={current <= 0}
            className="h-9 w-9 grid place-items-center rounded-full border border-[var(--color-stroke)] text-[var(--color-fg-2)] disabled:opacity-30 hover:text-[var(--color-fg)]"
          >
            <Minus size={14} />
          </button>
          <span className="text-xs text-[var(--color-fg-2)]">Adjust 8 oz</span>
          <button
            type="button"
            onClick={() => {
              addWater(date, 8);
              haptic("tap");
            }}
            className="h-9 w-9 grid place-items-center rounded-full border border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
