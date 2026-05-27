/**
 * Google Health API integration — central configuration.
 *
 * The Google Health API is in late pre-GA (Apr 2026); breaking changes are
 * possible through end of May 2026. All endpoint URLs, scope strings, and
 * data-type identifiers route through this file so a breaking change is a
 * one-file fix.
 */

export const GOOGLE_OAUTH_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_HEALTH_BASE_URL = "https://health.googleapis.com/v4";

/** Restricted scopes — all readonly. */
export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "openid",
  "email",
] as const;

/** Data type ids — kebab-case in URL paths, snake_case in filter params. */
export const DATA_TYPES = {
  sleep: "sleep",
  steps: "steps",
  weight: "weight",
  restingHeartRate: "daily-resting-heart-rate",
  heartRateVariability: "heart-rate-variability",
  /** There is no "cardio-load" data type — that id 400s with
   * "Invalid data type ID". Active Zone Minutes is the real metric
   * (the dailyRollUp parser reads it via activeZoneMinutes.totalMinutes). */
  cardioLoad: "active-zone-minutes",
  activeEnergy: "active-energy-burned",
  totalCalories: "total-calories",
  distance: "distance",
  floors: "floors",
  vo2Max: "vo2-max",
  /** Intraday heart-rate samples (~1 Hz on Fitbit) for the HR analytics graph. */
  heartRate: "heart-rate",
} as const;

export type DataTypeKey = keyof typeof DATA_TYPES;

/** Cookie names — httpOnly tokens stay server-side; only metadata is exposed. */
export const COOKIE_NAMES = {
  accessToken: "gh_at",
  refreshToken: "gh_rt",
  expiresAt: "gh_exp",
  email: "gh_email",
  needsReconnect: "gh_reconnect",
  /** Stores the PKCE code_verifier between /auth/start and /auth/callback. */
  pkceVerifier: "gh_pkce",
  /** Anti-CSRF state token, paired with pkceVerifier. */
  oauthState: "gh_state",
} as const;

/** Server env — throws if missing, so misconfig fails loudly at request time. */
export function readEnv() {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Health API env not configured: GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, GOOGLE_HEALTH_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}
