/**
 * Sanitized error responses for Gemini-backed routes.
 *
 * Without this, route catch-blocks return raw SDK Error.message — which
 * is often the full Google API response JSON (RESOURCE_EXHAUSTED, billing
 * URLs, retry hints). Clients then render that JSON verbatim in the UI.
 *
 * Every Gemini route should funnel its catch through one of:
 *   - geminiErrorPlainResponse  (for text/streaming routes)
 *   - geminiErrorJsonResponse   (for JSON routes)
 *
 * Clients can rely on a stable, JSON-free `error` taxonomy:
 *   "quota_exceeded"     → 429, daily free-tier limit hit
 *   "<tag>_timeout"      → 504, our AbortController fired
 *   "<tag>_failed"       → 502, any other upstream failure
 */

export type GeminiErrorKind = "quota_exceeded" | "timeout" | "upstream";

export function classifyGeminiError(err: unknown): GeminiErrorKind {
  if (err instanceof Error && err.name === "AbortError") return "timeout";
  const raw = err instanceof Error ? err.message : "";
  if (raw.includes('"code":429') || /RESOURCE_EXHAUSTED/.test(raw)) {
    return "quota_exceeded";
  }
  return "upstream";
}

export function geminiErrorPlainResponse(
  err: unknown,
  failureTag: string
): Response {
  const kind = classifyGeminiError(err);
  if (kind === "quota_exceeded") {
    return new Response("quota_exceeded", { status: 429 });
  }
  if (kind === "timeout") {
    return new Response(`${failureTag}_timeout`, { status: 504 });
  }
  return new Response(`${failureTag}_failed`, { status: 502 });
}

export function geminiErrorJsonResponse(
  err: unknown,
  failureTag: string
): Response {
  const kind = classifyGeminiError(err);
  if (kind === "quota_exceeded") {
    return Response.json({ error: "quota_exceeded" }, { status: 429 });
  }
  if (kind === "timeout") {
    return Response.json({ error: `${failureTag}_timeout` }, { status: 504 });
  }
  return Response.json({ error: `${failureTag}_failed` }, { status: 502 });
}

/* ─────────────────────────────────────────────────────────────────────
 * Client-side classification — every AI surface routes through this so
 * the user-facing copy stays consistent and no raw response body ever
 * reaches the DOM.
 * ──────────────────────────────────────────────────────────────────── */

export type GeminiUserMessageType =
  | "quota"
  | "timeout"
  | "missing-key"
  | "upstream";

export type GeminiUserMessage = {
  type: GeminiUserMessageType;
  userMessage: string;
};

const FRIENDLY: Record<GeminiUserMessageType, string> = {
  quota: "AI features have hit today's free limit — try again later.",
  timeout: "The AI took too long to respond. Try again in a moment.",
  "missing-key": "AI features aren't configured on this server yet.",
  upstream: "Couldn't generate this right now. Try again in a moment.",
};

/**
 * Map a fetch response status (and optional error tag from the body) to a
 * user-safe message. Use this on the client instead of displaying the raw
 * response body.
 */
export function geminiUserMessage(
  status: number,
  errorTag?: string
): GeminiUserMessage {
  if (status === 429 || errorTag === "quota_exceeded") {
    return { type: "quota", userMessage: FRIENDLY.quota };
  }
  if (status === 503 || errorTag === "missing-key" || errorTag === "missing_key") {
    return { type: "missing-key", userMessage: FRIENDLY["missing-key"] };
  }
  if (status === 504 || (errorTag && errorTag.endsWith("_timeout"))) {
    return { type: "timeout", userMessage: FRIENDLY.timeout };
  }
  return { type: "upstream", userMessage: FRIENDLY.upstream };
}

/* ─────────────────────────────────────────────────────────────────────
 * Single-retry with short backoff for transient failures.
 *
 * Retry policy (per spec): one extra attempt for network blips / 5xx,
 * NEVER for 429 (quota) — retrying a quota error is pointless and burns
 * another call — and NOT for AbortError (timeout's signal is one-shot).
 *
 * Wrap only the simple, non-timeout-protected calls (briefing, summary,
 * overseer stream init). Routes that already have a 30s AbortController
 * shouldn't double the wall-clock by retrying inside the same timeout
 * budget.
 * ──────────────────────────────────────────────────────────────────── */

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  options?: { backoffMs?: number }
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const kind = classifyGeminiError(err);
    if (kind === "quota_exceeded" || kind === "timeout") throw err;
    await new Promise((r) => setTimeout(r, options?.backoffMs ?? 200));
    return await fn();
  }
}
