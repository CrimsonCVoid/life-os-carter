/**
 * Client-side helpers for uploading files directly to Vercel Blob.
 *
 * Server-side, /api/uploads/sign verifies the user, scopes the pathname under
 * `users/{uid}/`, and hands back a one-time upload token. The actual bytes
 * never pass through our Next function — the browser streams them straight
 * to Vercel Blob. That keeps us under Vercel's 4.5MB function-payload cap
 * and lets us accept big progress photos / voice notes.
 *
 * URLs are unguessable but technically public. For Carter's private app
 * that's the right tradeoff; if true privacy is later required, swap to
 * proxied reads through a /api/uploads/get/[id] route with the session
 * gate.
 */
import { upload } from "@vercel/blob/client";

export type UploadKind = "progress" | "meals" | "voice";

const EXT_BY_KIND: Record<UploadKind, string> = {
  progress: "jpg",
  meals: "jpg",
  voice: "webm",
};

function defaultExt(kind: UploadKind, file: File): string {
  const fromFile = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return fromFile ?? EXT_BY_KIND[kind];
}

/** Upload a file. Returns the public URL stored in DB. */
export async function uploadUserFile(opts: {
  userId: string;
  kind: UploadKind;
  file: File;
  /** Subpath under the kind, e.g. "2026-05-18/front" or a meal id. */
  slug: string;
}): Promise<string> {
  const ext = defaultExt(opts.kind, opts.file);
  const pathname = `users/${opts.userId}/${opts.kind}/${opts.slug}.${ext}`;
  const blob = await upload(pathname, opts.file, {
    access: "public",
    handleUploadUrl: "/api/uploads/sign",
    contentType: opts.file.type || undefined,
  });
  return blob.url;
}

export async function uploadProgressPhoto(
  userId: string,
  date: string,
  angle: "front" | "side" | "back",
  file: File
): Promise<string> {
  return uploadUserFile({
    userId,
    kind: "progress",
    file,
    slug: `${date}/${angle}-${Date.now()}`,
  });
}

export async function uploadMealPhoto(
  userId: string,
  mealId: string,
  file: File
): Promise<string> {
  return uploadUserFile({ userId, kind: "meals", file, slug: mealId });
}

export async function uploadVoiceJournal(
  userId: string,
  entryId: string,
  blobOrFile: Blob
): Promise<string> {
  // Voice recordings come from MediaRecorder as Blob, not File — wrap.
  const file =
    blobOrFile instanceof File
      ? blobOrFile
      : new File([blobOrFile], `${entryId}.webm`, {
          type: blobOrFile.type || "audio/webm",
        });
  return uploadUserFile({ userId, kind: "voice", file, slug: entryId });
}
