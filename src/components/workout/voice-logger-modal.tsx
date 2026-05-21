"use client";

import * as React from "react";
import { Mic, MicOff, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import type { ParsedSet, VoiceWorkoutResponse } from "@/app/api/voice-workout/route";

type Phase = "idle" | "recording" | "processing" | "preview" | "error";

type CommitSet = {
  exerciseName: string;
  matchedExisting: boolean;
  weight: number;
  reps: number;
  rpe?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  knownExercises: string[];
  onCommitSet: (s: CommitSet) => void;
};

const LONG_PRESS_MS = 280;

function pickRecorderMime(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Couldn't read audio."));
        return;
      }
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.readAsDataURL(blob);
  });
}

function formatTime(sec: number): string {
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (sec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function VoiceLoggerModal({
  open,
  onClose,
  knownExercises,
  onCommitSet,
}: Props) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [parsed, setParsed] = React.useState<ParsedSet[]>([]);
  const [included, setIncluded] = React.useState<boolean[]>([]);
  const [errorMsg, setErrorMsg] = React.useState<string>("");

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const mimeRef = React.useRef<string>("audio/webm");
  const startMsRef = React.useRef(0);
  const stoppedRef = React.useRef(false);
  const phaseRef = React.useRef<Phase>("idle");

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const knownExercisesKey = React.useMemo(
    () => knownExercises.join("|"),
    [knownExercises]
  );

  const cleanupRecorder = React.useCallback(() => {
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
    chunksRef.current = [];
  }, []);

  const resetAll = React.useCallback(() => {
    cleanupRecorder();
    stoppedRef.current = false;
    startMsRef.current = 0;
    setElapsed(0);
    setParsed([]);
    setIncluded([]);
    setErrorMsg("");
    setPhase("idle");
  }, [cleanupRecorder]);

  React.useEffect(() => {
    if (!open) {
      cleanupRecorder();
      stoppedRef.current = false;
      startMsRef.current = 0;
      setElapsed(0);
      setParsed([]);
      setIncluded([]);
      setErrorMsg("");
      setPhase("idle");
    }
  }, [open, cleanupRecorder]);

  React.useEffect(() => {
    return () => {
      cleanupRecorder();
    };
  }, [cleanupRecorder]);

  React.useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => {
      if (stoppedRef.current) return;
      if (startMsRef.current === 0) return;
      setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const sendToServer = React.useCallback(
    async (blob: Blob, mimeType: string) => {
      try {
        const audioBase64 = await blobToBase64(blob);
        const res = await fetch("/api/voice-workout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            audioBase64,
            mimeType,
            knownExercises,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | VoiceWorkoutResponse
          | null;
        if (!json) {
          setErrorMsg(`Server returned ${res.status}.`);
          setPhase("error");
          return;
        }
        if (!json.ok) {
          setErrorMsg(json.error || "Couldn't parse that.");
          setPhase("error");
          return;
        }
        if (json.parsed.length === 0) {
          setErrorMsg("Didn't catch any sets. Try again.");
          setPhase("error");
          return;
        }
        setParsed(json.parsed);
        setIncluded(json.parsed.map(() => true));
        setPhase("preview");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error.";
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [knownExercises]
  );

  const startRecording = React.useCallback(async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
    setErrorMsg("");
    setElapsed(0);
    chunksRef.current = [];
    stoppedRef.current = false;
    startMsRef.current = 0;

    if (
      typeof window === "undefined" ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setErrorMsg("Recording isn't supported here.");
      setPhase("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickRecorderMime();
      mimeRef.current = mime;
      const rec = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined
      );
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        setErrorMsg("Recording error.");
        cleanupRecorder();
        setPhase("error");
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const mimeForServer = type.split(";")[0].trim();
        cleanupRecorder();
        if (blob.size === 0) {
          setErrorMsg("No audio captured.");
          setPhase("error");
          return;
        }
        setPhase("processing");
        void sendToServer(blob, mimeForServer);
      };

      rec.start();
      startMsRef.current = Date.now();
      setPhase("recording");
      haptic("tap");
    } catch (err) {
      cleanupRecorder();
      const msg = err instanceof Error ? err.message : "Couldn't start mic.";
      setErrorMsg(msg);
      setPhase("error");
    }
  }, [cleanupRecorder, sendToServer]);

  const stopRecording = React.useCallback(() => {
    if (phaseRef.current !== "recording") return;
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    haptic("soft");
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const longPressTimer = React.useRef<number | null>(null);
  const longPressFired = React.useRef(false);

  const onMicPointerDown = () => {
    if (phase !== "idle" && phase !== "error") return;
    longPressFired.current = false;
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
    }
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      void startRecording();
    }, LONG_PRESS_MS);
  };

  const onMicPointerUp = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onMicPointerCancel = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressFired.current = false;
  };

  const onMicClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (phase === "recording") {
      stopRecording();
      return;
    }
    if (phase === "idle" || phase === "error") {
      void startRecording();
    }
  };

  const toggleIncluded = (i: number) =>
    setIncluded((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const commit = () => {
    const items = parsed.filter((_, i) => included[i]);
    if (items.length === 0) return;
    for (const s of items) {
      onCommitSet({
        exerciseName: s.exerciseName,
        matchedExisting: s.matchedExisting,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
      });
    }
    haptic("success");
    resetAll();
    onClose();
  };

  const includedCount = included.filter(Boolean).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Voice log"
      description={
        phase === "idle"
          ? "Say something like “10 reps at 185 for bench press”"
          : undefined
      }
    >
      {phase === "idle" && (
        <IdleView
          onPointerDown={onMicPointerDown}
          onPointerUp={onMicPointerUp}
          onPointerCancel={onMicPointerCancel}
          onClick={onMicClick}
        />
      )}

      {phase === "recording" && (
        <RecordingView
          elapsed={elapsed}
          onClick={onMicClick}
        />
      )}

      {phase === "processing" && <ProcessingView />}

      {phase === "preview" && (
        <PreviewView
          parsed={parsed}
          included={included}
          onToggle={toggleIncluded}
          onReRecord={() => {
            resetAll();
            void startRecording();
          }}
          onConfirm={commit}
          includedCount={includedCount}
        />
      )}

      {phase === "error" && (
        <ErrorView
          message={errorMsg}
          onRetry={() => {
            setErrorMsg("");
            setPhase("idle");
          }}
        />
      )}
      {/* knownExercises memo dep — keeps lint happy without changing behavior */}
      <span hidden data-known={knownExercisesKey} />
    </Modal>
  );
}

function IdleView({
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onClick,
}: {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <button
        type="button"
        aria-label="Start recording"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onClick={onClick}
        className={cn(
          "h-20 w-20 rounded-full grid place-items-center",
          "bg-[var(--color-accent-strong)] text-white",
          "shadow-[var(--shadow-glow)]",
          "active:scale-[0.94] transition-transform duration-[80ms]"
        )}
      >
        <Mic size={28} />
      </button>
      <div className="mt-4 text-[13px] text-[var(--color-fg-3)]">
        Tap to start
      </div>
    </div>
  );
}

function RecordingView({
  elapsed,
  onClick,
}: {
  elapsed: number;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <button
        type="button"
        aria-label="Stop recording"
        onClick={onClick}
        className={cn(
          "h-20 w-20 rounded-full grid place-items-center",
          "bg-[var(--color-danger)] text-white",
          "animate-pulse",
          "active:scale-[0.94] transition-transform duration-[80ms]"
        )}
      >
        <Mic size={28} />
      </button>
      <div
        className="mt-4 tnum tabular-nums font-semibold text-[var(--color-danger)]"
        style={{ fontSize: 32, lineHeight: 1 }}
      >
        {formatTime(elapsed)}
      </div>
      <div className="mt-2 text-[13px] text-[var(--color-fg-2)]">
        Recording... tap to stop
      </div>
    </div>
  );
}

function ProcessingView() {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <Loader2
        size={28}
        className="text-[var(--color-accent)] animate-spin"
      />
      <div className="mt-4 text-[13px] text-[var(--color-fg-2)]">
        Listening...
      </div>
    </div>
  );
}

