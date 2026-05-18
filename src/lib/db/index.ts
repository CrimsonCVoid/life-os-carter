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

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (pooled Neon URL)."
  );
}

const sql = neon(url);
export const db = drizzle(sql, { schema });
export type DB = typeof db;
export * from "./schema";
