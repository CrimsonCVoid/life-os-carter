/**
 * Cloud sync — mirrors the Zustand `life-os:v2` state to Postgres on a
 * debounced timer. localStorage stays canonical; the cloud is a backup +
 * multi-device sync layer.
 *
 * Design:
 *  - localStorage is the source of truth. If the cloud is unreachable,
 *    nothing breaks.
 *  - We snapshot the ENTIRE state on every sync (jsonb diff inside Postgres
 *    is efficient enough for a personal app). No per-slice diffing on the
 *    client.
 *  - Debounced: rapid mutations (e.g. dragging a goal) coalesce into one
 *    network call.
 *  - Feature-flagged via localStorage key `life-os:cloud-sync` ("on" | "off").
 *    Defaults to "on" once a user has signed in. Toggle in Settings.
 *  - Pull-on-load: on app boot (after sign-in), call `pullSnapshot()` once
 *    to merge any newer cloud state into the local store.
 */

const FLAG_KEY = "life-os:cloud-sync";
const STORE_KEY = "life-os:v2";
const SCHEMA_VER = 2;
const DEBOUNCE_MS = 4000;

export type SyncStatus = {
  enabled: boolean;
  lastPushAt: number | null;
  lastPullAt: number | null;
  lastError: string | null;
  pending: boolean;
};

let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: SyncStatus) => void>();
const status: SyncStatus = {
  enabled: false,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
  pending: false,
};

function notify() {
  for (const l of listeners) l(status);
}

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => {
    listeners.delete(fn);
  };
}

export function isCloudSyncEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FLAG_KEY) !== "off";
}

export function setCloudSyncEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FLAG_KEY, on ? "on" : "off");
  status.enabled = on;
  notify();
  if (on) schedulePush();
}

function readState(): unknown | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function pushNow(): Promise<void> {
  const state = readState();
  if (state == null) return;
  status.pending = true;
  notify();
  try {
    const r = await fetch("/api/sync/snapshot", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ schemaVer: SCHEMA_VER, state }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error((j && j.error) || `http ${r.status}`);
    }
    status.lastPushAt = Date.now();
    status.lastError = null;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : "push-failed";
  } finally {
    status.pending = false;
    notify();
  }
}

/** Schedule a debounced push. Safe to call on every mutation. */
export function schedulePush(): void {
  if (typeof window === "undefined") return;
  if (!isCloudSyncEnabled()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!inflight) {
      inflight = pushNow().finally(() => {
        inflight = null;
      });
    }
  }, DEBOUNCE_MS);
}

/** Immediate push (no debounce). Use sparingly — e.g. on page unload. */
export async function pushNowImmediate(): Promise<void> {
  if (!isCloudSyncEnabled()) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (inflight) await inflight;
  inflight = pushNow().finally(() => {
    inflight = null;
  });
  await inflight;
}

export type PullResult =
  | { kind: "none" }
  | { kind: "loaded"; state: Record<string, unknown>; updatedAt: string; bytes: number }
  | { kind: "error"; message: string };

/** Fetch the latest snapshot from the cloud. Caller decides whether to merge. */
export async function pullSnapshot(): Promise<PullResult> {
  if (typeof window === "undefined") return { kind: "none" };
  try {
    const r = await fetch("/api/sync/snapshot", {
      credentials: "include",
      cache: "no-store",
    });
    if (r.status === 204) return { kind: "none" };
    if (!r.ok) {
      return { kind: "error", message: `http ${r.status}` };
    }
    const data = await r.json();
    status.lastPullAt = Date.now();
    status.lastError = null;
    notify();
    return {
      kind: "loaded",
      state: data.state,
      updatedAt: data.updatedAt,
      bytes: data.bytes,
    };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "pull-failed",
    };
  }
}
