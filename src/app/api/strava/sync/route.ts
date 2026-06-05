/**
 * POST /api/strava/sync
 *
 * DORMANT until STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are set AND a
 * Strava refresh token has been persisted for the user.
 *
 * Bearer-gated via requireUser(). Refreshes the access token from the
 * stored (encrypted) refresh token, then pulls recent activities from
 * https://www.strava.com/api/v3/athlete/activities and returns a
 * normalized list. Mirrors the google-health sync shape: per-user,
 * defensive about partial data, never exposes raw tokens.
 *
 * No `strava_tokens` schema column exists yet, so loadRefreshToken()
 * returns null today and the route 503s with "strava not connected".
 * Once persistence lands, fill loadRefreshToken() and the rest works
 * unchanged.
 */

import { NextResponse } from "next/server";
import { requireUser, type CurrentUser } from "@/lib/auth-server";
// import { decrypt } from "@/lib/db/encryption"; // wire up with loadRefreshToken()

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES = "https://www.strava.com/api/v3/athlete/activities";

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  startDate: string;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  avgHeartrate: number | null;
  calories: number | null;
};

type StravaActivityRaw = {
  id?: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  calories?: number;
};

type StravaRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

/**
 * Load the user's persisted, encrypted Strava refresh token and decrypt it.
 *
 * TODO: persist encrypted refresh token once a column exists. The callback
 * deliberately stores nothing today (no schema column), so this returns
 * null and the route reports not-connected. When a `strava_tokens` row or
 * an integrations-table column lands, read it here and `decrypt(...)`.
 */
async function loadRefreshToken(_user: CurrentUser): Promise<string | null> {
  return null;
}

function num(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalize(a: StravaActivityRaw): StravaActivity {
  return {
    id: a.id ?? 0,
    name: (a.name ?? "Activity").trim(),
    type: a.sport_type || a.type || "Workout",
    startDate: a.start_date ?? "",
    distanceMeters: num(a.distance),
    movingTimeSec: num(a.moving_time),
    avgHeartrate: num(a.average_heartrate),
    calories: num(a.calories),
  };
}

export async function POST(): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "strava not configured" }, { status: 503 });
  }

  const refreshToken = await loadRefreshToken(auth);
  if (!refreshToken) {
    return NextResponse.json({ error: "strava not connected" }, { status: 503 });
  }

  // Strava access tokens are short-lived (6h); always refresh before a sync.
  let accessToken: string;
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetch(STRAVA_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "reconnect_needed" }, { status: 401 });
    }
    const json = (await res.json()) as StravaRefreshResponse;
    if (!json.access_token) {
      return NextResponse.json({ error: "reconnect_needed" }, { status: 401 });
    }
    accessToken = json.access_token;
    // TODO: persist rotated refresh token (json.refresh_token) once a column
    // exists — Strava rotates refresh tokens on every refresh.
  } catch {
    return NextResponse.json({ error: "refresh failed" }, { status: 502 });
  }

  const url = new URL(STRAVA_ACTIVITIES);
  url.searchParams.set("per_page", "30");

  let activities: StravaActivityRaw[];
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "activities failed", status: res.status },
        { status: 502 }
      );
    }
    activities = (await res.json()) as StravaActivityRaw[];
  } catch {
    return NextResponse.json({ error: "activities failed" }, { status: 502 });
  }

  const items = (activities ?? []).map(normalize);
  return NextResponse.json({ activities: items });
}
