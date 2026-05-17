/**
 * Client-side sync orchestrator. Reads/writes the zustand store directly
 * via `useStore.getState()` so this can be invoked from anywhere — auto-
 * sync hook on Today mount, manual button in the Integrations card, etc.
 *
 * No tokens here. The route handler at /api/google-health/sync is the
 * boundary between the client and Google.
 */

import { useStore } from "@/store";
import type {
  DateStr,
  GoogleHealthDaySource,
  HealthLog,
  SleepStages,
} from "@/lib/types";

type ServerUpdate = {
  date: DateStr;
  fields: {
    sleepHours?: number;
    wakeTime?: string;
    sleepStages?: SleepStages;
    steps?: number;
    weight?: number;
    restingHeartRate?: number;
    heartRateVariability?: number;
  };
};

type SyncResponse = {
  updates?: ServerUpdate[];
  syncedAt?: string;
  partialErrors?: string[];
  error?: string;
};

const FIELD_TO_SOURCE: Record<
  keyof ServerUpdate["fields"],
  keyof GoogleHealthDaySource | null
> = {
  sleepHours: "sleep",
  wakeTime: "sleep",
  sleepStages: "sleep",
  steps: "steps",
  weight: "weight",
  restingHeartRate: "restingHeartRate",
  heartRateVariability: "heartRateVariability",
};

/** Apply one update, respecting manual-override-wins. */
function applyUpdate(update: ServerUpdate, syncedAtIso: string): void {
  const store = useStore.getState();
  const daySource = store.googleHealth.sourceByDate[update.date] ?? {};

  const patch: Partial<HealthLog> = {};
  const touchedSources = new Set<keyof GoogleHealthDaySource>();

  for (const rawKey of Object.keys(update.fields)) {
    const key = rawKey as keyof ServerUpdate["fields"];
    const sourceKey = FIELD_TO_SOURCE[key];
    if (sourceKey) {
      const provenance = daySource[sourceKey];
      // Manual override wins: if the user edited this metric after the
      // last sync, skip overwriting. This includes ALL fields under that
      // source (e.g. wakeTime + sleepStages both gated by "sleep").
      if (
        provenance?.manualOverrideAt &&
        (!provenance.syncedAt ||
          provenance.manualOverrideAt > provenance.syncedAt)
      ) {
        continue;
      }
    }
    const value = update.fields[key];
    if (value === undefined) continue;
    (patch as Record<string, unknown>)[key] = value;
    if (sourceKey) touchedSources.add(sourceKey);
  }

  if (Object.keys(patch).length > 0) {
    store.setHealth(update.date, patch);
  }
  if (touchedSources.size > 0) {
    store.recordGoogleHealthSyncedFields(
      update.date,
      [...touchedSources],
      syncedAtIso
    );
  }
}

export type SyncOptions = {
  /** Override the days backfill window — defaults to 7, or 30 on first sync. */
  days?: number;
  /** When true, no-op if a sync is already in flight. */
  guardConcurrent?: boolean;
};

/** Returns `true` if a sync actually ran, `false` if it was skipped. */
export async function runGoogleHealthSync(
  opts: SyncOptions = {}
): Promise<boolean> {
  const store = useStore.getState();
  const gh = store.googleHealth;
  if (!gh.connected || gh.needsReconnect) return false;
  if (opts.guardConcurrent && gh.isSyncing) return false;

  const days = opts.days ?? (gh.hasCompletedInitialSync ? 7 : 30);
  store.setGoogleHealthSyncing(true);

  try {
    const res = await fetch("/api/google-health/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });

    if (res.status === 401) {
      store.setGoogleHealthStatus({ needsReconnect: true });
      const at = new Date().toISOString();
      store.setGoogleHealthLastSync(at, "reconnect_needed");
      return false;
    }

    const data = (await res.json()) as SyncResponse;
    if (!res.ok || data.error) {
      const at = new Date().toISOString();
      store.setGoogleHealthLastSync(
        at,
        data.error ?? `http_${res.status}`
      );
      return false;
    }

    const syncedAt = data.syncedAt ?? new Date().toISOString();
    for (const u of data.updates ?? []) applyUpdate(u, syncedAt);

    store.setGoogleHealthLastSync(syncedAt, undefined);
    if (!gh.hasCompletedInitialSync) {
      store.markGoogleHealthInitialSyncDone();
    }
    return true;
  } catch (e) {
    // Network errors are silent — caller decides whether to surface.
    const at = new Date().toISOString();
    store.setGoogleHealthLastSync(at, e instanceof Error ? e.message : "network");
    return false;
  } finally {
    store.setGoogleHealthSyncing(false);
  }
}

const STALE_MS = 30 * 60 * 1000;

/** Convenience: trigger a background sync if connected, not in-flight, and
 * either never-synced or stale (>30min). Safe to call on every mount. */
export async function maybeAutoSync(): Promise<void> {
  const gh = useStore.getState().googleHealth;
  if (!gh.connected || gh.needsReconnect || gh.isSyncing) return;
  const lastMs = gh.lastSyncAt ? new Date(gh.lastSyncAt).getTime() : 0;
  const fresh = lastMs && Date.now() - lastMs < STALE_MS;
  if (fresh) return;
  void runGoogleHealthSync({ guardConcurrent: true });
}
