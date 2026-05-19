"use client";

import useSWR, { mutate } from "swr";
import type { ScheduleBlockRow } from "@/lib/data/schedule";

const keyFor = (date: string) => `/api/data/schedule?date=${date}`;

export function useSchedule(date: string) {
  const swr = useSWR<ScheduleBlockRow[]>(keyFor(date));
  return { blocks: swr.data ?? [], isLoading: swr.isLoading };
}

export async function createBlock(
  input: Omit<ScheduleBlockRow, "id" | "userId" | "createdAt">
): Promise<ScheduleBlockRow> {
  const res = await fetch("/api/data/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create block failed: ${res.status}`);
  const row = (await res.json()) as ScheduleBlockRow;
  await mutate(keyFor(input.date));
  return row;
}

export async function updateBlock(
  date: string,
  id: string,
  patch: Partial<ScheduleBlockRow>
): Promise<void> {
  await mutate<ScheduleBlockRow[]>(
    keyFor(date),
    (cur) =>
      (cur ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)),
    { revalidate: false }
  );
  await fetch(`/api/data/schedule/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate(keyFor(date));
}

export async function deleteBlock(date: string, id: string): Promise<void> {
  await mutate<ScheduleBlockRow[]>(
    keyFor(date),
    (cur) => (cur ?? []).filter((b) => b.id !== id),
    { revalidate: false }
  );
  await fetch(`/api/data/schedule/${id}`, { method: "DELETE" });
  await mutate(keyFor(date));
}
