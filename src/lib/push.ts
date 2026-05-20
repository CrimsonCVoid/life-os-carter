/**
 * Web Push helpers. Server-side only — never import from a client component.
 */

import webpush from "web-push";
import { query } from "@/lib/db/client";

let configured = false;

function configure() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:dev@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys missing — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Deep-link path; opening the notification routes the PWA here. */
  url?: string;
  /** Notification tag for collapsing — same tag replaces older notifications. */
  tag?: string;
  /** Optional icon URL — falls back to /apple-icon. */
  icon?: string;
};

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Send a payload to every subscription for a user. Removes dead endpoints. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; dropped: number }> {
  configure();
  const subs = await query<Subscription>(
    "SELECT id::text, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  if (subs.length === 0) return { sent: 0, dropped: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
    icon: payload.icon ?? "/apple-icon",
  });

  let sent = 0;
  let dropped = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          { TTL: 60 * 60 * 24 }
        );
        sent++;
        await query(
          "UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1",
          [s.id]
        );
      } catch (err) {
        // 404/410 means the subscription is dead — clean it out.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dropped++;
          await query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
        } else {
          // Log but don't throw — one bad subscription shouldn't fail others.
          console.error("[push] send failed", { id: s.id, status, err });
        }
      }
    })
  );

  return { sent, dropped };
}
