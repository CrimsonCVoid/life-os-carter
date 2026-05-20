"use client";

/**
 * Reads `?action=...` from the URL on mount and dispatches the matching
 * side-effect. Used by PWA App Shortcuts (long-press home icon) and by
 * notification action buttons to deep-link into specific flows.
 *
 * Supported actions:
 *   ?action=start-workout       (anywhere) — starts an active workout
 *   ?action=log-water           (anywhere) — adds 16oz to today's water
 *   ?action=capture             (/body)    — opens the daily photo modal
 *   ?action=voice               (/journal) — opens the voice journal capture
 *
 * After firing, the action param is removed from the URL with replaceState
 * so a refresh doesn't re-trigger.
 */

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { todayStr } from "@/lib/date";

export function QuickActionRouter() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const startActiveWorkout = useStore((s) => s.startActiveWorkout);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const setHealth = useStore((s) => s.setHealth);
  const hydrated = useStore((s) => s.hydrated);

  React.useEffect(() => {
    if (!hydrated) return;
    const action = params.get("action");
    if (!action) return;

    let handled = false;

    if (action === "start-workout") {
      if (!activeWorkout) {
        startActiveWorkout();
        haptic("success");
      }
      handled = true;
    } else if (action === "log-water") {
      const date = todayStr();
      const log = useStore.getState().health[date];
      const current = typeof log?.waterOz === "number" ? log.waterOz : 0;
      setHealth(date, { waterOz: current + 16 });
      haptic("tap");
      handled = true;
    }
    // capture (/body) + voice (/journal) are handled by their target
    // screens. We only strip the param when we know we've consumed it.

    if (handled) {
      const next = new URLSearchParams(params.toString());
      next.delete("action");
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`);
    }
  }, [
    hydrated,
    params,
    router,
    pathname,
    startActiveWorkout,
    activeWorkout,
    setHealth,
  ]);

  return null;
}
