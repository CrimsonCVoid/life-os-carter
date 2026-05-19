"use client";

import useSWR, { mutate } from "swr";
import type { ListKind } from "@/lib/data/lists";
import type { listItems } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type ListItemRow = InferSelectModel<typeof listItems>;

const keyFor = (kind: ListKind, date: string) =>
  `/api/data/lists?kind=${kind}&date=${date}`;

export function useListItems(kind: ListKind, date: string) {
  const swr = useSWR<ListItemRow[]>(keyFor(kind, date));
  return { items: swr.data ?? [], isLoading: swr.isLoading };
}

export async function addListItem(
  kind: ListKind,
  text: string,
  date: string
): Promise<ListItemRow> {
  const res = await fetch("/api/data/lists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, text, date }),
  });
  if (!res.ok) throw new Error(`add list item failed: ${res.status}`);
  const row = (await res.json()) as ListItemRow;
  await mutate(keyFor(kind, date));
  return row;
}

export async function updateListItem(
  kind: ListKind,
  date: string,
  id: string,
  patch: { text?: string; order?: number }
): Promise<void> {
  await fetch(`/api/data/lists/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate(keyFor(kind, date));
}

export async function deleteListItem(
  kind: ListKind,
  date: string,
  id: string
): Promise<void> {
  await fetch(`/api/data/lists/${id}`, { method: "DELETE" });
  await mutate(keyFor(kind, date));
}
