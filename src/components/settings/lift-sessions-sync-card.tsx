"use client";

import * as React from "react";
import { CloudUpload, Loader2, Check } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import {
  useLiftSessions,
  bulkCreateLiftSessions,
} from "@/lib/hooks/use-lift-sessions";
import { haptic } from "@/lib/haptics";

/**
 * Migration card — only renders when the local Zustand `liftSessions`
 * array has rows that aren't yet in the user's Neon account.
 *
 * v2 originally kept lift sessions client-only. The new
 * /api/data/lift-sessions surface persists going forward, but anyone
 * who lifted before the migration has a pile of local-only history.
 * One tap here POSTs the lot to Neon so a device wipe stops being a
 * data loss.
 *
 * Self-hides when there's nothing left to sync.
 */
export function LiftSessionsSyncCard() {
  const localSessions = useStore((s) => s.liftSessions);
  const { sessions: cloudSessions } = useLiftSessions();
  const [pending, setPending] = React.useState(false);
  const [justSynced, setJustSynced] = React.useState<number | null>(null);

  // Heuristic for "needs sync": local has more sessions than cloud, OR
  // there's at least one local date that doesn't appear in cloud.
  const cloudDates = React.useMemo(
    () => new Set(cloudSessions.map((s) => s.date)),
    [cloudSessions]
  );
  const unsynced = React.useMemo(
    () => localSessions.filter((s) => !cloudDates.has(s.date)),
    [localSessions, cloudDates]
  );

  // Hide entirely when there's nothing to do.
  if (unsynced.length === 0 && justSynced == null) return null;

  const handleSync = async () => {
    setPending(true);
    haptic("tap");
    try {
      const n = await bulkCreateLiftSessions(unsynced);
      setJustSynced(n);
      haptic("success");
    } catch {
      haptic("error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud sync — workouts</CardTitle>
      </CardHeader>

      <div className="space-y-3">
        {justSynced != null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
            <Check size={14} />
            Synced {justSynced} workout{justSynced === 1 ? "" : "s"} to
            your account.
          </div>
        ) : (
          <>
            <div className="text-xs text-[var(--color-fg-2)] leading-relaxed">
              You have{" "}
              <span className="font-semibold text-[var(--color-fg)] tnum">
                {unsynced.length}
              </span>{" "}
              workout{unsynced.length === 1 ? "" : "s"} saved only on this
              device. Sync to your Life OS account so they survive a
              browser-data wipe and show up on every signed-in device.
            </div>

            <Button
              variant="primary"
              className="w-full"
              onClick={handleSync}
              disabled={pending}
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CloudUpload size={14} />
              )}
              Sync {unsynced.length} workout{unsynced.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
