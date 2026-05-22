"use client";

import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { useStore } from "@/store";
import { reconcileLocalReminders } from "@/lib/native/local-notifications";

/**
 * Wires native-platform lifecycle on mount: hides the splash screen
 * once React has painted, locks the status bar to dark, and handles
 * the iOS hardware "back" / app-restore lifecycle gracefully.
 *
 * No-op on web. Web/PWA users continue to get the PwaMode + manifest
 * theme color path; only Capacitor native gets these calls.
 */
export function CapacitorBootstrap() {
  const localReminders = useStore((s) => s.settings.localReminders);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    (async () => {
      try {
        const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
          import("@capacitor/splash-screen"),
          import("@capacitor/status-bar"),
        ]);
        if (cancelled) return;
        await StatusBar.setStyle({ style: Style.Dark });
        // Slight delay so the first paint is in place — avoids the
        // splash → blank → content flash on cold start.
        await new Promise((r) => setTimeout(r, 80));
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        // Non-fatal: native plugin failure should never break the web UI.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Re-reconcile local notification schedules whenever the user's
  // localReminders prefs change AND on every cold start. iOS keeps the
  // calendar-repeat schedules persistent across reboots, but a fresh
  // install or a permission flip needs this to repopulate.
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void reconcileLocalReminders(localReminders);
  }, [localReminders]);

  return null;
}
