type HapticPattern = "tap" | "soft" | "success" | "warn" | "error" | "long";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  soft: 6,
  success: [12, 30, 18],
  warn: [20, 40, 20],
  error: [30, 50, 30, 50, 30],
  long: 24,
};

export function haptic(kind: HapticPattern = "tap") {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (!nav.vibrate) return;
  try {
    nav.vibrate(PATTERNS[kind]);
  } catch {
    // ignore
  }
}
