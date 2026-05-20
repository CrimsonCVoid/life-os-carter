/**
 * Pure date helpers for the in-app reminder banners. No I/O — callers
 * pass today's DateStr in so the date source stays explicit (and
 * testable / mock-able).
 */

import type { DateStr } from "@/lib/types";

export type PhotoDayWindow = {
  /** The target date the reminder is about — the 1st or the 15th. */
  target: DateStr;
  /** Days since the target (0 = on the target day, 1-2 = soft "missed"). */
  daysLate: number;
  /** True on the day itself; false during the soft "missed" tail. */
  onTarget: boolean;
};

/**
 * Returns the window descriptor when `today` is the 1st/15th or up to
 * 2 days after, otherwise null. The 2-day tail keeps the reminder
 * gently nagging if the user opens the app late.
 */
export function getPhotoDayWindow(today: DateStr): PhotoDayWindow | null {
  const [yy, mm, dd] = today.split("-").map(Number);
  if (!yy || !mm || !dd) return null;
  const mmStr = String(mm).padStart(2, "0");

  // Within window of the 1st? (1, 2, 3)
  if (dd >= 1 && dd <= 3) {
    return {
      target: `${yy}-${mmStr}-01`,
      daysLate: dd - 1,
      onTarget: dd === 1,
    };
  }
  // Within window of the 15th? (15, 16, 17)
  if (dd >= 15 && dd <= 17) {
    return {
      target: `${yy}-${mmStr}-15`,
      daysLate: dd - 15,
      onTarget: dd === 15,
    };
  }
  return null;
}

/** localStorage key for "I've dismissed the X reminder for the date Y". */
export function dismissalKey(
  kind: "weight" | "photo-day",
  date: DateStr
): string {
  return `life-os:reminder-dismissed:${kind}:${date}`;
}

/** True when the user has dismissed the given reminder for the given date.
 *  Safe to call SSR — returns false outside a browser. */
export function isDismissed(
  kind: "weight" | "photo-day",
  date: DateStr
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(dismissalKey(kind, date)) === "1";
  } catch {
    return false;
  }
}

export function setDismissed(
  kind: "weight" | "photo-day",
  date: DateStr
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dismissalKey(kind, date), "1");
  } catch {
    /* private browsing / quota — fail silent */
  }
}
