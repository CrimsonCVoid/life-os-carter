import { handlers } from "@/auth";

export const { GET, POST } = handlers;

// The Drizzle adapter uses `neon-http` which needs Node — pin this route
// off the Edge runtime so the adapter can read/write Postgres.
export const runtime = "nodejs";
