import "dotenv/config";
import type { Config } from "drizzle-kit";

/**
 * Migrations use the direct (unpooled) connection — pooled PG connections
 * don't support all the introspection / DDL operations drizzle-kit needs.
 * App-time queries go through the pooled URL via lib/db/index.ts.
 */
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
  strict: true,
  verbose: true,
} satisfies Config;
