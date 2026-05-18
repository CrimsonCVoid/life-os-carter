// WebAuthn relying-party config. Values come from env so the same code
// works in local dev, preview, and production.
//
//   WEBAUTHN_RP_ID   — hostname only, no scheme/port. "localhost" or "life-os.app".
//   WEBAUTHN_ORIGIN  — full origin including scheme + port. "http://localhost:3000".
//   WEBAUTHN_RP_NAME — display name shown in OS passkey UI. Defaults to "Life OS".

export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
export const RP_ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
export const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Life OS";

export const SESSION_COOKIE = "lifeos_session";
export const SESSION_TTL_DAYS = 30;
export const CHALLENGE_TTL_MIN = 5;
