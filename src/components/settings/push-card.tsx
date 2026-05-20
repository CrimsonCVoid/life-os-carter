"use client";

import * as React from "react";
import { Bell, BellOff, Send, Smartphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  type PushState,
} from "@/lib/push-client";

export function PushCard() {
  const [state, setState] = React.useState<PushState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const s = await getPushState();
    setState(s);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const enable = async () => {
    setBusy(true);
    try {
      const s = await enablePush();
      setState(s);
      setToast(s.kind === "subscribed" ? "Notifications on" : "Permission needed");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const s = await disablePush();
      setState(s);
      setToast("Notifications off");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await sendTestPush();
      setToast(r.sent > 0 ? "Test sent" : "No subscriptions");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <span className="text-xs text-[var(--color-fg-3)]">Daily briefing + nudges</span>
      </CardHeader>

      <div className="space-y-3">
        <StatusLine state={state} />

        <div className="flex flex-wrap gap-2">
          {state?.kind === "subscribed" ? (
            <>
              <Button variant="secondary" onClick={test} disabled={busy} size="sm">
                <Send size={12} />
                Send test
              </Button>
              <Button variant="ghost" onClick={disable} disabled={busy} size="sm">
                <BellOff size={12} />
                Turn off
              </Button>
            </>
          ) : state?.kind === "needs-install" ? (
            <p className="text-[12px] text-[var(--color-fg-2)] leading-relaxed">
              Install Life OS to your iPhone home screen first (Safari → Share → Add to
              Home Screen), then open the app from there and re-enable notifications.
            </p>
          ) : state?.kind === "denied" ? (
            <p className="text-[12px] text-[var(--color-fg-2)] leading-relaxed">
              Notifications were denied. Re-enable from iOS Settings → Notifications →
              Life OS, then come back here.
            </p>
          ) : state?.kind === "unsupported" ? (
            <p className="text-[12px] text-[var(--color-fg-2)] leading-relaxed">
              This browser doesn't support push notifications.
            </p>
          ) : (
            <Button onClick={enable} disabled={busy || !state}>
              <Bell size={14} />
              Enable notifications
            </Button>
          )}
        </div>

        {toast && (
          <div className="text-[12px] text-[var(--color-fg-2)] tabular-nums">{toast}</div>
        )}

        <p className="text-[11px] text-[var(--color-fg-3)] leading-relaxed">
          Daily briefing arrives at 6am ET each morning with 1-3 patterns the AI spots
          in your last 30 days. No marketing, no spam.
        </p>
      </div>
    </Card>
  );
}

function StatusLine({ state }: { state: PushState | null }) {
  if (!state) return null;
  const map: Record<string, { icon: React.ReactNode; label: string; tone: string }> = {
    subscribed: {
      icon: <Bell size={13} />,
      label: "On for this device",
      tone: "var(--color-success)",
    },
    "needs-install": {
      icon: <Smartphone size={13} />,
      label: "Add to Home Screen to enable",
      tone: "var(--color-warning)",
    },
    denied: {
      icon: <BellOff size={13} />,
      label: "Denied in iOS Settings",
      tone: "var(--color-danger)",
    },
    default: {
      icon: <BellOff size={13} />,
      label: "Off — tap to enable",
      tone: "var(--color-fg-3)",
    },
    unsupported: {
      icon: <BellOff size={13} />,
      label: "Not supported on this browser",
      tone: "var(--color-fg-3)",
    },
  };
  const e = map[state.kind];
  if (!e) return null;
  return (
    <div className="flex items-center gap-2 text-[13px]" style={{ color: e.tone }}>
      {e.icon}
      {e.label}
    </div>
  );
}
