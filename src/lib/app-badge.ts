/**
 * App icon badge — shows a number on the home screen / dock icon.
 *
 * Works on:
 *   - PWA installed to iOS home screen (iOS 16.4+, requires Notification permission)
 *   - PWA on Android home screen
 *   - Capacitor native iOS app via @capacitor/app (different API path)
 *   - Desktop Safari, Chrome dock icon
 *
 * No-ops everywhere else.
 *
 * Source of truth pattern:
 *   - Today screen mount → setBadgeForCurrentState() (computes count from
 *     unread briefing presence + at-risk streak + queued progress photos)
 *   - User taps the relevant element → clearBadge() for that signal
 */

type WithBadge = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function getNav(): WithBadge | null {
  if (typeof navigator === "undefined") return null;
  return navigator as WithBadge;
}

export async function setBadge(count: number): Promise<void> {
  const nav = getNav();
  if (!nav?.setAppBadge) return;
  try {
    await nav.setAppBadge(count > 0 ? count : 0);
  } catch {
    /* permission denied or unsupported — silent no-op */
  }
}

export async function clearBadge(): Promise<void> {
  const nav = getNav();
  if (!nav?.clearAppBadge) return;
  try {
    await nav.clearAppBadge();
  } catch {
    /* silent */
  }
}
