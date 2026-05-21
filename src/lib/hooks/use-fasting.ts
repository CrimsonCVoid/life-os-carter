"use client";
import useSWR, { mutate } from "swr";
import type { FastingWindow } from "@/lib/types";

const KEY_LIST = "/api/data/fasting";
const KEY_ACTIVE = "/api/data/fasting?active=1";

export function useFastingHistory() {
  const swr = useSWR<FastingWindow[]>(KEY_LIST);
  return { windows: swr.data ?? [], isLoading: swr.isLoading, error: swr.error };
}

export function useActiveFasting() {
  const swr = useSWR<FastingWindow | null>(KEY_ACTIVE);
  return { active: swr.data ?? null, isLoading: swr.isLoading, error: swr.error };
}

export async function startFast(
  input: { startedAt?: string; targetHours?: number; notes?: string } = {}
): Promise<FastingWindow | undefined> {
  let started: FastingWindow | undefined;
  const optimistic: FastingWindow = {
    id: "temp-" + Date.now().toString(36),
    startedAt: input.startedAt ?? new Date().toISOString(),
    targetHours: input.targetHours ?? 16,
    notes: input.notes,
  };
  await mutate<FastingWindow | null>(
    KEY_ACTIVE,
    async () => {
      const res = await fetch(KEY_LIST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`start failed: ${res.status}`);
      started = await res.json();
      return started!;
    },
    { optimisticData: optimistic, rollbackOnError: true, revalidate: true }
  );
  await mutate(KEY_LIST);
  return started;
}

export async function endFast(id: string, endedAt: string = new Date().toISOString()): Promise<void> {
  await mutate<FastingWindow | null>(
    KEY_ACTIVE,
    async () => {
      const res = await fetch(`${KEY_LIST}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ endedAt }),
      });
      if (!res.ok) throw new Error(`end failed: ${res.status}`);
      return null;
    },
    { optimisticData: null, rollbackOnError: true, revalidate: true }
  );
  await mutate(KEY_LIST);
}

export async function updateFast(id: string, patch: Partial<{ startedAt: string; endedAt: string | null; targetHours: number; notes: string | null }>): Promise<void> {
  await mutate<FastingWindow[]>(
    KEY_LIST,
    async (current) => {
      const list = current ?? [];
      const res = await fetch(`${KEY_LIST}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
      const next: FastingWindow = await res.json();
      return list.map((w) => (w.id === id ? next : w));
    },
    { rollbackOnError: true, revalidate: true }
  );
  await mutate(KEY_ACTIVE);
}

export async function deleteFast(id: string): Promise<void> {
  await mutate<FastingWindow[]>(
    KEY_LIST,
    async (current) => {
      const list = current ?? [];
      const res = await fetch(`${KEY_LIST}/${id}`, { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      return list.filter((w) => w.id !== id);
    },
    { optimisticData: (current) => (current ?? []).filter((w) => w.id !== id), rollbackOnError: true, revalidate: true }
  );
  await mutate(KEY_ACTIVE);
}
