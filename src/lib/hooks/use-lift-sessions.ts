"use client";

import useSWR, { mutate } from "swr";
import type { LiftExercise, LiftSession } from "@/lib/types";

const KEY = "/api/data/lift-sessions";

type RawRow = {
  id: string;
  userId: string;
  date: string;
  raw: string | null;
  exercises: unknown;
  createdAt: string | Date;
};

function rowToSession(r: RawRow): LiftSession {
  return {
    id: r.id,
    date: r.date,
    exercises: (r.exercises as LiftExercise[]) ?? [],
    raw: r.raw ?? undefined,
    createdAt:
      typeof r.createdAt === "string"
        ? r.createdAt
        : r.createdAt.toISOString(),
  };
}

/**
 * Read every lift session for the current user. Conservative revalidation
 * — sessions don't change once finished, and the `exercises` jsonb is large.
 */
export function useLiftSessions() {
  const swr = useSWR<RawRow[]>(KEY, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  return {
    sessions: (swr.data ?? []).map(rowToSession),
    isLoading: swr.isLoading,
    error: swr.error,
  };
}

/**
 * Persist a finished lift session. Used by finishActiveWorkout after the
 * user taps Done in the active workout sheet. Returns the persisted row
 * (with the server-assigned id + createdAt) on success, throws on failure.
 */
export async function createLiftSessionItem(input: {
  date: string;
  exercises: LiftExercise[];
  raw?: string;
}): Promise<LiftSession | null> {
  const res = await fetch(KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create lift session failed: ${res.status}`);
  const raw = (await res.json()) as RawRow;
  // Revalidate so other surfaces (gym page, deep-dive, daily strain card)
  // pick the new row up immediately.
  await mutate(KEY);
  return rowToSession(raw);
}

export async function updateLiftSessionItem(
  id: string,
  patch: { date?: string; exercises?: LiftExercise[]; raw?: string | null }
): Promise<void> {
  const res = await fetch(`${KEY}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update lift session failed: ${res.status}`);
  await mutate(KEY);
}

export async function deleteLiftSessionItem(id: string): Promise<void> {
  const res = await fetch(`${KEY}/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`delete lift session failed: ${res.status}`);
  await mutate(KEY);
}

/**
 * Bulk import — POSTs each session sequentially. Used by the one-time
 * "Sync N local workouts to your account" Settings migration. Returns
 * the count actually persisted.
 */
export async function bulkCreateLiftSessions(
  sessions: LiftSession[]
): Promise<number> {
  let saved = 0;
  for (const s of sessions) {
    try {
      await fetch(KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          date: s.date,
          exercises: s.exercises,
          raw: s.raw,
        }),
      });
      saved += 1;
    } catch {
      // skip — caller can re-run if needed
    }
  }
  if (saved > 0) await mutate(KEY);
  return saved;
}
