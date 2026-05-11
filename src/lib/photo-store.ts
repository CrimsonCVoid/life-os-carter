"use client";

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "life-os-photos";
const STORE = "photos";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function putPhoto(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put(STORE, blob, key);
}

export async function getPhoto(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get(STORE, key);
}

export async function deletePhoto(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, key);
}

export async function listPhotos(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys(STORE)) as string[];
}

export async function clearAllPhotos(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}

/**
 * Compress an image File/Blob: downscale to maxW (preserve aspect),
 * encode as JPEG quality 0.85. Returns a JPEG blob.
 */
export async function compressImage(
  file: Blob,
  maxW = 1080,
  quality = 0.85
): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? file),
      "image/jpeg",
      quality
    );
  });
}
