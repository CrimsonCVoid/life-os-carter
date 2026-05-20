"use client";

import * as React from "react";
import {
  CalendarRange,
  ChevronDown,
  Mic,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Screen } from "@/components/screen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ui/pill";
import { Slider } from "@/components/ui/slider";
import { Segmented } from "@/components/ui/segmented";
import { Markdown } from "@/components/journal/markdown";
import { VoiceJournalModal } from "@/components/journal/voice-journal-modal";
import { useStore } from "@/store";
import { useJournal } from "@/store/selectors";
import { JournalEntry } from "@/lib/types";
import { format, fromDateStr, formatRelative, todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { getAudio } from "@/lib/audio-store";
import { cn } from "@/lib/utils";

export default function JournalPage() {
  const entries = useJournal();
  const removeJournal = useStore((s) => s.removeJournal);
  const [query, setQuery] = React.useState("");
  const [moodMin] = React.useState(1);
  const [moodMax] = React.useState(10);
  const [sourceFilter, setSourceFilter] = React.useState<
    "all" | "manual" | "voice" | "reflection" | "overseer" | "weekly-review"
  >("all");
  const [newOpen, setNewOpen] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const [voiceSupported, setVoiceSupported] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      typeof window.MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    setVoiceSupported(ok);
  }, []);

  const filtered = entries.filter((e) => {
    if (
      e.mood != null &&
      (e.mood < moodMin || e.mood > moodMax)
    )
      return false;
    if (sourceFilter !== "all") {
      const src = e.source ?? "manual";
      if (src !== sourceFilter) return false;
    }
    const q = query.trim().toLowerCase();
    if (q) {
      const haystack = [e.text, e.summary ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sourceCounts = React.useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of entries) {
      const src = e.source ?? "manual";
      acc[src] = (acc[src] ?? 0) + 1;
    }
    return acc;
  }, [entries]);

  const FILTER_OPTIONS: Array<{
    value: typeof sourceFilter;
    label: string;
  }> = [
    { value: "all", label: `All` },
    { value: "manual", label: `Written` },
    { value: "voice", label: `Voice` },
    { value: "reflection", label: `Reflection` },
    { value: "weekly-review", label: `Reviews` },
  ];

  return (
    <Screen title="Journal" subtitle="What you noticed">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-3)]"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries"
            className="pl-9"
          />
        </div>
        {voiceSupported && (
          <Button
            onClick={() => {
              haptic("tap");
              setVoiceOpen(true);
            }}
            size="default"
            title="Voice entry"
            aria-label="Voice entry"
          >
            <Mic size={14} />
            Voice
          </Button>
        )}
        <Button
          onClick={() => setNewOpen(true)}
          size="default"
          variant={voiceSupported ? "secondary" : "primary"}
          title={
            voiceSupported
              ? "New entry"
              : "Voice not supported on this browser — text only"
          }
        >
          <Plus size={14} />
          New
        </Button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto nice-scroll -mx-1 px-1">
        {FILTER_OPTIONS.map((opt) => {
          const active = sourceFilter === opt.value;
          const count =
            opt.value === "all" ? entries.length : sourceCounts[opt.value] ?? 0;
          if (opt.value !== "all" && count === 0) return null;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSourceFilter(opt.value)}
              className={cn(
                "h-7 px-3 inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium shrink-0 transition",
                active
                  ? "bg-[var(--color-accent-strong)] text-white"
                  : "bg-[var(--color-elevated)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
              )}
            >
              {opt.label}
              <span
                className={cn(
                  "tnum",
                  active ? "opacity-80" : "opacity-50"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-sm text-[var(--color-fg-2)]">
            {entries.length === 0
              ? "No entries yet"
              : "Nothing matches your filters."}
          </div>
          {entries.length === 0 && (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="mt-2 text-xs text-[var(--color-accent)]"
            >
              Write your first →
            </button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              onDelete={() => {
                removeJournal(e.id);
                haptic("warn");
              }}
            />
          ))}
        </div>
      )}

      <NewEntryModal open={newOpen} onClose={() => setNewOpen(false)} />
      <VoiceJournalModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSaved={() => haptic("success")}
      />
    </Screen>
  );
}

