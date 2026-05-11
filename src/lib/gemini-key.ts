/**
 * Accept any of the common Gemini env-var names so a key pasted under a
 * different label on Vercel still works. Strips whitespace and stray
 * quotes that sometimes come from copy-paste.
 */
export function resolveGeminiApiKey(): string | null {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
    if (trimmed) return trimmed;
  }
  return null;
}

export const GEMINI_KEY_NAMES = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_GENAI_API_KEY",
] as const;
