"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Goal, Priority } from "@/lib/types";
import { useStore } from "@/store";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import {
  RecurringGoalEditModal,
  type RecurringGoalDraft,
} from "./recurring-goal-edit-modal";

const EMOJI_SET = [
  "💪",
  "🧠",
  "📚",
  "🏃",
  "🧘",
  "💼",
  "✍️",
  "🍳",
  "🚿",
  "☕",
  "💧",
  "🌱",
  "✅",
  "⚡",
];

type Props = {
  goal: Goal | null;
  onClose: () => void;
  onSave: (patch: Partial<Goal>) => void;
  onDelete: () => void;
};

export function GoalEditModal({ goal, onClose, onSave, onDelete }: Props) {
  const open = !!goal;
  const addRecurringGoal = useStore((s) => s.addRecurringGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const recurringGenAdd = useStore((s) => s.skipRecurringGeneration);
  void recurringGenAdd;
  // we hand-write the generation entry below to set status="generated"
  const setGeneration = (
    recurringGoalId: string,
    date: string,
    generatedGoalId: string
  ) =>
    useStore.setState((s) => ({
      recurringGenerations: [
        ...s.recurringGenerations,
        { recurringGoalId, date, generatedGoalId, status: "generated" },
      ],
    }));

  const [recurringOpen, setRecurringOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("P2");
  const [emoji, setEmoji] = React.useState<string | undefined>();
  const [category, setCategory] = React.useState("");
  const [time, setTime] = React.useState("");

  React.useEffect(() => {
    if (!goal) return;
    setText(goal.text);
    setPriority(goal.priority);
    setEmoji(goal.emoji);
    setCategory(goal.category ?? "");
    setTime(
      goal.timeEstimateMin != null ? String(goal.timeEstimateMin) : ""
    );
  }, [goal]);

  const save = () => {
    onSave({
      text: text.trim() || goal?.text || "",
      priority,
      emoji: emoji ?? undefined,
      category: category.trim() || undefined,
      timeEstimateMin: time ? parseInt(time, 10) || undefined : undefined,
    });
  };

  const initialRecurring: Partial<RecurringGoalDraft> | undefined = goal
    ? {
        text,
        emoji,
        priority,
        category: category.trim() || undefined,
        timeEstimateMin: time ? parseInt(time, 10) || undefined : undefined,
        pattern: "daily",
        startDate: todayStr(),
      }
    : undefined;

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit goal"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Text</div>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        <div>
          <div className="label mb-2">Priority</div>
          <Segmented<Priority>
            value={priority}
            onChange={setPriority}
            options={[
              {
                value: "P1",
                label: (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--color-p1)" }}
                    />
                    P1
                  </span>
                ),
              },
              {
                value: "P2",
                label: (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--color-p2)" }}
                    />
                    P2
                  </span>
                ),
              },
              {
                value: "P3",
                label: (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--color-p3)" }}
                    />
                    P3
                  </span>
                ),
              },
            ]}
          />
        </div>

        <div>
          <div className="label mb-2">Emoji</div>
          <div className="grid grid-cols-7 gap-1.5">
            <button
              type="button"
              onClick={() => setEmoji(undefined)}
              className={
                "h-10 rounded-lg border text-xs " +
                (emoji == null
                  ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                  : "border-[var(--color-stroke)] text-[var(--color-fg-2)]")
              }
            >
              None
            </button>
            {EMOJI_SET.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={
                  "h-10 rounded-lg border text-xl " +
                  (emoji === e
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-stroke)] hover:border-[var(--color-stroke-strong)]")
                }
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-2">Category</div>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Work, Health…"
            />
          </div>
          <div>
            <div className="label mb-2">Time (min)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="30"
            />
          </div>
        </div>

        {goal && !goal.recurringGoalId && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setRecurringOpen(true)}
          >
            <Repeat size={14} />
            Make recurring
          </Button>
        )}
        {goal?.recurringGoalId && (
          <div className="text-[11px] text-[var(--color-fg-3)] inline-flex items-center gap-1">
            <Repeat size={11} />
            From a recurring template — edit the recurrence from Manage.
          </div>
        )}

      </div>

      <RecurringGoalEditModal
        open={recurringOpen}
        initial={initialRecurring}
        onClose={() => setRecurringOpen(false)}
        onSave={(draft) => {
          if (!goal) return;
          const rgId = addRecurringGoal(draft);
          // Link the current Goal so today's goal isn't duplicated by
          // the next generation pass.
          updateGoal(goal.id, { recurringGoalId: rgId });
          setGeneration(rgId, goal.date, goal.id);
          setRecurringOpen(false);
          haptic("success");
          onClose();
        }}
      />
    </Modal>
  );
}
