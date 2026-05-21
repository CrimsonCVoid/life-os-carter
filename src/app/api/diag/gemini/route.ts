/**
 * Gemini key + connectivity diagnostic. Bearer-guarded with CRON_SECRET so
 * it can't be hit anonymously (would let anyone burn quota). Returns:
 *
 *   {
 *     presentEnvVars: ["GEMINI_API_KEY"],
 *     keyResolved: true,
 *     keyLength: 39,
 *     keyPrefix: "AIzaSyDC…mcPXo",
 *     model: "gemini-2.5-flash",
 *     probe: "ok",            // or "failed" / "skipped"
 *     probeText: "pong",
 *     probeError: undefined
 *   }
 *
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://life-os-carter.vercel.app/api/diag/gemini
 */

import { GoogleGenAI } from "@google/genai";
import { GEMINI_KEY_NAMES, resolveGeminiApiKey } from "@/lib/gemini-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const presentEnvVars = GEMINI_KEY_NAMES.filter((n) => !!process.env[n]);
  const apiKey = resolveGeminiApiKey();

  // Sanity probes for "are runtime envs reaching this function at all".
  const allKeys = Object.keys(process.env);
  const envTotal = allKeys.length;
  const looksLikeGemini = allKeys.filter((k) =>
    /gemini|google|genai/i.test(k)
  );
  const sanity = {
    databaseUrlPresent: !!process.env.DATABASE_URL,
    cronSecretPresent: !!process.env.CRON_SECRET,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
  };

  const base: Record<string, unknown> = {
    presentEnvVars,
    keyResolved: !!apiKey,
    keyLength: apiKey?.length ?? 0,
    keyPrefix: apiKey ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}` : null,
    model: "gemini-2.5-flash",
    envTotal,
    looksLikeGemini,
    sanity,
  };

  if (!apiKey) {
    return Response.json({ ...base, probe: "skipped (no key resolvable)" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: "Reply with the single word: pong" }] },
      ],
      config: { temperature: 0, maxOutputTokens: 8 },
    });
    const text = (res as { text?: string }).text ?? "";
    return Response.json({ ...base, probe: "ok", probeText: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return Response.json({ ...base, probe: "failed", probeError: msg });
  }
}
