"use client";

import * as React from "react";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";

/**
 * Runs the recurring-goal generation pass:
 *   - once on mount (Today screen open)
 *   - again whenever the document becomes visible (catches midnight rollover
 *     when the user comes back to a backgrounded tab)
 *
 * The store action itself is idempotent — repeated calls for the same date
 * do nothing if generations already exist.
 */
export function useRecurrenceTicker() {
  const run = useStore((s) => s.runRecurringGeneration);

  React.useEffect(() => {
    run(todayStr());
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run(todayStr());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run]);
}
