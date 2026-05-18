"use client";

import * as React from "react";

const DURATION_MS = 600; // matches existing spring (stiffness 300, damping 30)

/**
 * Count-up from 0 → `target` on first mount of the day. Single rAF tween,
 * ease-out cubic — visually indistinguishable from the spring for a
 * monotonically increasing scalar. Honors prefers-reduced-motion.
 *
 * Tracking key per metric+date keeps us from re-animating when the user
 * navigates back to Today, but does retrigger if the value changes from
 * a sync after the first mount.
 */
export function useCountUp(target: number | null, key: string): number {
  const [value, setValue] = React.useState<number>(() => target ?? 0);
  const lastKey = React.useRef<string>(key);

  React.useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      setValue(0);
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setValue(target);
      lastKey.current = key;
      return;
    }

    // Only animate when the (metric, date) tuple changes OR on first mount.
    const shouldAnimate = lastKey.current !== key || value === 0;
    lastKey.current = key;
    if (!shouldAnimate) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // value omitted from deps on purpose — we only want this to fire when the
    // (key, target) pair changes, not on every intermediate frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, key]);

  return value;
}