function EntryCard({
  entry,
  onDelete,
}: {
  entry: JournalEntry;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const isVoice = entry.source === "voice";
  const wordCount = entry.text.split(/\s+/).filter(Boolean).length;
  const longText = wordCount > 80;
  const showTranscriptCollapsed = isVoice && longText && !expanded;

  return (
    <Card className="group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {isVoice && (
            <Pill tone="accent" className="h-6 px-2">
              <Mic size={10} />
              Voice
            </Pill>
          )}
          {entry.source === "reflection" && (
            <Pill tone="accent" className="h-6 px-2">
              <Sparkles size={10} />
              Reflection
            </Pill>
          )}
          {entry.source === "weekly-review" && (
            <Pill tone="accent" className="h-6 px-2">
              <CalendarRange size={10} />
              Weekly review
            </Pill>
          )}
          <div className="text-sm font-medium">
            {format(fromDateStr(entry.date), "MMM d, yyyy")}
          </div>
          <div className="text-xs text-[var(--color-fg-3)]">
            {formatRelative(entry.date)}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {entry.moodWord && (
            <Pill tone="neutral" className="h-6 px-2 text-[10px] capitalize">
              {entry.moodWord}
            </Pill>
          )}
          {entry.mood != null && (
            <Pill tone="neutral" className="h-6 px-2 text-[10px]">
              mood {entry.mood}
            </Pill>
          )}
          {entry.energy != null && (
            <Pill tone="neutral" className="h-6 px-2 text-[10px]">
              energy {entry.energy}
            </Pill>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete entry"
            className="h-11 w-11 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isVoice && entry.summary ? (
        <>
          <div className="text-sm text-[var(--color-fg)] mb-2 leading-relaxed">
            {entry.summary}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] mb-2"
          >
            <ChevronDown
              size={12}
              className={cn("transition-transform", expanded ? "rotate-180" : "")}
            />
            {expanded ? "Hide transcript" : "Show transcript"}
          </button>
          {expanded && (
            <div className="text-sm text-[var(--color-fg-2)] whitespace-pre-wrap leading-relaxed border-l-2 border-[var(--color-stroke)] pl-3 mt-1">
              {entry.text}
            </div>
          )}
        </>
      ) : isVoice ? (
        <>
          <div className="text-sm text-[var(--color-fg)] whitespace-pre-wrap leading-relaxed">
            {showTranscriptCollapsed
              ? entry.text.split(/\s+/).slice(0, 80).join(" ") + "…"
              : entry.text}
          </div>
          {longText && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)]"
            >
              <ChevronDown
                size={12}
                className={cn(
                  "transition-transform",
                  expanded ? "rotate-180" : ""
                )}
              />
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </>
      ) : (
        <Markdown text={entry.text} />
      )}

      {isVoice && entry.audioId && <VoicePlayback audioId={entry.audioId} />}
    </Card>
  );
}

function VoicePlayback({ audioId }: { audioId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const load = async () => {
    if (url || loading) return;
    setLoading(true);
    try {
      const blob = await getAudio(audioId);
      if (!blob) {
        setMissing(true);
        return;
      }
      setUrl(URL.createObjectURL(blob));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (missing) {
    return (
      <div className="mt-3 text-[11px] text-[var(--color-fg-3)] italic">
        Audio not found on this device.
      </div>
    );
  }

  if (!url) {
    return (
      <button
        type="button"
        onClick={load}
        className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
      >
        <Play size={12} />
        {loading ? "Loading…" : "Play audio"}
      </button>
    );
  }

  return (
    <audio
      src={url}
      controls
      className="mt-3 w-full h-9"
      preload="metadata"
    />
  );
}

function NewEntryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addJournal = useStore((s) => s.addJournal);
  const [text, setText] = React.useState("");
  const [mood, setMood] = React.useState(7);
  const [energy, setEnergy] = React.useState(6);
  const [includeStats, setIncludeStats] = React.useState<"yes" | "no">("yes");

  React.useEffect(() => {
    if (open) {
      setText("");
      setMood(7);
      setEnergy(6);
    }
  }, [open]);

  const save = () => {
    if (!text.trim()) return;
    addJournal({
      date: todayStr(),
      text: text.trim(),
      mood: includeStats === "yes" ? mood : undefined,
      energy: includeStats === "yes" ? energy : undefined,
      tags: [],
      source: "manual",
    });
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New entry"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!text.trim()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="What happened today? Markdown supported — **bold**, *italic*, - lists"
        />
        <div>
          <div className="label mb-2">Include vitals?</div>
          <Segmented<"yes" | "no">
            value={includeStats}
            onChange={setIncludeStats}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "Skip" },
            ]}
            size="sm"
          />
        </div>
        {includeStats === "yes" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label mb-2">Mood {mood}/10</div>
              <Slider value={mood} min={1} max={10} step={1} onChange={setMood} />
            </div>
            <div>
              <div className="label mb-2">Energy {energy}/10</div>
              <Slider
                value={energy}
                min={1}
                max={10}
                step={1}
                onChange={setEnergy}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
