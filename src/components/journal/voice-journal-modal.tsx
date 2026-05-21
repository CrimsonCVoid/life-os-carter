"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  Square,
  Mic,
  MicOff,
  Trash2,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Pill } from "@/components/ui/pill";
import { ToggleRow } from "@/components/ui/toggle";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { uid } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { saveAudio } from "@/lib/audio-store";
import type { Priority } from "@/lib/types";
import type { VoiceJournalPayload } from "@/app/api/voice-journal/route";
import { geminiUserMessage } from "@/lib/gemini-error";

const MAX_RECORD_SEC = 600; // 10 minutes
const WARN_AT_SEC = 570; // 9:30

type Phase =
  | { kind: "permission" }
  | { kind: "denied" }
  | { kind: "unsupported" }
  | { kind: "recording" }
  | { kind: "processing"; blob: Blob }
  | { kind: "upload-error"; blob: Blob; message: string }
  | { kind: "review"; blob: Blob; payload: ReviewState };

type TodoItem = {
  id: string;
  text: string;
  priority: Priority;
  checked: boolean;
};

type ReviewState = {
  transcript: string;
  summary: string;
  mood: string;
  moodScore: number;
  tags: string[];
  todos: TodoItem[];
  saveMood: boolean;
  partial?: boolean;
};

export function VoiceJournalModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  return (
    <AnimatePresence>
      {open && <VoiceJournalModalBody onClose={onClose} onSaved={onSaved} />}
    </AnimatePresence>
  );
}

function VoiceJournalModalBody({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [phase, setPhase] = React.useState<Phase>(() => {
    if (
      typeof window === "undefined" ||
      typeof window.MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return { kind: "unsupported" };
    }
    return { kind: "permission" };
  });

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-[var(--color-bg)]/95 backdrop-blur-md"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <header className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-[var(--color-accent)]" />
            <span className="text-base font-semibold tracking-tight">
              Voice Journal
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 grid place-items-center rounded-full text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:bg-[var(--color-elevated)] transition"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto nice-scroll">
          {phase.kind === "permission" && (
            <PermissionScreen
              onGranted={() => setPhase({ kind: "recording" })}
              onDenied={() => setPhase({ kind: "denied" })}
            />
          )}
          {phase.kind === "denied" && <DeniedScreen onClose={onClose} />}
          {phase.kind === "unsupported" && <UnsupportedScreen onClose={onClose} />}
          {phase.kind === "recording" && (
            <RecordingScreen
              onStopped={(blob) => setPhase({ kind: "processing", blob })}
              onCancel={onClose}
            />
          )}
          {phase.kind === "processing" && (
            <ProcessingScreen
              blob={phase.blob}
              onDone={(payload) =>
                setPhase({
                  kind: "review",
                  blob: phase.blob,
                  payload: payloadToReview(payload),
                })
              }
              onError={(message) =>
                setPhase({ kind: "upload-error", blob: phase.blob, message })
              }
            />
          )}
          {phase.kind === "upload-error" && (
            <UploadErrorScreen
              message={phase.message}
              onRetry={() => setPhase({ kind: "processing", blob: phase.blob })}
              onSaveRaw={async () => {
                await saveAudioOnly(phase.blob);
                onSaved?.();
                onClose();
              }}
              onCancel={onClose}
            />
          )}
          {phase.kind === "review" && (
            <ReviewScreen
              initial={phase.payload}
              blob={phase.blob}
              onSaved={() => {
                onSaved?.();
                onClose();
              }}
              onCancel={onClose}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function payloadToReview(p: VoiceJournalPayload & { partial?: boolean }): ReviewState {
  const autoCheck = useStore.getState().settings.voiceJournal.autoCheckTodos;
  const autoLogMood = useStore.getState().settings.voiceJournal.autoLogMood;
  const today = todayStr();
  const alreadyHasMood = useStore.getState().health[today]?.mood != null;
  return {
    transcript: p.transcript,
    summary: p.summary,
    mood: p.mood,
    moodScore: p.moodScore,
    tags: [...p.tags],
    todos: p.todos.map((t) => ({
      id: uid(),
      text: t.text,
      priority: t.priority,
      checked: autoCheck,
    })),
    saveMood: autoLogMood && !alreadyHasMood,
    partial: p.partial,
  };
}

/* ---------- Permission ---------- */

function PermissionScreen({
  onGranted,
  onDenied,
}: {
  onGranted: () => void;
  onDenied: () => void;
}) {
  const requested = React.useRef(false);
  React.useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Permission granted — release this probe stream; recording screen
        // will request a fresh one.
        stream.getTracks().forEach((t) => t.stop());
        onGranted();
      })
      .catch(() => onDenied());
  }, [onGranted, onDenied]);

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <Mic size={36} className="text-[var(--color-fg-3)] mb-4 animate-pulse" />
      <div className="text-sm text-[var(--color-fg-2)]">
        Requesting microphone permission…
      </div>
    </div>
  );
}

function DeniedScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <MicOff size={36} className="text-[var(--color-danger)] mb-4" />
      <div className="text-base font-semibold mb-2">Microphone blocked</div>
      <div className="text-sm text-[var(--color-fg-2)] max-w-xs">
        Enable mic access for this site in your browser settings, then try again.
        <br />
        <span className="block mt-3 text-xs text-[var(--color-fg-3)]">
          iOS Safari: Settings → Safari → Microphone
          <br />
          Chrome: tap the lock icon in the URL bar → Site settings
        </span>
      </div>
      <Button variant="secondary" className="mt-6" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

function UnsupportedScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <MicOff size={36} className="text-[var(--color-fg-3)] mb-4" />
      <div className="text-base font-semibold mb-2">Not supported here</div>
      <div className="text-sm text-[var(--color-fg-2)] max-w-xs">
        Your browser doesn’t support audio recording. Try Chrome, Safari, or Firefox.
      </div>
      <Button variant="secondary" className="mt-6" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

/* ---------- Recording ---------- */

function RecordingScreen({
  onStopped,
  onCancel,
}: {
  onStopped: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [warned, setWarned] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const startMsRef = React.useRef<number>(0);
  const stoppedRef = React.useRef(false);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // Waveform graph
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;

        startWaveform();

        const rec = new MediaRecorder(stream);
        recorderRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const type = rec.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          cleanup();
          onStopped(blob);
        };
        rec.onerror = () => {
          setError("Recording error. Try again.");
        };
        rec.start();
        startMsRef.current = Date.now();
        haptic("tap");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't start recording.";
        setError(msg);
      }
    })();

    return () => {
      alive = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer for the MM:SS display + auto-stop guard. We only do anything
  // once the recorder has actually started (startMsRef set to Date.now()
  // after rec.start()). Without this guard the first tick happens while
  // getUserMedia is still pending, computes (Date.now() - 0)/1000 ≈ 1.78e9,
  // hits the >= MAX_RECORD_SEC branch, calls stop(), and latches
  // stoppedRef = true — permanently disabling the manual Stop button.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (stoppedRef.current) return;
      if (startMsRef.current === 0) return;
      const sec = Math.floor((Date.now() - startMsRef.current) / 1000);
      setElapsed(sec);
      if (sec >= MAX_RECORD_SEC) {
        stop();
      } else if (!warned && sec >= WARN_AT_SEC) {
        setWarned(true);
        haptic("warn");
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [warned]);

  const cleanup = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const rec = recorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const stop = () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    haptic("tap");
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
  };

  const startWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    const buffer = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(buffer);
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const accent =
        getComputedStyle(canvas).getPropertyValue("--color-accent").trim() ||
        "#8B5CF6";

      const bars = 56;
      const step = Math.floor(buffer.length / bars);
      const barW = (w / bars) * 0.55;
      const gap = (w / bars) * 0.45;

      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          const v = (buffer[i * step + j] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / step);
        const amp = Math.min(1, rms * 2.6);
        const bh = Math.max(2, amp * h * 0.95);
        const x = i * (barW + gap) + gap / 2;
        const y = (h - bh) / 2;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.35 + amp * 0.65;
        roundRect(ctx, x, y, barW, bh, Math.min(2, barW / 2));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <MicOff size={36} className="text-[var(--color-danger)] mb-4" />
        <div className="text-base font-semibold mb-2">Recording failed</div>
        <div className="text-sm text-[var(--color-fg-2)] max-w-xs">{error}</div>
        <Button variant="secondary" className="mt-6" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  const mm = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="h-full flex flex-col items-center justify-between px-6 py-6">
      <div className="w-full flex-1 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="w-full max-w-md h-32"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            "tnum font-semibold tabular-nums",
            warned ? "text-[var(--color-warning)]" : "text-[var(--color-accent)]"
          )}
          style={{ fontSize: 56, lineHeight: 1 }}
        >
          {mm}:{ss}
        </div>
        {warned && (
          <div className="text-xs text-[var(--color-warning)]">
            30 seconds left
          </div>
        )}
      </div>

      <div className="mt-6 mb-2 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={stop}
          aria-label="Stop recording"
          className="h-20 w-20 rounded-full grid place-items-center bg-[var(--color-danger)] text-white shadow-[0_8px_28px_rgba(244,63,94,0.45)] active:scale-95 transition"
        >
          <Square size={26} fill="currentColor" />
        </button>
        <div className="text-[11px] text-[var(--color-fg-3)]">Tap to stop</div>
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- Processing ---------- */

