"use client";

import * as React from "react";
import { StepsTile } from "./steps-tile";
import { HrvTile } from "./hrv-tile";
import { SleepScoreTile } from "./sleep-score-tile";
import { VitalsDetailModal } from "./vitals-detail-modal";
import { maybeAutoSync } from "@/lib/integrations/google-health/sync-client";

type VitalKey = "steps" | "hrv" | "sleep";

export function VitalsTier() {
  const [open, setOpen] = React.useState<VitalKey | null>(null);

  // On visibility return, kick the (idempotent, freshness-guarded) auto-sync
  // so a watch reading that landed while the tab was hidden shows up. The
  // tiles re-read from the store automatically once new data is written.
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void maybeAutoSync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <section aria-label="Vitals">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="label">Vitals</h2>
      </div>
      <div
        className="flex gap-3 overflow-x-auto hide-scroll snap-x snap-mandatory -mx-4 px-4 pb-1 sm:overflow-visible sm:px-0 sm:mx-0 sm:gap-4"
        // touch-action: pan-x isolates horizontal pans so vertical
        // scroll on the page never gets trapped inside the row. The
        // page parent uses pan-y for the inverse — see app/page.tsx.
        style={{ touchAction: "pan-x" }}
      >
        <StepsTile onActivate={() => setOpen("steps")} />
        <HrvTile onActivate={() => setOpen("hrv")} />
        <SleepScoreTile onActivate={() => setOpen("sleep")} />
      </div>

      <VitalsDetailModal vital={open} onClose={() => setOpen(null)} />
    </section>
  );
}
