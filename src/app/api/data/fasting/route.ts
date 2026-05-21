import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import {
  listFastingWindows,
  getActiveFastingWindow,
  startFastingWindow,
} from "@/lib/data/fasting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const onlyActive = req.nextUrl.searchParams.get("active") === "1";
  return withUser(async (userId): Promise<unknown> =>
    onlyActive ? getActiveFastingWindow(userId) : listFastingWindows(userId)
  );
}

export async function POST(req: NextRequest) {
  return withUserRequest(req, ({ userId, body }) =>
    startFastingWindow(userId, body as { startedAt?: string; targetHours?: number; notes?: string })
  );
}