const STATUS_STEPS = [
  "Transcribing…",
  "Finding action items…",
  "Summarizing…",
];

function ProcessingScreen({
  blob,
  onDone,
  onError,
}: {
  blob: Blob;
  onDone: (p: VoiceJournalPayload & { partial?: boolean }) => void;
  onError: (message: string) => void;
}) {
  const [step, setStep] = React.useState(0);
  const fired = React.useRef(false);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % STATUS_STEPS.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        const form = new FormData();
        const ext = guessExt(blob.type);
        form.append("audio", blob, `entry.${ext}`);
        const res = await fetch("/api/voice-journal", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          // Map the route's error taxonomy to friendly copy via the central
          // helper. Never display the raw response body.
          const body = await res.json().catch(() => null);
          const tag = body && typeof body.error === "string" ? body.error : "";
          if (tag === "bad-output" || tag === "bad-request") {
            onError("Couldn't process that recording. Try again.");
            return;
          }
          onError(geminiUserMessage(res.status, tag).userMessage);
          return;
        }
        const payload = (await res.json()) as VoiceJournalPayload & {
          partial?: boolean;
        };
        haptic("success");
        onDone(payload);
      } catch {
        onError("Network error. Check your connection and try again.");
      }
    })();
  }, [blob, onDone, onError]);

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <div className="relative h-20 w-20 mb-6">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-[var(--color-accent)]/30"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-[var(--color-accent)]/60"
          animate={{ scale: [1, 1.1, 1], opacity: [0.7, 0.2, 0.7] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.3,
          }}
        />
        <div className="absolute inset-0 grid place-items-center">
          <Mic size={20} className="text-[var(--color-accent)]" />
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-[var(--color-fg-2)]"
        >
          {STATUS_STEPS[step]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function guessExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  return "webm";
}

/* ---------- Upload error ---------- */

function UploadErrorScreen({
  message,
  onRetry,
  onSaveRaw,
  onCancel,
}: {
  message: string;
  onRetry: () => void;
  onSaveRaw: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center">
      <div className="text-base font-semibold mb-2">Something went wrong</div>
      <div className="text-sm text-[var(--color-fg-2)] max-w-sm">{message}</div>
      <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
        <Button onClick={onRetry}>
          <RefreshCw size={14} />
          Try again
        </Button>
        <Button variant="secondary" onClick={onSaveRaw}>
          <Save size={14} />
          Save audio only
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Discard
        </Button>
      </div>
    </div>
  );
}

async function saveAudioOnly(blob: Blob) {
  const audioId = uid();
  try {
    await saveAudio(audioId, blob);
  } catch {
    // best-effort
  }
  useStore.getState().addJournal({
    date: todayStr(),
    text: "(voice entry — transcription failed)",
    tags: ["voice"],
    source: "voice",
    audioId,
  });
  haptic("success");
}

/* ---------- Review ---------- */

