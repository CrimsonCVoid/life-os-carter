/**
 * The live Neon `users.id` column is `uuid`-typed (schema.ts declares
 * it as text but the actual table was created with uuid). Auth flows
 * mint external IDs like "device:<uuid>", "apple:<sub>", "google:<sub>"
 * which Postgres can't parse as uuid, producing 22P02 errors.
 *
 * Bridge: hash the external ID into a deterministic UUID before
 * touching the DB. Same input → same UUID, so lookups round-trip.
 * The JWT subject still carries the external ID with prefix so iOS
 * can derive the provider from AuthStore.identityProvider; routes
 * convert to the DB UUID via `externalIdToUuid()` at the SQL boundary.
 *
 * When the live schema is eventually aligned to text (via db:push or
 * a manual ALTER), this helper can stay — hashed strings are still
 * valid text values and existing rows continue to round-trip.
 */

import { createHash } from "crypto";

export function externalIdToUuid(externalId: string): string {
  const h = createHash("sha1").update(externalId).digest("hex");
  // SHA-1 is 40 hex chars; we use the first 32 formatted as a UUID.
  // Collisions are astronomically unlikely for our key space.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
