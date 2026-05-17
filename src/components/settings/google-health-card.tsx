"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, Check, Link2, Loader2, AlertTriangle, RefreshCw, Unlink } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { runGoogleHealthSync } from "@/lib/integrations/google-health/sync-client";

type ServerStatus = {
  connected: boolean;
  email?: string;
  needsReconnect: boolean;
};

export function GoogleHealthCard() {
  const router = useRouter();
  const params = useSearchParams();
  const gh = useStore((s) => s.googleHealth);
  const setStatus = useStore((s) => s.setGoogleHealthStatus);
  const reset = useStore((s) => s.resetGoogleHealth);

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<null | "connecting" | "disconnecting">(null);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const [flash, setFlash] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Pull the canonical state from the server (cookies are the source of truth).
  const refreshStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/google-health/status", { cache: "no-store" });
      if (!res.ok) throw new Error("status fetch failed");
      const data = (await res.json()) as ServerStatus;
      setStatus({
        connected: data.connected,
        email: data.email,
        needsReconnect: data.needsReconnect,
      });
    } catch {
      setStatus({ connected: false, needsReconnect: false });
    } finally {
      setLoading(false);
    }
  }, [setStatus]);

  React.useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Handle the post-OAuth redirect.
  React.useEffect(() => {
    const ghParam = params.get("gh");
    if (!ghParam) return;
    if (ghParam === "connected") {
      setFlash({ kind: "ok", text: "Google Health connected." });
      haptic("success");
    } else if (ghParam === "error") {
      const reason = params.get("reason") ?? "unknown";
      setFlash({ kind: "err", text: `Couldn't connect: ${reason}` });
      haptic("error");
    }
    // Strip query params without leaving a navigation entry behind.
    router.replace("/settings#google-health", { scroll: false });
    // Force a status refetch in case we just connected.
    refreshStatus();
  }, [params, router, refreshStatus]);

  React.useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2800);
    return () => window.clearTimeout(t);
  }, [flash]);

  const onConnect = () => {
    setBusy("connecting");
    haptic("tap");
    // Full-page redirect — Google's OAuth consent screen doesn't play
    // nicely with cross-origin popups, especially in iOS standalone PWA.
    window.location.href = "/api/google-health/auth/start";
  };

  const onDisconnect = async () => {
    setBusy("disconnecting");
    try {
      await fetch("/api/google-health/disconnect", { method: "POST" });
      reset();
      await refreshStatus();
      setFlash({ kind: "ok", text: "Disconnected. Synced data kept." });
      haptic("soft");
    } catch {
      setFlash({ kind: "err", text: "Disconnect failed — try again." });
      haptic("error");
    } finally {
      setBusy(null);
      setConfirmDisconnect(false);
    }
  };

  const showReconnect = gh.needsReconnect;
  const showConnected = gh.connected && !showReconnect;
  const showDisconnected = !loading && !showConnected && !showReconnect;

  return (
    <Card id="google-health">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <Activity size={13} className="text-[var(--color-accent)]" />
            Integrations
          </span>
        </CardTitle>
        {flash && (
          <span
            className={
              "text-xs " +
              (flash.kind === "ok"
                ? "text-[var(--color-success)]"
                : "text-[var(--color-danger)]")
            }
          >
            {flash.text}
          </span>
        )}
      </CardHeader>

      <div
        className="rounded-[var(--radius-control)] border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-4"
        style={
          showReconnect
            ? { borderColor: "color-mix(in srgb, var(--color-warning) 36%, var(--color-stroke))" }
            : showConnected
            ? { borderColor: "color-mix(in srgb, var(--color-success) 28%, var(--color-stroke))" }
            : undefined
        }
      >
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 grid place-items-center rounded-xl shrink-0"
            style={{
              background: showConnected
                ? "color-mix(in srgb, var(--color-success) 16%, transparent)"
                : showReconnect
                ? "color-mix(in srgb, var(--color-warning) 16%, transparent)"
                : "var(--color-card)",
              color: showConnected
                ? "var(--color-success)"
                : showReconnect
                ? "var(--color-warning)"
                : "var(--color-fg-2)",
            }}
          >
            {showReconnect ? (
              <AlertTriangle size={18} />
            ) : showConnected ? (
              <Check size={18} />
            ) : (
              <Link2 size={18} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Google Health</div>
            <div className="text-xs text-[var(--color-fg-3)] mt-0.5">
              Fitbit · Pixel Watch · Aria scale
            </div>

            {loading ? (
              <div className="mt-3 text-xs text-[var(--color-fg-3)] inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Checking connection…
              </div>
            ) : showConnected ? (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-[var(--color-fg-2)]">
                  Connected as{" "}
                  <span className="font-medium text-[var(--color-fg)]">
                    {gh.email ?? "your Google account"}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--color-fg-3)] tnum">
                  {gh.lastSyncAt
                    ? `Last synced ${formatRelative(gh.lastSyncAt)}`
                    : "Not yet synced"}
                </div>
              </div>
            ) : showReconnect ? (
              <div className="mt-3 text-xs text-[var(--color-warning)]">
                Reconnect needed — your Google Health authorization expired or was revoked.
              </div>
            ) : (
              <div className="mt-3 text-xs text-[var(--color-fg-2)]">
                Connect to sync sleep, steps, weight, heart rate, and HRV automatically.
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {showConnected && (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={gh.isSyncing || busy != null}
                onClick={async () => {
                  haptic("tap");
                  const ok = await runGoogleHealthSync();
                  if (ok) {
                    setFlash({ kind: "ok", text: "Synced." });
                    haptic("success");
                  } else if (useStore.getState().googleHealth.needsReconnect) {
                    setFlash({
                      kind: "err",
                      text: "Reconnect needed — auth expired.",
                    });
                  }
                }}
              >
                {gh.isSyncing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Sync now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDisconnect(true)}
                disabled={busy != null}
              >
                <Unlink size={13} />
                Disconnect
              </Button>
            </>
          )}
          {(showDisconnected || showReconnect) && (
            <Button
              variant="primary"
              size="sm"
              onClick={onConnect}
              disabled={busy != null}
            >
              {busy === "connecting" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Link2 size={13} />
              )}
              {showReconnect ? "Reconnect" : "Connect"}
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-[var(--color-fg-3)]">
        Tokens are stored as httpOnly cookies on this device. Disconnect to
        revoke access — synced data already on your device stays in place.
      </p>

      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Google Health?"
        description="Stops syncing new data. Anything already pulled stays on this device."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmDisconnect(false)}
              disabled={busy === "disconnecting"}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={onDisconnect}
              disabled={busy === "disconnecting"}
            >
              {busy === "disconnecting" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Unlink size={13} />
              )}
              Disconnect
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-fg-2)]">
          You can reconnect any time. We&rsquo;ll also tell Google to revoke
          this app&rsquo;s access.
        </p>
      </Modal>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
