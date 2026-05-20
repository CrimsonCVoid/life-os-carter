/**
 * Browser-side helpers for Web Push subscription management.
 *
 * Flow:
 *   1. ensureServiceWorker()   — registers /sw.js if not already
 *   2. Notification.requestPermission()
 *   3. registration.pushManager.subscribe(...) using the VAPID public key
 *   4. POST /api/push/subscribe with endpoint + keys
 *
 * iOS PWA caveats:
 *   - Push only works when the app is installed to the home screen (16.4+)
 *   - The Notification permission prompt fires only inside the installed
 *     PWA, never in a regular Safari tab.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState =
  | { kind: "unsupported"; reason: string }
  | { kind: "denied" }
  | { kind: "needs-install" }
  | { kind: "default"; canRequest: true }
  | { kind: "subscribed"; endpoint: string };

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  // iOS Safari sets navigator.standalone for installed PWAs.
  type IOSNav = Navigator & { standalone?: boolean };
  return Boolean(mql?.matches || (window.navigator as IOSNav).standalone);
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return { kind: "unsupported", reason: "no-window" };
  if (!("serviceWorker" in navigator)) {
    return { kind: "unsupported", reason: "no-sw" };
  }
  if (!("PushManager" in window) || !("Notification" in window)) {
    return { kind: "unsupported", reason: "no-push" };
  }
  // iOS requires the PWA to be installed before push permission can be requested.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS && !isStandalone()) {
    return { kind: "needs-install" };
  }
  if (Notification.permission === "denied") return { kind: "denied" };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) return { kind: "subscribed", endpoint: sub.endpoint };
  return { kind: "default", canRequest: true };
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

export async function enablePush(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("VAPID public key not configured");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied"
      ? { kind: "denied" }
      : { kind: "default", canRequest: true };
  }
  const reg = await ensureRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // applicationServerKey expects BufferSource; the Uint8Array .buffer is
    // ArrayBufferLike per TS's strict ts-lib, so we cast to BufferSource
    // explicitly — the runtime value is correct, only the type union is fussy.
    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer as ArrayBuffer,
    });
  }

  const json = sub.toJSON();
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
    }),
  });
  if (!r.ok) throw new Error(`subscribe http ${r.status}`);
  return { kind: "subscribed", endpoint: sub.endpoint };
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return { kind: "default", canRequest: true };
}

export async function sendTestPush(): Promise<{ sent: number; dropped: number }> {
  const r = await fetch("/api/push/test", {
    method: "POST",
    credentials: "include",
  });
  if (!r.ok) throw new Error(`test http ${r.status}`);
  return r.json();
}
