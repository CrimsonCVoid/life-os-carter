/**
 * Server-only Drizzle + Neon client.
 *
 * Convention: any file importing from this module must run server-side
 * (route handler, server action, server component). The `-server.ts` /
 * `lib/db/*` discipline keeps secrets out of client bundles.
 *
 * The serverless driver is HTTP-based and works inside Vercel's free-tier
 * Edge / Node functions without keeping persistent TCP connections.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * `next build` on Vercel collects page data by importing every route's
 * module graph synchronously. `@auth/drizzle-adapter` inspects its `db`
 * argument at module load to pick its dialect implementation, which
 * means a missing DATABASE_URL crashes the build (not just runtime).
 *
 * Workaround: always hand the adapter a real drizzle client backed by
 * @neondatabase/serverless. That driver is HTTP-only — `neon(url)`
 * parses but doesn't connect, so a placeholder URL is harmless at build
 * time. The real URL takes over at runtime where it's injected. Any
 * actual query against the placeholder URL would fail loudly when it
 * tried to hit the network — which is the right behavior if a query
 * ever runs without DATABASE_URL set.
 */

const BUILD_TIME_PLACEHOLDER_URL =
  "postgresql://build-time-placeholder:placeholder@build.local/placeholder";

// Use `||` so an empty-string env var (Vercel sometimes injects "") also
// falls through to the placeholder. The placeholder only matters at
// build time when DATABASE_URL hasn't been wired into the build scope.
const url = process.env.DATABASE_URL || BUILD_TIME_PLACEHOLDER_URL;
const sql = neon(url);
export const db = drizzle(sql, { schema });
export type DB = typeof db;
export * from "./schema";
