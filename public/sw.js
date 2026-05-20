// Life OS — offline shell + Web Push handler
const CACHE = "life-os-v2";
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

// ---------- Web Push ----------
// iOS 16.4+ Safari, every Chromium-based browser, and Firefox all support
// the Push API the same way: server sends a notification body, we render it
// via showNotification().

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Life OS", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Life OS";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/apple-icon",
    badge: payload.badge || "/icon",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/" },
    // Vibrate (Android only; iOS gates this).
    vibrate: [10, 30, 10],
    // Keep iOS from auto-grouping too aggressively.
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer focusing an existing PWA window over opening a new one.
      for (const c of clientsList) {
        try {
          const u = new URL(c.url);
          if (u.origin === self.location.origin) {
            await c.focus();
            // Navigate the focused window to the target route.
            if ("navigate" in c) {
              await c.navigate(url);
            }
            return;
          }
        } catch {
          /* ignore — bad URL */
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
