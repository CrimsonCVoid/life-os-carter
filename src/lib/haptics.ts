import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

type HapticPattern =
  | "tap"
  | "soft"
  | "selection"
  | "rigid"
  | "heavy"
  | "success"
  | "warn"
  | "error"
  | "long";

const WEB_PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  soft: 6,
  selection: 4,
  rigid: 14,
  heavy: 22,
  success: [12, 30, 18],
  warn: [20, 40, 20],
  error: [30, 50, 30, 50, 30],
  long: 24,
};

// iOS Taptic Engine bindings — much richer than Web Vibration API. Hit
// the native plugin when running inside the Capacitor shell, fall back
// to navigator.vibrate in the regular web/PWA context.
export function haptic(kind: HapticPattern = "tap") {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    try {
      switch (kind) {
        case "tap":
        case "soft":
          void Haptics.impact({ style: ImpactStyle.Light });
          return;
        case "selection":
          void Haptics.selectionChanged();
          return;
        case "rigid":
          // @capacitor/haptics doesn't surface UIImpactFeedbackStyle.rigid
          // (only Heavy/Medium/Light). Medium gives the closest crisp
          // bump-feel for "rigid" interactions like keypad commits.
          void Haptics.impact({ style: ImpactStyle.Medium });
          return;
        case "heavy":
          void Haptics.impact({ style: ImpactStyle.Heavy });
          return;
        case "long":
          void Haptics.impact({ style: ImpactStyle.Medium });
          return;
        case "success":
          void Haptics.notification({ type: NotificationType.Success });
          return;
        case "warn":
          void Haptics.notification({ type: NotificationType.Warning });
          return;
        case "error":
          void Haptics.notification({ type: NotificationType.Error });
          return;
      }
    } catch {
      // ignore — fall through to web fallback below
    }
  }

  const nav = window.navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (!nav.vibrate) return;
  try {
    nav.vibrate(WEB_PATTERNS[kind]);
  } catch {
    // ignore
  }
}

/**
 * Bracketed selection sweep for continuous gestures (slider drag,
 * scroll picker). start() preps the generator, tick() fires on every
 * discrete value change, end() releases. On iOS this is the proper
 * UISelectionFeedbackGenerator prepare → selectionChanged sequence —
 * much crisper than spamming notification haptics on each tick.
 */
export const hapticSelection = {
  start() {
    if (typeof window === "undefined") return;
    if (Capacitor.isNativePlatform()) {
      void Haptics.selectionStart().catch(() => {});
    }
  },
  tick() {
    if (typeof window === "undefined") return;
    if (Capacitor.isNativePlatform()) {
      void Haptics.selectionChanged().catch(() => {});
      return;
    }
    const nav = window.navigator as Navigator & {
      vibrate?: (p: number | number[]) => boolean;
    };
    nav.vibrate?.(4);
  },
  end() {
    if (typeof window === "undefined") return;
    if (Capacitor.isNativePlatform()) {
      void Haptics.selectionEnd().catch(() => {});
    }
  },
};
