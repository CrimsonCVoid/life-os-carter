import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

/**
 * Migrations use the direct (unpooled) connection — pooled PG connections
 * don't support all the introspection / DDL operations drizzle-kit needs.
 * App-time queries go through the pooled URL via lib/db/index.ts.
 *
 * Next.js loads `.env.local` automatically; drizzle-kit doesn't. We load
 * `.env.local` first (developer overrides), then `.env` as a fallback,
 * so this works the same in both contexts without forcing a rename.
 */
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Missing DATABASE_URL_UNPOOLED (or DATABASE_URL) — set them in .env.local"
  );
}

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  // strict: false → drizzle-kit only prompts for destructive changes
  // (data loss). Additive pushes (new tables, new columns) apply
  // straight through, which is what we want for the routine
  // schema-evolution flow.
  strict: false,
  verbose: true,
} satisfies Config;
