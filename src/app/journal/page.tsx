"use client";

import * as React from "react";
import { Plus, Search, Sparkles, Trash2 } from "lucide-react";
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
import { useStore } from "@/store";
import { useJournal } from "@/store/selectors";
import { JournalEntry } from "@/lib/types";
import { format, fromDateStr, formatRelative, todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";

export default function JournalPage() {
  const entries = useJournal();
  const removeJournal = useStore((s) => s.removeJournal);
  const [query, setQuery] = React.useState("");
  const [moodMin, setMoodMin] = React.useState(1);
  const [moodMax, setMoodMax] = React.useState(10);
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);

  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [entries]);

  const filtered = entries.filter((e) => {
    if (activeTag && !e.tags.includes(activeTag)) return false;
    if (
      e.mood != null &&
      (e.mood < moodMin || e.mood > moodMax)
    )
      return false;
    if (query.trim() && !e.text.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

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
        <Button onClick={() => setNewOpen(true)} size="default">
          <Plus size={14} />
          New
        </Button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={
              "h-7 px-2.5 rounded-full text-xs border " +
              (activeTag == null
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                : "border-[var(--color-stroke)] text-[var(--color-fg-2)]")
            }
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag(t)}
              className={
                "h-7 px-2.5 rounded-full text-xs border " +
                (activeTag === t
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                  : "border-[var(--color-stroke)] text-[var(--color-fg-2)]")
              }
            >
              #{t}
            </button>
          ))}
        </div>
      )}

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
  return (
    <Card className="group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {entry.source === "reflection" && (
            <Pill tone="accent" className="h-6 px-2">
              <Sparkles size={10} />
              Reflection
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
            className="h-7 w-7 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] opacity-0 group-hover:opacity-100 transition"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <Markdown text={entry.text} />
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {entry.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] text-[var(--color-fg-3)]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}
    </Card>
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
  const [tags, setTags] = React.useState("");
  const [includeStats, setIncludeStats] = React.useState<"yes" | "no">("yes");

  React.useEffect(() => {
    if (open) {
      setText("");
      setMood(7);
      setEnergy(6);
      setTags("");
    }
  }, [open]);

  const save = () => {
    if (!text.trim()) return;
    addJournal({
      date: todayStr(),
      text: text.trim(),
      mood: includeStats === "yes" ? mood : undefined,
      energy: includeStats === "yes" ? energy : undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean),
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
        <div>
          <div className="label mb-2">Tags (comma separated)</div>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="work, family, lifting"
          />
        </div>
      </div>
    </Modal>
  );
}
