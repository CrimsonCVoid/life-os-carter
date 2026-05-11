"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles, X, ExternalLink } from "lucide-react";
import { getOverseerContext } from "@/store/selectors";
import { uid } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { OverseerProvider } from "./overseer-context";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const EMPTY_PROMPTS = [
  "What should I focus on right now?",
  "Help me schedule the rest of today",
  "How was my week?",
  "What patterns do you see?",
];

export function Overseer() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<null | { kind: "no-key" | "other"; msg: string }>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  const openPanel = React.useCallback((prefill?: string) => {
    setOpen(true);
    if (prefill) setDraft(prefill);
    haptic("tap");
  }, []);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text || streaming) return;
    setError(null);

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    const assistantId = uid();
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, placeholder]);
    setDraft("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/overseer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(({ role, content }) => ({ role, content })),
          context: getOverseerContext(),
        }),
        signal: controller.signal,
      });

      if (res.status === 503) {
        setError({ kind: "no-key", msg: "missing-key" });
        setMessages((cur) => cur.filter((m) => m.id !== assistantId));
        return;
      }
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantId ? { ...m, content: acc } : m
          )
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Something broke.";
      setError({ kind: "other", msg });
      setMessages((cur) => cur.filter((m) => m.id !== assistantId));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const visibleMessages = messages.filter((m) => m.content.length > 0);

  return (
    <OverseerProvider value={{ open: openPanel }}>
      {/* floating button */}
      <button
        type="button"
        onClick={() => openPanel()}
        aria-label="Open Overseer"
        className="fixed z-40 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] h-14 w-14 grid place-items-center rounded-full grad-hero text-white shadow-[var(--shadow-glow)] hover:brightness-110 active:scale-95 transition"
      >
        <Sparkles size={22} strokeWidth={2.2} />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center">
            <motion.button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-label="Overseer"
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="relative w-full sm:max-w-md h-[88dvh] sm:h-[640px] sm:mb-6 flex flex-col card rounded-b-none sm:rounded-b-[var(--radius-card)]"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <header className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--color-stroke)]">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 grid place-items-center rounded-full grad-hero text-white">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Overseer</div>
                    <div className="text-[11px] text-[var(--color-fg-3)]">
                      Sees your data. Speaks plain.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="h-9 w-9 grid place-items-center rounded-full text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
                >
                  <X size={18} />
                </button>
              </header>

              <div
                ref={scrollerRef}
                className="flex-1 overflow-y-auto nice-scroll px-5 py-3 space-y-3"
              >
                {error?.kind === "no-key" ? (
                  <NoKeyState />
                ) : visibleMessages.length === 0 && !streaming ? (
                  <EmptyState onPick={(p) => send(p)} />
                ) : (
                  <>
                    {visibleMessages.map((m) => (
                      <Bubble
                        key={m.id}
                        role={m.role}
                        content={m.content}
                      />
                    ))}
                    {streaming &&
                      messages[messages.length - 1]?.role === "assistant" &&
                      messages[messages.length - 1]?.content === "" && <TypingDots />}
                  </>
                )}

                {error?.kind === "other" && (
                  <div className="text-xs text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] rounded-xl px-3 py-2">
                    {error.msg}
                  </div>
                )}
              </div>

              <footer className="border-t border-[var(--color-stroke)] px-3 py-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={
                      error?.kind === "no-key"
                        ? "Add an API key to enable"
                        : "Ask Overseer anything…"
                    }
                    disabled={error?.kind === "no-key"}
                    className="control no-zoom flex-1 px-3 py-2.5 min-h-[44px] max-h-32 resize-none outline-none accent-ring disabled:opacity-50"
                  />
                  {streaming ? (
                    <button
                      type="button"
                      onClick={cancel}
                      className="h-11 px-3 grid place-items-center rounded-xl bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)] transition"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!draft.trim() || error?.kind === "no-key"}
                      aria-label="Send"
                      className="h-11 w-11 grid place-items-center rounded-xl bg-[var(--color-accent-strong)] text-white active:scale-95 transition disabled:opacity-40"
                    >
                      <Send size={17} />
                    </button>
                  )}
                </form>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OverseerProvider>
  );
}

function Bubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[88%] whitespace-pre-wrap text-[15px] leading-[1.45] rounded-2xl px-3.5 py-2.5 " +
          (isUser
            ? "bg-[var(--color-accent-strong)] text-white rounded-br-md"
            : "bg-[var(--color-elevated)] text-[var(--color-fg)] rounded-bl-md border border-[var(--color-stroke)]")
        }
      >
        {content || " "}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="bg-[var(--color-elevated)] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5 border border-[var(--color-stroke)]">
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-2)] animate-pulse-dot"
      style={{ animationDelay: delay }}
    />
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="pt-4">
      <div className="text-center px-4">
        <div className="text-sm text-[var(--color-fg-2)] leading-relaxed">
          I see your goals, habits, vitals, workouts, plans, journal, and 7 days of trends. Ask me anything.
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        {EMPTY_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="text-[13px] text-left text-[var(--color-fg)] hover:bg-[var(--color-elevated)] py-2.5 px-3.5 rounded-xl border border-[var(--color-stroke)] hover:border-[var(--color-stroke-strong)] transition"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoKeyState() {
  return (
    <div className="pt-4 px-2">
      <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)] bg-[var(--color-accent-soft)] p-5 text-center">
        <div className="h-10 w-10 mx-auto grad-hero rounded-xl grid place-items-center text-white mb-3">
          <Sparkles size={18} />
        </div>
        <div className="text-sm font-semibold mb-1">
          Add a Gemini key to enable Overseer
        </div>
        <div className="text-xs text-[var(--color-fg-2)] mb-4">
          Set <code className="px-1 rounded bg-[var(--color-elevated)]">GEMINI_API_KEY</code> in your Vercel project env vars, or locally in <code className="px-1 rounded bg-[var(--color-elevated)]">.env.local</code>. The free tier is generous.
        </div>
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--color-accent-strong)] text-white text-xs font-medium hover:brightness-110"
        >
          Get a free key
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
