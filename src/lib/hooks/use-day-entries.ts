"use client";

import useSWR, { mutate } from "swr";
import type { DayEntryRow } from "@/lib/data/day-entries";

export function useDayEntry(date: string) {
  const key = `/api/data/day-entries?date=${date}`;
  const swr = useSWR<DayEntryRow | null>(key);
  return {
    entry: swr.data ?? null,
    isLoading: swr.isLoading,
    error: swr.error,
  };
}

export async function setDayType(date: string, dayType: string): Promise<void> {
  const key = `/api/data/day-entries?date=${date}`;
  await mutate<DayEntryRow | null>(
    key,
    (cur) =>
      cur
        ? { ...cur, dayType }
        : ({
            userId: "",
            date,
            dayType,
            scoreCache: null,
            sleepLogged: false,
            journaled: false,
            updatedAt: new Date(),
          } as DayEntryRow),
    { revalidate: false }
  );
  await fetch("/api/data/day-entries", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, dayType }),
  });
  await mutate(key);
}
