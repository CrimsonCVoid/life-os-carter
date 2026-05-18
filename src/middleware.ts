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
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return;
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
