// Life OS — basic offline shell service worker.
//
// Bump CACHE when the request flow changes — the `activate` handler
// deletes every cache name that isn't the current one, so the next
// request after the new SW installs gets fresh assets across the board.
// (v1 → v2 bump: previously-cached chunks on desktop browsers were
//  pinning the broken sign-in JS even after the fix shipped.)
// (v2 → v3 bump: stale chunks were pinning a HydrateGate that could
//  hang forever on desktop; new build adds a safety-net timeout.)
const CACHE = "life-os-v3";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // never cache API routes or Next data fetches
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/_next/data/")) {
    return;
  }

  // Sign-in surface must always go to the network — a stale cached page
  // pins the previous build's chunk hashes, which is how desktop users
  // ended up stuck on the broken click handler after the deploy fixed it.
  if (
    url.pathname === "/signin" ||
    url.pathname.startsWith("/signin/") ||
    url.pathname.startsWith("/api/auth/")
  ) {
    return;
  }

  // network-first for HTML
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/")))
    );
    return;
  }

  // stale-while-revalidate for static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ─────────────────────────────────────────────────────────────────────
// Push notifications. Payload shape matches lib/web-push.ts PushPayload:
//   { title, body, url?, tag? }
// We tolerate a missing/malformed payload (some push services fire a
// "wake" event with no body) by falling back to a generic banner.
// ─────────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = { title: "Life OS", body: "", url: "/", tag: "life-os" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch (e) {
    // Non-JSON payload — show a generic notification rather than dropping.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

// Tap a notification → focus existing tab if there is one, else open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch (e) {
              // navigate() can fail cross-origin / on detached docs; ignore.
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