function ReviewScreen({
  initial,
  blob,
  onSaved,
  onCancel,
}: {
  initial: ReviewState;
  blob: Blob;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const addJournal = useStore((s) => s.addJournal);
  const addGoal = useStore((s) => s.addGoal);
  const setHealth = useStore((s) => s.setHealth);
  const saveRecordings = useStore((s) => s.settings.voiceJournal.saveRecordings);

  const [state, setState] = React.useState<ReviewState>(initial);
  const [saving, setSaving] = React.useState(false);
  const [showFullTranscript, setShowFullTranscript] = React.useState(false);
  const [editingTranscript, setEditingTranscript] = React.useState(false);
  const [editingSummary, setEditingSummary] = React.useState(false);
  const [newTag, setNewTag] = React.useState("");

  const wordCount = state.transcript.split(/\s+/).filter(Boolean).length;
  const longTranscript = wordCount > 200;

  const setTodo = (id: string, patch: Partial<TodoItem>) =>
    setState((s) => ({
      ...s,
      todos: s.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  const removeTodo = (id: string) =>
    setState((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) }));

  const addTodo = () =>
    setState((s) => ({
      ...s,
      todos: [
        ...s.todos,
        { id: uid(), text: "", priority: "P2", checked: true },
      ],
    }));

  const addTagFromInput = () => {
    const t = newTag.trim().toLowerCase().replace(/^#/, "");
    if (!t) return;
    setState((s) =>
      s.tags.includes(t) ? s : { ...s, tags: [...s.tags, t] }
    );
    setNewTag("");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let audioId: string | undefined;
      if (saveRecordings) {
        audioId = uid();
        try {
          await saveAudio(audioId, blob);
        } catch {
          audioId = undefined;
        }
      }

      addJournal({
        date: todayStr(),
        text: state.transcript,
        tags: state.tags.length ? state.tags : ["voice"],
        source: "voice",
        summary: state.summary || undefined,
        mood: state.moodScore,
        moodWord: state.mood || undefined,
        audioId,
      });

      for (const t of state.todos) {
        if (!t.checked) continue;
        const text = t.text.trim();
        if (!text) continue;
        addGoal({ text, priority: t.priority });
      }

      if (state.saveMood && state.moodScore) {
        setHealth(todayStr(), { mood: state.moodScore });
      }

      haptic("success");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const collapsed = longTranscript && !showFullTranscript && !editingTranscript;
  const collapsedTranscript = collapsed
    ? truncateWords(state.transcript, 80)
    : state.transcript;

  return (
    <div className="px-5 pt-2 pb-32 max-w-2xl mx-auto space-y-4">
      <div className="text-lg font-semibold tracking-tight">
        Review your entry
      </div>
      {state.partial && (
        <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[color:color-mix(in_srgb,var(--color-warning)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--color-warning)]">
          The model couldn’t structure the response. Transcript saved, but summary
          / mood / todos are empty.
        </div>
      )}

      {/* Transcript */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="label">Transcript</div>
          <button
            type="button"
            onClick={() => setEditingTranscript((v) => !v)}
            className="text-[11px] text-[var(--color-accent)] inline-flex items-center gap-1"
          >
            <Pencil size={11} />
            {editingTranscript ? "Done" : "Edit"}
          </button>
        </div>
        {editingTranscript ? (
          <Textarea
            value={state.transcript}
            onChange={(e) =>
              setState((s) => ({ ...s, transcript: e.target.value }))
            }
            rows={8}
          />
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-fg)]">
            {collapsedTranscript}
            {collapsed && (
              <button
                type="button"
                onClick={() => setShowFullTranscript(true)}
                className="ml-2 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[10px] align-middle"
              >
                Show more
                <ChevronDown size={10} />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Summary */}
      <section
        className="card p-4"
        style={{
          borderLeft: "3px solid var(--color-accent)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="label">Summary</div>
          <button
            type="button"
            onClick={() => setEditingSummary((v) => !v)}
            className="text-[11px] text-[var(--color-accent)] inline-flex items-center gap-1"
          >
            <Pencil size={11} />
            {editingSummary ? "Done" : "Edit"}
          </button>
        </div>
        {editingSummary ? (
          <Textarea
            value={state.summary}
            onChange={(e) =>
              setState((s) => ({ ...s, summary: e.target.value }))
            }
            rows={3}
          />
        ) : (
          <div className="text-sm text-[var(--color-fg)] whitespace-pre-wrap">
            {state.summary || (
              <span className="text-[var(--color-fg-3)] italic">
                No summary — tap edit to add one.
              </span>
            )}
          </div>
        )}
      </section>

      {/* Mood */}
      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="label">Mood</div>
          {state.mood && (
            <Pill tone="accent" className="h-6 px-2 text-[10px] capitalize">
              {state.mood}
            </Pill>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--color-fg-3)]">
              Score: {state.moodScore}/10
            </span>
          </div>
          <Slider
            value={state.moodScore}
            min={1}
            max={10}
            step={1}
            onChange={(v) => setState((s) => ({ ...s, moodScore: v }))}
          />
        </div>
        <ToggleRow
          label="Save to today’s mood log"
          checked={state.saveMood}
          onChange={(v) => setState((s) => ({ ...s, saveMood: v }))}
        />
      </section>

      {/* Todos */}
      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="label">To-dos</div>
          {state.todos.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  todos: s.todos.map((t) => ({ ...t, checked: false })),
                }))
              }
              className="text-[11px] text-[var(--color-fg-3)] hover:text-[var(--color-fg)]"
            >
              Skip all
            </button>
          )}
        </div>
        {state.todos.length === 0 ? (
          <div className="text-xs text-[var(--color-fg-3)] italic">
            No to-dos extracted.
          </div>
        ) : (
          <ul className="space-y-2">
            {state.todos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                onChange={(patch) => setTodo(t.id, patch)}
                onRemove={() => removeTodo(t.id)}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addTodo}
          className="mt-3 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
        >
          <Plus size={12} />
          Add another
        </button>
      </section>

      {/* Tags */}
      <section className="card p-4">
        <div className="label mb-2">Tags</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {state.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                setState((s) => ({ ...s, tags: s.tags.filter((x) => x !== t) }))
              }
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[11px] border border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
              title="Remove"
            >
              #{t}
              <X size={10} />
            </button>
          ))}
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTagFromInput();
              }
            }}
            onBlur={addTagFromInput}
            placeholder="add tag"
            className="h-7 px-2 rounded-full bg-transparent text-[11px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-3)] outline-none border border-dashed border-[var(--color-stroke)] focus:border-[var(--color-accent)] min-w-20 w-24"
          />
        </div>
      </section>

      {/* Bottom action bar */}
      <div
        className="fixed left-0 right-0 bottom-0 z-10 border-t border-[var(--color-stroke)] bg-[var(--color-bg)]/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !state.transcript.trim()}
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  onChange,
  onRemove,
}: {
  todo: TodoItem;
  onChange: (patch: Partial<TodoItem>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = React.useState(!todo.text);
  const cyclePriority = () => {
    const next: Priority =
      todo.priority === "P1" ? "P2" : todo.priority === "P2" ? "P3" : "P1";
    onChange({ priority: next });
  };
  const priTone =
    todo.priority === "P1"
      ? "danger"
      : todo.priority === "P2"
      ? "warn"
      : "neutral";

  return (
    <li className="flex items-start gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={todo.checked}
        onClick={() => onChange({ checked: !todo.checked })}
        className={cn(
          "shrink-0 mt-0.5 h-5 w-5 rounded-md grid place-items-center border transition",
          todo.checked
            ? "bg-[var(--color-accent-strong)] border-[var(--color-accent-strong)] text-white"
            : "border-[var(--color-stroke-strong)] text-transparent"
        )}
      >
        ✓
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={todo.text}
            onChange={(e) => onChange({ text: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            autoFocus
            placeholder="Task"
            className="h-9 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "block w-full text-left text-sm py-1",
              todo.checked
                ? "text-[var(--color-fg)]"
                : "text-[var(--color-fg-2)] line-through opacity-60"
            )}
          >
            {todo.text || (
              <span className="italic text-[var(--color-fg-3)]">
                (tap to add text)
              </span>
            )}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={cyclePriority}
        title="Tap to change priority"
        className="shrink-0"
      >
        <Pill tone={priTone} className="h-6 px-2 text-[10px]">
          {todo.priority}
        </Pill>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="shrink-0 h-11 w-11 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function truncateWords(s: string, n: number): string {
  const words = s.split(/\s+/);
  if (words.length <= n) return s;
  return words.slice(0, n).join(" ") + "…";
}
