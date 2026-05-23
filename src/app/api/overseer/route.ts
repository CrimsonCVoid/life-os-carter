import { GoogleGenAI } from "@google/genai";
import { PERSONA_SYSTEM, buildContextBlock } from "@/lib/prompts";
import { resolveGeminiApiKey } from "@/lib/gemini-key";
import {
  classifyGeminiError,
  geminiErrorPlainResponse,
  withGeminiRetry,
} from "@/lib/gemini-error";
import { getCurrentUser } from "@/lib/auth-server";
import { listFacts } from "@/lib/data/user-facts";
import type { OverseerContext } from "@/store/selectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Body = {
  messages: ChatMessage[];
  context: OverseerContext;
};

type StreamChunk = {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

const MODEL = "gemini-2.5-flash";

function extractText(chunk: StreamChunk): string {
  if (typeof chunk.text === "string" && chunk.text.length > 0) {
    return chunk.text;
  }
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts) return "";
  return parts.map((p) => p.text ?? "").join("");
}

// Shape-complete empty OverseerContext. Returned when the caller (the
// native iOS Coach right now) doesn't have a populated context to
// send. buildContextBlock dereferences fields by their real selector
// names — recentJournal, last7DaysSummary, plansTomorrow, etc. — so the
// stub must mirror that shape exactly. Missing fields crash the route
// on .length / .map access in prompts.ts.
function emptyContext(): OverseerContext {
  return {
    today: "",
    dayType: "",
    goalsToday: [],
    habits: [],
    eveningRoutine: undefined,
    morningRoutine: undefined,
    workoutsToday: [],
    health: undefined,
    plansTomorrow: [],
    winsToday: [],
    strugglesToday: [],
    last7DaysSummary: [],
    recentJournal: [],
    recentVoiceSummaries: [],
    scheduleToday: [],
    energyToday: null,
    nutritionToday: null,
    bodyLatest: null,
    currentPattern: null,
    recentWeeklyReviews: [],
    recurringGoals: [],
  } as unknown as OverseerContext;
}

export async function POST(req: Request) {
  try {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return new Response("missing-key", { status: 503 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }
    if (!body?.messages?.length) {
      return new Response("No messages", { status: 400 });
    }

    // Native iOS sends a stub context object — fill in any missing
    // fields with their empty/undefined equivalents so the prompt
    // builder doesn't crash on .length access.
    body.context = { ...emptyContext(), ...(body.context ?? {}) };

  const ai = new GoogleGenAI({ apiKey });

  // Persisted user facts — the long-term memory layer. Fetched per
  // request because they change over time (the extractor route adds
  // them in the background after each turn) and we want the latest
  // ground truth in every system prompt.
  const user = await getCurrentUser();
  const facts = user ? await listFacts(user.id) : [];
  const factsBlock = facts.length
    ? facts.map((f) => `- ${f.value.text}`).join("\n")
    : "(none yet)";

  const systemInstruction =
    PERSONA_SYSTEM +
    "\n\n--- WHAT YOU REMEMBER ABOUT THIS USER ---\n" +
    factsBlock +
    "\n\n(These are durable facts the user has shared across past sessions. " +
    "Reference them naturally when relevant; do not enumerate them or " +
    "treat them as a checklist.)" +
    "\n\n--- USER CONTEXT ---\n" +
    buildContextBlock(body.context);

  const contents = body.messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  let stream: AsyncIterable<StreamChunk>;
  try {
    stream = (await withGeminiRetry(() =>
      ai.models.generateContentStream({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      })
    )) as unknown as AsyncIterable<StreamChunk>;
  } catch (err) {
    console.error("[overseer] stream connect failed", err);
    return geminiErrorPlainResponse(err, "overseer");
  }

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = extractText(chunk);
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        console.error("[overseer] mid-stream failure", err);
        // Mid-stream failure: we can't switch to an error Response (headers
        // already flushed), so emit a sanitized inline marker. Never the
        // raw SDK message — that would leak the Google API JSON.
        const kind = classifyGeminiError(err);
        const note =
          kind === "quota_exceeded"
            ? "\n\n[Daily AI quota reached. Try again later.]"
            : "\n\n[Connection interrupted.]";
        controller.enqueue(encoder.encode(note));
        controller.close();
      }
    },
  });

    return new Response(out, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[overseer] uncaught:", msg);
    return new Response(`[Coach error: ${msg}]`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
