#!/usr/bin/env node
// One-shot deploy of db/schema.sql against $DATABASE_URL.
// Usage:
//   DATABASE_URL='postgres://...' node scripts/deploy-schema.mjs

import { Pool } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "db", "schema.sql");

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const sql = fs.readFileSync(schemaPath, "utf8");
console.log(`Loaded ${schemaPath} — ${sql.length.toLocaleString()} chars`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const t0 = Date.now();
try {
  await pool.query(sql);
  console.log(`✓ schema deployed in ${Date.now() - t0}ms`);
} catch (err) {
  console.error("✗ deploy failed:", err.message);
  if (err.position) console.error(`  near SQL position ${err.position}`);
  process.exit(2);
} finally {
  await pool.end();
}
