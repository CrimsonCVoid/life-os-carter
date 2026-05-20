"use client";

import * as React from "react";
import { CalendarRange, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import { buildWeeklyContext, weekBounds } from "@/lib/insights";
import { format, fromDateStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import type { WeeklyReviewData } from "@/lib/types";

type Section = "wins" | "struggles" | "trends" | "nextWeekPriorities";

const SECTION_LABEL: Record<Section, string> = {
  wins: "Wins",
  struggles: "Struggles",
  trends: "Trends",
  nextWeekPriorities: "Priorities for next week",
};

const SECTION_PLACEHOLDER: Record<Section, string> = {
  wins: "Add a win",
  struggles: "Add a struggle",
  trends: "Add a trend",
  nextWeekPriorities: "Add a priority",
};

export function WeeklyReviewModal({
  open,
  onClose,
  review,
}: {
  open: boolean;
  onClose: () => void;
  review: WeeklyReviewData;
}) {
  const updateWeeklyReview = useStore((s) => s.updateWeeklyReview);
  const dismissWeeklyReview = useStore((s) => s.dismissWeeklyReview);
  const saveWeeklyReview = useStore((s) => s.saveWeeklyReview);
  const addJournal = useStore((s) => s.addJournal);

  const [summary, setSummary] = React.useState(review.summary);
  const [wins, setWins] = React.useState<string[]>(review.wins);
  const [struggles, setStruggles] = React.useState<string[]>(
    review.struggles
  );
  const [trends, setTrends] = React.useState<string[]>(review.trends);
  const [priorities, setPriorities] = React.useState<string[]>(
    review.nextWeekPriorities
  );
  const [regenerating, setRegenerating] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSummary(review.summary);
      setWins(review.wins);
      setStruggles(review.struggles);
      setTrends(review.trends);
      setPriorities(review.nextWeekPriorities);
    }
  }, [open, review]);

  const range = `${format(
    fromDateStr(review.weekStart),
    "MMM d"
  )} – ${format(fromDateStr(review.weekEnd), "MMM d, yyyy")}`;

  const persist = () => {
    updateWeeklyReview(review.weekStart, {
      summary: summary.trim(),
      wins,
      struggles,
      trends,
      nextWeekPriorities: priorities,
    });
  };

  const saveToJournal = () => {
    persist();
    const body = [
      `**Weekly Review · ${range}**`,
      "",
      summary.trim(),
      "",
      wins.length > 0 ? "**Wins**" : "",
      ...wins.map((w) => `- ${w}`),
      wins.length > 0 ? "" : "",
      struggles.length > 0 ? "**Struggles**" : "",
      ...struggles.map((w) => `- ${w}`),
      struggles.length > 0 ? "" : "",
      trends.length > 0 ? "**Trends**" : "",
      ...trends.map((w) => `- ${w}`),
      trends.length > 0 ? "" : "",
      priorities.length > 0 ? "**Next week**" : "",
      ...priorities.map((w) => `- ${w}`),
    ]
      .filter(Boolean)
      .join("\n");
    addJournal({
      date: review.weekEnd,
      text: body,
      tags: ["weekly-review"],
      source: "weekly-review",
    });
    saveWeeklyReview({
      ...review,
      summary: summary.trim(),
      wins,
      struggles,
      trends,
      nextWeekPriorities: priorities,
      savedToJournal: true,
    });
    haptic("success");
    onClose();
  };

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const bounds = weekBounds(review.weekStart);
      const context = buildWeeklyContext(bounds.start, bounds.end);
      const res = await fetch("/api/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data.summary || "");
      setWins(data.wins || []);
      setStruggles(data.struggles || []);
      setTrends(data.trends || []);
      setPriorities(data.nextWeekPriorities || []);
      haptic("tap");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        persist();
        onClose();
      }}
      title={
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange
            size={14}
            className="text-[var(--color-accent)]"
          />
          Weekly review
        </span>
      }
      description={range}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              dismissWeeklyReview(review.weekStart);
              haptic("soft");
              onClose();
            }}
          >
            <X size={12} />
            Dismiss
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={regenerate}
              disabled={regenerating}
            >
              <RefreshCw size={12} />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
            <Button onClick={saveToJournal}>
              <Save size={12} />
              Save to journal
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <section>
          <div className="label mb-2">Summary</div>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="One sentence capturing the week"
          />
        </section>

        <EditableList
          section="wins"
          items={wins}
          setItems={setWins}
        />
        <EditableList
          section="struggles"
          items={struggles}
          setItems={setStruggles}
        />
        <EditableList
          section="trends"
          items={trends}
          setItems={setTrends}
        />
        <EditableList
          section="nextWeekPriorities"
          items={priorities}
          setItems={setPriorities}
        />

        {review.savedToJournal && (
          <div className="text-[11px] text-[var(--color-success)] italic">
            Saved to journal on {format(fromDateStr(review.weekEnd), "MMM d")}.
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditableList({
  section,
  items,
  setItems,
}: {
  section: Section;
  items: string[];
  setItems: (v: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  return (
    <section>
      <div className="label mb-2">{SECTION_LABEL[section]}</div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--color-elevated)]"
          >
            <span className="text-[var(--color-fg-3)] text-xs leading-relaxed mt-1">
              •
            </span>
            <input
              value={it}
              onChange={(e) =>
                setItems(items.map((x, j) => (j === i ? e.target.value : x)))
              }
              className="flex-1 bg-transparent text-sm outline-none no-zoom"
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              aria-label="Remove"
              className="h-11 w-11 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-danger)] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v) return;
          setItems([...items, v]);
          setDraft("");
        }}
        className="mt-2 flex items-center gap-2"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={SECTION_PLACEHOLDER[section]}
          className="h-9 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}
