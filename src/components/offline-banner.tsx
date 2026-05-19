"use client";

import * as React from "react";
import { CloudOff, Loader2, X } from "lucide-react";
import {
  countQueue,
  flushQueue,
  startQueueWatcher,
} from "@/lib/offline-queue";

/**
 * Top-of-screen banner. Two states:
 *   - Offline: red-ish "You're offline — changes saved locally"
 *   - Online with pending: amber "Syncing N pending change(s)…" with
 *     a manual retry tap and a dismiss button.
 *
 * Listens to the browser online/offline events and the
 * `offline-queue:changed` / `offline-queue:flushed` custom events the
 * queue dispatches. Survives reloads — pending counts come from
 * IndexedDB.
 */
export function OfflineBanner() {
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    startQueueWatcher();
    setOnline(navigator.onLine);
    void countQueue().then(setPending);

    const onOnline = () => {
      setOnline(true);
      setDismissed(false);
    };
    const onOffline = () => {
      setOnline(false);
      setDismissed(false);
    };
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ size: number }>).detail;
      setPending(detail?.size ?? 0);
    };
    const onFlushed = (e: Event) => {
      const detail = (e as CustomEvent<{ remaining: number }>).detail;
      setPending(detail?.remaining ?? 0);
      setSyncing(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("offline-queue:changed", onChanged);
    window.addEventListener("offline-queue:flushed", onFlushed);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("offline-queue:changed", onChanged);
      window.removeEventListener("offline-queue:flushed", onFlushed);
    };
  }, []);

  const onRetry = async () => {
    setSyncing(true);
    await flushQueue();
  };

  if (dismissed) return null;

  if (!online) {
    return (
      <Banner tone="warning">
        <CloudOff size={13} />
        <span>You&rsquo;re offline. Changes are saved locally and will sync when you reconnect.</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="ml-auto opacity-60 hover:opacity-100"
        >
          <X size={13} />
        </button>
      </Banner>
    );
  }

  if (pending > 0) {
    return (
      <Banner tone="amber">
        {syncing ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <CloudOff size={13} />
        )}
        <span>
          {syncing ? "Syncing…" : `${pending} pending change${pending === 1 ? "" : "s"}`}
        </span>
        {!syncing && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="ml-auto opacity-60 hover:opacity-100"
        >
          <X size={13} />
        </button>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  children,
}: {
  tone: "warning" | "amber";
  children: React.ReactNode;
}) {
  const color =
    tone === "warning"
      ? "var(--color-warning)"
      : "var(--color-warning)";
  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-40 px-3"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="mx-auto max-w-[640px] mt-2 rounded-xl border px-3 py-2 text-[12px] inline-flex items-center gap-2 w-full"
        style={{
          borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
          background: `color-mix(in srgb, ${color} 12%, var(--color-card))`,
          color,
          backdropFilter: "blur(8px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
