"use client";

/**
 * Offline write queue. Mutations that fail because the browser is
 * offline (or because the network blip drops them) get parked in an
 * IndexedDB FIFO and replayed when the browser comes back online.
 *
 * The queue intentionally does NOT touch GETs — reads can fail and the
 * UI will re-fetch when SWR revalidates. Only state-changing requests
 * (POST / PUT / PATCH / DELETE) belong here.
 *
 * Architecture:
 *   - Each entry: { id, method, url, body, attempts, queuedAt }.
 *   - On enqueue, dispatches a custom event so the offline banner can
 *     show "1 pending change".
 *   - `flushQueue()` is called on the `online` browser event and
 *     manually when the user dismisses the banner. It dequeues in
 *     FIFO order, retries with exponential backoff up to 5 attempts,
 *     then drops the entry and surfaces a warning event.
 */

import { openDB, type IDBPDatabase } from "idb";

type QueuedEntry = {
  id: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: string;
  headers?: Record<string, string>;
  attempts: number;
  queuedAt: number;
};

const DB_NAME = "life-os-offline";
const STORE = "queue";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

function emit(name: string, detail?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`offline-queue:${name}`, { detail }));
}

export async function enqueue(
  init: Omit<QueuedEntry, "id" | "attempts" | "queuedAt">
): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const entry: QueuedEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    attempts: 0,
    queuedAt: Date.now(),
    ...init,
  };
  await db.put(STORE, entry);
  emit("changed", { size: await countQueue() });
}

export async function listQueue(): Promise<QueuedEntry[]> {
  const db = await getDB();
  if (!db) return [];
  const all = (await db.getAll(STORE)) as QueuedEntry[];
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function countQueue(): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.count(STORE);
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete(STORE, id);
  emit("changed", { size: await countQueue() });
}

let flushing = false;
const MAX_ATTEMPTS = 5;

export async function flushQueue(): Promise<{
  succeeded: number;
  dropped: number;
  remaining: number;
}> {
  if (flushing) {
    return { succeeded: 0, dropped: 0, remaining: await countQueue() };
  }
  flushing = true;
  let succeeded = 0;
  let dropped = 0;
  try {
    const entries = await listQueue();
    for (const e of entries) {
      try {
        const res = await fetch(e.url, {
          method: e.method,
          headers: {
            "content-type": "application/json",
            ...(e.headers ?? {}),
          },
          body: e.body,
          credentials: "same-origin",
        });
        if (res.ok) {
          await removeFromQueue(e.id);
          succeeded += 1;
        } else if (res.status >= 500) {
          // Server-side issue — retry next flush.
          await bumpAttempts(e);
        } else {
          // 4xx — the request itself is bad. Drop after surfacing.
          await removeFromQueue(e.id);
          dropped += 1;
          emit("dropped", { entry: e, status: res.status });
        }
      } catch {
        // Network failure mid-flush — retry next online event.
        await bumpAttempts(e);
      }
    }
  } finally {
    flushing = false;
  }
  const remaining = await countQueue();
  emit("flushed", { succeeded, dropped, remaining });
  return { succeeded, dropped, remaining };
}

async function bumpAttempts(e: QueuedEntry): Promise<void> {
  const db = await getDB();
  if (!db) return;
  if (e.attempts + 1 >= MAX_ATTEMPTS) {
    await db.delete(STORE, e.id);
    emit("dropped", { entry: e, status: 0 });
  } else {
    await db.put(STORE, { ...e, attempts: e.attempts + 1 });
  }
}

/**
 * Wrapper that queues on offline / network failure rather than
 * throwing. Returns the real Response on success, or a synthetic
 * `{ ok: true, queued: true }` shape when the request lands in the
 * queue. Callers downstream of SWR's optimistic mutate can treat the
 * synthetic response as "accepted" — UI stays optimistic until the
 * queue eventually replays.
 */
export type QueuedFetchResult =
  | { ok: true; queued: false; status: number; json: () => Promise<unknown> }
  | { ok: true; queued: true; status: 202; json: () => Promise<unknown> }
  | { ok: false; queued: false; status: number; json: () => Promise<unknown> };

export async function queuedFetch(
  url: string,
  init: { method: "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }
): Promise<QueuedFetchResult> {
  const bodyStr = init.body !== undefined ? JSON.stringify(init.body) : undefined;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueue({ method: init.method, url, body: bodyStr });
    return {
      ok: true,
      queued: true,
      status: 202,
      json: async () => ({ queued: true }),
    };
  }

  try {
    const res = await fetch(url, {
      method: init.method,
      headers: { "content-type": "application/json" },
      body: bodyStr,
      credentials: "same-origin",
    });
    if (!res.ok) {
      return {
        ok: false,
        queued: false,
        status: res.status,
        json: () => res.json(),
      };
    }
    return {
      ok: true,
      queued: false,
      status: res.status,
      json: () => res.json(),
    };
  } catch {
    // Network error — treat like offline and queue.
    await enqueue({ method: init.method, url, body: bodyStr });
    return {
      ok: true,
      queued: true,
      status: 202,
      json: async () => ({ queued: true }),
    };
  }
}

/** Attach the global online listener exactly once per page load. */
let listenerAttached = false;
export function startQueueWatcher(): void {
  if (typeof window === "undefined" || listenerAttached) return;
  listenerAttached = true;
  window.addEventListener("online", () => {
    void flushQueue();
  });
  // Try once on attach in case we're already online with leftover work.
  void flushQueue();
}
