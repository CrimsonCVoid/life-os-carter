"use client";

/**
 * Mounts the cloud-sync subscriber. Watches the Zustand store and schedules
 * a debounced push to Postgres on every state change. Renders nothing.
 *
 * Place at the root layout so it's always live for signed-in users.
 */

import * as React from "react";
import { useStore } from "@/store";
import {
  isCloudSyncEnabled,
  pushNowImmediate,
  schedulePush,
  setCloudSyncEnabled,
} from "@/lib/cloud-sync";

export function CloudSyncMount() {
  React.useEffect(() => {
    // Only run client-side
    if (typeof window === "undefined") return;

    // Auto-enable on first run if user is signed in (cookie present).
    if (window.localStorage.getItem("life-os:cloud-sync") === null) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => {
          if (r.ok) setCloudSyncEnabled(true);
        })
        .catch(() => {});
    }

    // Subscribe to ALL store changes. Zustand's subscribe (no selector) fires
    // on every state mutation; we debounce inside cloud-sync.
    const unsub = useStore.subscribe(() => {
      if (isCloudSyncEnabled()) schedulePush();
    });

    // Best-effort flush on tab close / nav-away.
    const onUnload = () => {
      if (isCloudSyncEnabled()) {
        // Use sendBeacon-style fire-and-forget if available, else just schedule.
        try {
          const raw = window.localStorage.getItem("life-os:v2");
          if (raw && "sendBeacon" in navigator) {
            const blob = new Blob(
              [JSON.stringify({ schemaVer: 2, state: JSON.parse(raw) })],
              { type: "application/json" }
            );
            navigator.sendBeacon("/api/sync/snapshot", blob);
          } else {
            void pushNowImmediate();
          }
        } catch {
          /* swallow */
        }
      }
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      unsub();
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return null;
}
