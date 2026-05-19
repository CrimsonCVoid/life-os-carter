"use client";

import useSWR, { mutate } from "swr";
import type {
  eveningRoutineItems,
  morningRoutineItems,
  morningRoutineLogs,
} from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type RoutineKind = "morning" | "evening";
export type RoutineItem =
  | InferSelectModel<typeof morningRoutineItems>
  | InferSelectModel<typeof eveningRoutineItems>;
export type RoutineLog = InferSelectModel<typeof morningRoutineLogs>;

const itemsKey = (kind: RoutineKind, includeLogs: boolean) =>
  `/api/data/routines?kind=${kind}${includeLogs ? "&logs=1" : ""}`;

export type RoutineBundle = {
  items: RoutineItem[];
  logs: RoutineLog[];
};

export function useRoutine(kind: RoutineKind) {
  const swr = useSWR<RoutineBundle>(itemsKey(kind, true));
  return {
    items: swr.data?.items ?? [],
    logs: swr.data?.logs ?? [],
    isLoading: swr.isLoading,
  };
}

export async function toggleRoutineLog(
  kind: RoutineKind,
  itemId: string,
  date: string
): Promise<{ completed: boolean }> {
  const key = itemsKey(kind, true);
  let next = { completed: false };
  await mutate<RoutineBundle>(
    key,
    (cur) => {
      if (!cur) return cur;
      const logs = [...cur.logs];
      const idx = logs.findIndex(
        (l) => l.itemId === itemId && l.date === date
      );
      if (idx >= 0) {
        logs.splice(idx, 1);
        next = { completed: false };
      } else {
        logs.push({
          userId: "",
          itemId,
          date,
          completedAt: new Date(),
        } as RoutineLog);
        next = { completed: true };
      }
      return { items: cur.items, logs };
    },
    { revalidate: false }
  );
  await fetch("/api/data/routines/log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, itemId, date }),
  });
  await mutate(key);
  return next;
}

export async function createRoutineItem(
  kind: RoutineKind,
  input: { name: string; order?: number }
) {
  const key = itemsKey(kind, true);
  await fetch(`/api/data/routines?kind=${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  await mutate(key);
}

export async function updateRoutineItem(
  kind: RoutineKind,
  id: string,
  patch: { name?: string; order?: number }
) {
  const key = itemsKey(kind, true);
  await mutate<RoutineBundle>(
    key,
    (cur) =>
      cur
        ? {
            items: cur.items.map((i) =>
              i.id === id ? ({ ...i, ...patch } as RoutineItem) : i
            ),
            logs: cur.logs,
          }
        : cur,
    { revalidate: false }
  );
  await fetch(`/api/data/routines/${id}?kind=${kind}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate(key);
}

export async function deleteRoutineItem(
  kind: RoutineKind,
  id: string,
  opts?: { archive?: boolean }
) {
  const key = itemsKey(kind, true);
  const archive = opts?.archive ? "&archive=1" : "";
  await fetch(`/api/data/routines/${id}?kind=${kind}${archive}`, {
    method: "DELETE",
  });
  await mutate(key);
}
