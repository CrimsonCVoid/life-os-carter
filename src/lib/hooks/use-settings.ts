"use client";

import useSWR, { mutate } from "swr";

const KEY = "/api/data/settings";

export function useUserSettings<T = Record<string, unknown>>() {
  const swr = useSWR<T>(KEY);
  return { settings: swr.data ?? ({} as T), isLoading: swr.isLoading };
}

export async function saveSettings(next: Record<string, unknown>): Promise<void> {
  await mutate<Record<string, unknown>>(KEY, next, { revalidate: false });
  await fetch(KEY, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  });
  await mutate(KEY);
}
