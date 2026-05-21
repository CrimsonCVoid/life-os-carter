"use client";

import * as React from "react";
import { motion } from "motion/react";
import type { ZoneMinutes } from "@/lib/types";
import { cn } from "@/lib/utils";

const ZONE_LABELS: Record<keyof ZoneMinutes, string> = {
  zone1: "Z1",
  zone2: "Z2",
  zone3: "Z3",
  zone4: "Z4",
  zone5: "Z5",
};

const ZONE_DESCRIPTIONS: Record<keyof ZoneMinutes, string> = {
  zone1: "Active recovery",
  zone2: "Aerobic base",
  zone3: "Tempo",
  zone4: "Threshold",
  zone5: "VO₂ max",
};

const ZONE_RANGES: Record<keyof ZoneMinutes, string> = {
  zone1: "50–60% HRR",
  zone2: "60–70% HRR",
  zone3: "70–80% HRR",
  zone4: "80–90% HRR",
  zone5: "90–100% HRR",
};

/**
 * Horizontal stacked-bar breakdown of time spent in each HR zone during
 * a workout. Width is proportional to total zone minutes. Each zone bar
 * shows minutes inline. Whoop-style — at-a-glance "what intensity was this".
 */
export function HrZoneBars({
  zoneMinutes,
  className,
}: {
  zoneMinutes: ZoneMinutes;
  className?: string;
}) {
  const zones = ["zone1", "zone2", "zone3", "zone4", "zone5"] as const;
  const total = zones.reduce((acc, z) => acc + (zoneMinutes[z] ?? 0), 0);
  if (total <= 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {zones.map((z) => {
        const minutes = zoneMinutes[z] ?? 0;
        const pct = total > 0 ? (minutes / total) * 100 : 0;
        if (minutes <= 0) return null;
        return (
          <div key={z} className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
            <span
              className="text-[10px] font-bold tabular-nums tracking-wider"
              style={{ color: `var(--mc-${zoneVarName(z)})` }}
            >
              {ZONE_LABELS[z]}
            </span>
            <div className="relative h-5 rounded-md overflow-hidden bg-[var(--color-elevated)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-md"
                style={{
                  background: `linear-gradient(90deg, ${zoneColor(z)} 0%, ${zoneColorAccent(z)} 100%)`,
                }}
              />
              <span className="absolute inset-0 flex items-center justify-end px-1.5 text-[10px] text-[var(--color-fg)] font-medium tnum">
                {minutes}m · {Math.round(pct)}%
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] whitespace-nowrap">
              {ZONE_RANGES[z]}
            </span>
          </div>
        );
      })}
      <div className="text-[10px] text-[var(--color-fg-3)] pt-1">
        {zones
          .filter((z) => (zoneMinutes[z] ?? 0) > 0)
          .map((z) => `${ZONE_LABELS[z]} ${ZONE_DESCRIPTIONS[z].toLowerCase()}`)
          .join(" · ")}
      </div>
    </div>
  );
}

// Use the existing metric color palette — sleep / strain / accent / etc map
// nicely to zone progression without inventing a new palette.
function zoneVarName(z: keyof ZoneMinutes): string {
  switch (z) {
    case "zone1":
      return "sleep"; // indigo — relaxed
    case "zone2":
      return "water"; // cyan — easy aerobic
    case "zone3":
      return "steps"; // lime — tempo
    case "zone4":
      return "calories"; // amber — threshold
    case "zone5":
      return "rhr"; // coral — peak
  }
}

function zoneColor(z: keyof ZoneMinutes): string {
  switch (z) {
    case "zone1":
      return "rgb(99, 102, 241)";
    case "zone2":
      return "rgb(34, 211, 238)";
    case "zone3":
      return "rgb(132, 204, 22)";
    case "zone4":
      return "rgb(245, 158, 11)";
    case "zone5":
      return "rgb(244, 63, 94)";
  }
}

function zoneColorAccent(z: keyof ZoneMinutes): string {
  switch (z) {
    case "zone1":
      return "rgb(129, 140, 248)";
    case "zone2":
      return "rgb(103, 232, 249)";
    case "zone3":
      return "rgb(190, 242, 100)";
    case "zone4":
      return "rgb(251, 191, 36)";
    case "zone5":
      return "rgb(251, 113, 133)";
  }
}
