/**
 * Auth gate. Every request that doesn't carry a valid session cookie is
 * bounced to /signin (except the auth endpoints themselves and the static
 * assets excluded by the matcher).
 *
 * Runs on the Edge runtime. JWT session strategy in src/auth.ts means
 * we never touch the Postgres adapter here — keeps the gate fast.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = [
  "/signin",
  "/api/auth",
  // OAuth callback for Google Health lives outside /api/auth and needs
  // to be reachable mid-OAuth-handshake. The handler itself enforces
  // its own session check.
  "/api/fitbit/callback",
  // Vercel's cron scheduler hits this with no session cookie — it has
  // its own bearer-token auth via CRON_SECRET, enforced inside the
  // route handler. Without this whitelist the cron pings get bounced
  // to /signin and the reminders never fire.
  "/api/cron",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return;

  // Native iOS clients send `Authorization: Bearer <jwt>` instead of an
  // Auth.js session cookie. For /api/* paths, let those through — the
  // route handler's getCurrentUser() resolves and rejects bad bearers
  // itself, so security is enforced inside the handler rather than at
  // the middleware redirect. Without this whitelist every
  // /api/data/*, /api/voice-meal, /api/food-photo, /api/overseer
  // request from the native app gets 307'd to /signin (the followed
  // GET then trips a "Failed to find Server Action" inside Next.js
  // because the page route can't satisfy a multipart POST).
  if (pathname.startsWith("/api/")) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && /^bearer\s+\S+/i.test(authHeader)) return;
  }

  if (req.auth) return;
  const url = new URL("/signin", req.nextUrl);
  url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export const config = {
  // Skip Next internals, static files, manifest, service worker, icons.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icon|apple-icon|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
