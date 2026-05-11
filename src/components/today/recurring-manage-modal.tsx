"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Plus, Pencil } from "lucide-react";
import { useStore } from "@/store";
import {
  useRecurringGoals,
  useRecurringCompletionRate,
} from "@/store/selectors";
import { patternSummary } from "@/lib/recurrence";
import { Priority, RecurringGoal } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import {
  RecurringGoalEditModal,
  type RecurringGoalDraft,
} from "./recurring-goal-edit-modal";

const PRIO_COLOR: Record<Priority, string> = {
  P1: "var(--color-p1)",
  P2: "var(--color-p2)",
  P3: "var(--color-p3)",
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ManageRecurringModal({ open, onClose }: Props) {
  const items = useRecurringGoals();
  const addRecurringGoal = useStore((s) => s.addRecurringGoal);
  const updateRecurringGoal = useStore((s) => s.updateRecurringGoal);
  const removeRecurringGoal = useStore((s) => s.removeRecurringGoal);
  const toggleRecurringGoalActive = useStore(
    (s) => s.toggleRecurringGoalActive
  );
  const runRecurringGeneration = useStore((s) => s.runRecurringGeneration);

  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringGoal | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<RecurringGoal | null>(
    null
  );

  const sorted = [...items].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title="Recurring Goals"
        description="Templates that auto-generate a goal on a schedule."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={14} />
              New
            </Button>
          </div>
        }
      >
        {sorted.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-sm text-[var(--color-fg-2)]">
              No recurring goals yet.
            </div>
            <div className="text-xs text-[var(--color-fg-3)] mt-1">
              Add things you want to do regularly — gym, journal, call mom.
            </div>
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus size={14} />
              Add your first
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((rg) => (
              <RecurringRow
                key={rg.id}
                rg={rg}
                onEdit={() => setEditing(rg)}
                onToggle={() => toggleRecurringGoalActive(rg.id)}
                onLongPress={() => setPendingDelete(rg)}
              />
            ))}
          </ul>
        )}
      </Modal>

      <RecurringGoalEditModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={(draft) => {
          addRecurringGoal(draft);
          setAddOpen(false);
          runRecurringGeneration();
          haptic("success");
        }}
      />

      <RecurringGoalEditModal
        open={!!editing}
        editingId={editing?.id}
        initial={
          editing
            ? ({
                text: editing.text,
                emoji: editing.emoji,
                priority: editing.priority,
                category: editing.category,
                timeEstimateMin: editing.timeEstimateMin,
                pattern: editing.pattern,
                daysOfWeek: editing.daysOfWeek,
                dayOfMonth: editing.dayOfMonth,
                monthlyLastDay: editing.monthlyLastDay,
                intervalDays: editing.intervalDays,
                startDate: editing.startDate,
                active: editing.active,
              } satisfies Partial<RecurringGoalDraft>)
            : undefined
        }
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (!editing) return;
          updateRecurringGoal(editing.id, draft);
          setEditing(null);
          haptic("tap");
        }}
        onDelete={() => {
          if (!editing) return;
          setPendingDelete(editing);
          setEditing(null);
        }}
      />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={`Delete "${pendingDelete?.text ?? ""}"?`}
        description="Already-generated goals from this template stay on past days; only future generations stop."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDelete) return;
          removeRecurringGoal(pendingDelete.id);
          setPendingDelete(null);
          haptic("warn");
        }}
      />
    </>
  );
}

function RecurringRow({
  rg,
  onEdit,
  onToggle,
  onLongPress,
}: {
  rg: RecurringGoal;
  onEdit: () => void;
  onToggle: () => void;
  onLongPress: () => void;
}) {
  const { scheduled, completed, pct } = useRecurringCompletionRate(rg, 30);
  const pressRef = React.useRef<number | null>(null);
  const longPressedRef = React.useRef(false);

  const startPress = () => {
    longPressedRef.current = false;
    pressRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      haptic("long");
      onLongPress();
    }, 560);
  };
  const cancelPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current);
  };

  return (
    <li
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      className="card p-3 flex items-center gap-3"
      style={{ opacity: rg.active ? 1 : 0.55 }}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: PRIO_COLOR[rg.priority] }}
        aria-label={`Priority ${rg.priority}`}
      />
      {rg.emoji && (
        <span className="text-base leading-none shrink-0">{rg.emoji}</span>
      )}
      <button
        type="button"
        onClick={() => {
          if (longPressedRef.current) return;
          onEdit();
        }}
        className="flex-1 min-w-0 text-left"
      >
        <div className="text-sm font-medium truncate">{rg.text}</div>
        <div className="text-[11px] text-[var(--color-fg-3)] truncate">
          {patternSummary(rg)}
        </div>
      </button>

      <div className="shrink-0 text-right min-w-[60px]">
        <div className="text-[11px] tnum text-[var(--color-fg-2)]">
          {scheduled === 0 ? "—" : `${completed}/${scheduled}`}
        </div>
        <div className="mt-1 h-1 w-16 rounded-full bg-[var(--color-elevated)] overflow-hidden">
          <div
            className="h-full bg-[var(--color-accent)]"
            style={{
              width: pct == null ? 0 : `${pct}%`,
              transition: "width 280ms ease",
            }}
          />
        </div>
      </div>

      <Toggle checked={rg.active} onChange={onToggle} />

      <button
        type="button"
        onClick={() => {
          if (longPressedRef.current) return;
          onEdit();
        }}
        aria-label="Edit"
        className="h-8 w-8 grid place-items-center rounded-md text-[var(--color-fg-3)] hover:text-[var(--color-fg)]"
      >
        <Pencil size={13} />
      </button>
    </li>
  );
}
