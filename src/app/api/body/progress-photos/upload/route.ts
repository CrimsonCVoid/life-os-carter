import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Server-side upload. Bytes flow:
//   browser → multipart POST → this route → Vercel Blob.
//
// Why not the client-direct `@vercel/blob/client` upload() pattern?
//   That uses a token-then-PUT-then-server-callback dance. On localhost,
//   Vercel's servers can't reach our callback URL, so the client SDK hangs
//   waiting. Server-side upload sidesteps that entirely and works the same
//   in dev and prod.
//
// Limit: Vercel's hobby tier caps function payloads at 4.5MB. Compressed
// progress photos comfortably fit; if you ever need bigger, move to
// chunked upload via the client SDK (which works once deployed on Vercel).

const ANGLES = new Set(["front", "side", "back"]);
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "blob-token-missing" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "bad-multipart" }, { status: 400 });
  }

  const file = form.get("file");
  const angle = String(form.get("angle") ?? "");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "missing-file" }, { status: 400 });
  }
  if (!ANGLES.has(angle)) {
    return Response.json({ error: "invalid-angle" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "empty-file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "file-too-large", bytes: file.size, max: MAX_BYTES },
      { status: 413 }
    );
  }

  const contentType = (file.type || "image/jpeg").split(";")[0].trim();
  if (!ALLOWED_TYPES.includes(contentType)) {
    return Response.json({ error: "invalid-content-type", contentType }, { status: 400 });
  }

  // Pick file extension from content type. We never trust client filename.
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
      ? "webp"
      : contentType === "image/heic"
      ? "heic"
      : "jpg";

  const datePart = new Date().toISOString().slice(0, 10);
  const slug = `${datePart}/${angle}-${Date.now()}`;
  const pathname = `users/${user.id}/progress/${slug}.${ext}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  // Re-extract the blob's actual pathname (Vercel appends a random suffix)
  let storedPathname = pathname;
  try {
    storedPathname = new URL(blob.url).pathname.replace(/^\//, "");
  } catch {
    /* fall back to our pathname */
  }

  return Response.json(
    { blobUrl: blob.url, blobPathname: storedPathname, contentType, bytes: file.size },
    { status: 201 }
  );
}
