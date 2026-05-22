"use client";

import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { useRouter } from "next/navigation";
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
/**
 * Map an `lifeos://...` URL fired by Siri / Shortcuts / a widget tap
 * into a Next route. Keep this dumb — just route, then let the screen
 * decide what modal to open based on its own search params.
 */
function resolveDeepLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "lifeos:") return null;
  // URL("lifeos://water/log?oz=8") puts "water" in host, "/log" in pathname.
  // Reassemble so /water/log and /water all read uniformly.
  const segments = [
    parsed.host,
    ...parsed.pathname.split("/").filter(Boolean),
  ].filter(Boolean);
  const [section, action] = segments;
  switch (section) {
    case "workout":
      return "/gym" + (parsed.search || "?via=intent");
    case "nutrition":
      return "/nutrition" + (parsed.search || (action === "fast" ? "?action=fast" : ""));
    case "water":
      return "/" + (parsed.search || "?action=water");
    case "mood":
      return "/?action=mood";
    case "weight":
      return "/body?action=log";
    case "journal":
      return "/journal" + (action === "new" ? "?action=new" : "");
    default:
      return null;
  }
}

export function CapacitorBootstrap() {
  const localReminders = useStore((s) => s.settings.localReminders);
  const router = useRouter();

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

  // Deep-link router for lifeos:// URLs fired by Siri / Shortcuts /
  // widgets / App Intents. The host app (Capacitor) re-hands us the URL
  // via appUrlOpen; we map it to a Next route. Screens read their own
  // search params to decide whether to auto-open a modal.
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removeHandle: (() => void) | null = null;
    void App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      const target = resolveDeepLink(event.url);
      if (target) router.push(target);
    }).then((handle) => {
      removeHandle = () => {
        void handle.remove();
      };
    });
    return () => {
      removeHandle?.();
    };
  }, [router]);

  return null;
}
