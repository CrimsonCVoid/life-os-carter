"use client";

import useSWR, { mutate } from "swr";
import type { JournalRow, JournalSource } from "@/lib/data/journal";

const ALL_KEY = "/api/data/journal";
const keyForDate = (date: string) => `/api/data/journal?date=${date}`;

export function useJournalEntries() {
  const swr = useSWR<JournalRow[]>(ALL_KEY);
  return { entries: swr.data ?? [], isLoading: swr.isLoading };
}

export function useJournalForDate(date: string) {
  const swr = useSWR<JournalRow[]>(keyForDate(date));
  return { entries: swr.data ?? [], isLoading: swr.isLoading };
}

export async function createJournalEntry(input: {
  date: string;
  text: string;
  source: JournalSource;
  tags?: string[];
  mood?: number | null;
  energy?: number | null;
  summary?: string | null;
  moodWord?: string | null;
  voiceIndexeddbKey?: string | null;
}): Promise<JournalRow> {
  const res = await fetch(ALL_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create journal failed: ${res.status}`);
  const row = (await res.json()) as JournalRow;
  await mutate(ALL_KEY);
  await mutate(keyForDate(input.date));
  return row;
}

export async function updateJournalEntry(
  id: string,
  patch: Partial<JournalRow>
): Promise<void> {
  await fetch(`${ALL_KEY}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate((k) => typeof k === "string" && k.startsWith(ALL_KEY));
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await fetch(`${ALL_KEY}/${id}`, { method: "DELETE" });
  await mutate((k) => typeof k === "string" && k.startsWith(ALL_KEY));
}