function PreviewView({
  parsed,
  included,
  onToggle,
  onReRecord,
  onConfirm,
  includedCount,
}: {
  parsed: ParsedSet[];
  included: boolean[];
  onToggle: (i: number) => void;
  onReRecord: () => void;
  onConfirm: () => void;
  includedCount: number;
}) {
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {parsed.map((s, i) => {
          const checked = included[i] ?? false;
          return (
            <li
              key={i}
              className={cn(
                "rounded-[var(--radius-control)] border p-3",
                "border-[var(--color-stroke)] bg-[var(--color-elevated)]",
                !checked && "opacity-50"
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onToggle(i)}
                  className={cn(
                    "shrink-0 mt-0.5 h-5 w-5 rounded-md grid place-items-center border transition",
                    checked
                      ? "bg-[var(--color-accent-strong)] border-[var(--color-accent-strong)] text-white"
                      : "border-[var(--color-stroke-strong)] text-transparent"
                  )}
                >
                  <CheckGlyph />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold tracking-tight tnum tabular-nums">
                      {s.exerciseName}
                      <span className="text-[var(--color-fg-3)] mx-1.5">
                        ·
                      </span>
                      {s.weight === 0 ? "BW" : `${s.weight} lb`}
                      <span className="text-[var(--color-fg-3)] mx-1">
                        ×
                      </span>
                      {s.reps}
                      {s.rpe != null && (
                        <span className="ml-2 text-[12px] text-[var(--color-fg-2)] font-medium">
                          RPE {s.rpe}
                        </span>
                      )}
                    </span>
                    {!s.matchedExisting && (
                      <span
                        className={cn(
                          "inline-flex items-center h-5 px-1.5 rounded-full",
                          "text-[10px] font-semibold tracking-wide",
                          "bg-[color:color-mix(in_srgb,var(--color-warning)_18%,transparent)]",
                          "text-[var(--color-warning)]"
                        )}
                      >
                        NEW
                      </span>
                    )}
                  </div>
                  {s.utterance && (
                    <div className="mt-1 text-[12px] italic text-[var(--color-fg-3)] leading-snug">
                      &ldquo;{s.utterance}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onReRecord}>
          <RefreshCw size={14} />
          Re-record
        </Button>
        <Button onClick={onConfirm} disabled={includedCount === 0}>
          Add {includedCount} {includedCount === 1 ? "set" : "sets"}
        </Button>
      </div>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertTriangle size={28} className="text-[var(--color-danger)]" />
      <div className="mt-3 text-[14px] font-semibold">Couldn&rsquo;t log that</div>
      <div className="mt-1 text-[12px] text-[var(--color-fg-2)] max-w-xs">
        {message || "Something went wrong."}
      </div>
      <div className="mt-5">
        <Button onClick={onRetry}>
          <MicOff size={14} />
          Try again
        </Button>
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 6.5l2.5 2.5 4.5-5" />
    </svg>
  );
}
