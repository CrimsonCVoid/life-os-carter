/**
 * Haptics — works across three contexts:
 *
 *   1. Native iOS via Capacitor → UIImpactFeedbackGenerator / Notification
 *      feedback. Real Taptic Engine ticks. Requires the app to be running
 *      inside the Capacitor wrapper (`ios/App/App.xcworkspace`).
 *
 *   2. Plain PWA on Android → navigator.vibrate(). Real motor buzz.
 *
 *   3. Plain PWA on iOS Safari → no-op. Apple gates web vibrate.
 *      The Toggle component uses a separate `<input switch>` trick for
 *      OS-level haptic on iOS 17.4+ regardless of native wrapper.
 *
 * All three behave the same from the call site — `haptic('tap')` etc.
 * works everywhere; the no-op cases just don't tick.
 */

type HapticPattern = "tap" | "soft" | "success" | "warn" | "error" | "long";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  soft: 6,
  success: [12, 30, 18],
  warn: [20, 40, 20],
  error: [30, 50, 30, 50, 30],
  long: 24,
};

// Lazy-resolved Capacitor handles. We don't want to import @capacitor/* at
// module load on every page — the imports are cheap but they'd pull the
// runtime check into the bundle on every page route. Resolving lazily
// keeps the haptic call path tiny when running in a regular browser.
type CapacitorHaptics = {
  impact: (opts: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
  notification: (opts: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
  selectionStart?: () => Promise<void>;
};

type CapacitorRuntime = {
  isNativePlatform: () => boolean;
};

let capCache:
  | { runtime: CapacitorRuntime; haptics: CapacitorHaptics; styles: { LIGHT: "LIGHT"; MEDIUM: "MEDIUM"; HEAVY: "HEAVY" }; notifs: { SUCCESS: "SUCCESS"; WARNING: "WARNING"; ERROR: "ERROR" } }
  | null
  | undefined;

async function getCap(): Promise<typeof capCache> {
  if (capCache !== undefined) return capCache;
  if (typeof window === "undefined") {
    capCache = null;
    return null;
  }
  // Capacitor injects a `Capacitor` global at WebView boot in native builds.
  // In a plain browser the global doesn't exist and Capacitor.isNativePlatform()
  // returns false — but to avoid bundling the package's runtime code into
  // pure-web users at all, gate on the global first.
  const hasGlobal = "Capacitor" in window;
  if (!hasGlobal) {
    capCache = null;
    return null;
  }
  try {
    const [{ Capacitor }, { Haptics, ImpactStyle, NotificationType }] =
      await Promise.all([import("@capacitor/core"), import("@capacitor/haptics")]);
    if (!Capacitor.isNativePlatform()) {
      capCache = null;
      return null;
    }
    capCache = {
      runtime: Capacitor as CapacitorRuntime,
      haptics: Haptics as unknown as CapacitorHaptics,
      styles: ImpactStyle as unknown as { LIGHT: "LIGHT"; MEDIUM: "MEDIUM"; HEAVY: "HEAVY" },
      notifs: NotificationType as unknown as { SUCCESS: "SUCCESS"; WARNING: "WARNING"; ERROR: "ERROR" },
    };
    return capCache;
  } catch {
    capCache = null;
    return null;
  }
}

function vibrateFallback(kind: HapticPattern) {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (!nav.vibrate) return;
  try {
    nav.vibrate(PATTERNS[kind]);
  } catch {
    /* ignore */
  }
}

export function haptic(kind: HapticPattern = "tap"): void {
  // Fire-and-forget. We don't block the caller on the dynamic import; first
  // call resolves Capacitor (~one off, then cached), subsequent calls hit
  // the cache synchronously inside the async chain.
  void (async () => {
    const cap = await getCap();
    if (cap) {
      const { haptics, styles, notifs } = cap;
      try {
        switch (kind) {
          case "tap":
            await haptics.impact({ style: styles.LIGHT });
            return;
          case "soft":
            await haptics.impact({ style: styles.LIGHT });
            return;
          case "long":
            await haptics.impact({ style: styles.MEDIUM });
            return;
          case "success":
            await haptics.notification({ type: notifs.SUCCESS });
            return;
          case "warn":
            await haptics.notification({ type: notifs.WARNING });
            return;
          case "error":
            await haptics.notification({ type: notifs.ERROR });
            return;
        }
      } catch {
        /* fall through to vibrate */
      }
    }
    vibrateFallback(kind);
  })();
}
