"use client";

import useSWR, { mutate } from "swr";
import type {
  BodyMeasurementRow,
  BodyPhotoRow,
} from "@/lib/data/body";

const MEAS_KEY = "/api/data/body";
const PHOTOS_KEY = "/api/data/body?kind=photos";

export function useBodyMeasurements() {
  const swr = useSWR<BodyMeasurementRow[]>(MEAS_KEY);
  return { measurements: swr.data ?? [], isLoading: swr.isLoading };
}

export function useBodyPhotoMeta() {
  const swr = useSWR<BodyPhotoRow[]>(PHOTOS_KEY);
  return { photos: swr.data ?? [], isLoading: swr.isLoading };
}

export async function createBodyMeasurement(
  input: Omit<BodyMeasurementRow, "id" | "userId" | "createdAt">
): Promise<BodyMeasurementRow> {
  const res = await fetch(MEAS_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "measurement", ...input }),
  });
  if (!res.ok) throw new Error(`create measurement failed: ${res.status}`);
  const row = (await res.json()) as BodyMeasurementRow;
  await mutate(MEAS_KEY);
  return row;
}

export async function updateBodyMeasurement(
  id: string,
  patch: Partial<BodyMeasurementRow>
): Promise<void> {
  await fetch(`${MEAS_KEY}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate(MEAS_KEY);
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  await fetch(`${MEAS_KEY}/${id}`, { method: "DELETE" });
  await mutate(MEAS_KEY);
}

export async function createBodyPhotoMeta(
  input: Omit<BodyPhotoRow, "id" | "userId" | "createdAt">
): Promise<BodyPhotoRow> {
  const res = await fetch(MEAS_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "photo", ...input }),
  });
  if (!res.ok) throw new Error(`create photo meta failed: ${res.status}`);
  const row = (await res.json()) as BodyPhotoRow;
  await mutate(PHOTOS_KEY);
  return row;
}

export async function deleteBodyPhotoMeta(id: string): Promise<void> {
  await fetch(`${MEAS_KEY}/${id}?kind=photo`, { method: "DELETE" });
  await mutate(PHOTOS_KEY);
}
