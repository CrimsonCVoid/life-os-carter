import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Blob: server-side companion to client-side `upload()`.
// Two roles in one handler:
//   1. Issue a one-time upload token after validating user + pathname.
//   2. Receive the post-upload webhook from Vercel Blob.
// The body shape (`type: 'blob.generate-client-token'` vs `'blob.upload-completed'`)
// tells us which.

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"];

export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("unauthorized");

        // Pathname must be scoped to this user — clients constructing the
        // pathname can't escape into another user's folder.
        const prefix = `users/${user.id}/`;
        if (!pathname.startsWith(prefix)) {
          throw new Error("invalid-pathname");
        }

        const isVoice = pathname.includes(`${prefix}voice/`);
        const isImage =
          pathname.includes(`${prefix}progress/`) ||
          pathname.includes(`${prefix}meals/`);
        if (!isVoice && !isImage) throw new Error("invalid-kind");

        return {
          allowedContentTypes: isVoice ? ALLOWED_AUDIO_TYPES : ALLOWED_IMAGE_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes: isVoice ? 25 * 1024 * 1024 : 15 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // Hook for future cleanup / audit logging. The entity tables
        // (progress_photos, meals, journal_entries) already store the blob
        // URL when the user submits the record, so nothing to do here yet.
      },
    });

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload-error";
    const status = message === "unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
