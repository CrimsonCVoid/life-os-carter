"use client";

import * as React from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, GripVertical, Plus, Repeat, Tag, Timer } from "lucide-react";
import { useStore } from "@/store";
import { useTodayGoals, useToday } from "@/store/selectors";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Goal, Priority } from "@/lib/types";
import { patternSummary, shouldGenerateForDate } from "@/lib/recurrence";
import { haptic } from "@/lib/haptics";
import { GoalEditModal } from "./goal-edit-modal";
import { Confetti } from "@/components/confetti";
import { ManageRecurringModal } from "./recurring-manage-modal";
import { RecurringGoalEditModal } from "./recurring-goal-edit-modal";
import { useRecurrenceTicker } from "./useRecurrenceTicker";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useDay } from "./day-context";

const PRIO_COLOR: Record<Priority, string> = {
  P1: "var(--color-p1)",
  P2: "var(--color-p2)",
  P3: "var(--color-p3)",
};

export function Goals() {
  useRecurrenceTicker();
  const today = useToday();
  const { isFuture } = useDay();
  const goals = useTodayGoals();
  const addGoal = useStore((s) => s.addGoal);
  const toggleGoal = useStore((s) => s.toggleGoal);
  const removeGoal = useStore((s) => s.removeGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const reorderGoals = useStore((s) => s.reorderGoals);
  const skipRecurringGeneration = useStore(
    (s) => s.skipRecurringGeneration
  );
  const recurringGoals = useStore((s) => s.recurringGoals);
  const recurringById = React.useMemo(
    () => new Map(recurringGoals.map((r) => [r.id, r])),
    [recurringGoals]
  );
  const showRecurringIcon = useStore((s) => s.settings.showRecurringIcon);

  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState<Goal | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [recurringEdit, setRecurringEdit] = React.useState<string | null>(null);
  const allDoneRef = React.useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const done = goals.filter((g) => g.completed).length;
  const total = goals.length;

  // Future days: surface recurring goals that *will* generate on this date
  // (without creating real Goal records — the generation pass owns that).
  const futurePreviews = React.useMemo(() => {
    if (!isFuture) return [];
    return recurringGoals
      .filter((r) => r.active && shouldGenerateForDate(r, today))
      .filter((r) => !goals.some((g) => g.recurringGoalId === r.id));
  }, [isFuture, recurringGoals, today, goals]);

  React.useEffect(() => {
    const allDone = total > 0 && done === total;
    if (allDone && !allDoneRef.current) {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 2000);
      haptic("success");
    }
    allDoneRef.current = allDone;
  }, [done, total]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addGoal({ text, priority: "P2", date: today });
    setDraft("");
    haptic("tap");
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = goals.findIndex((g) => g.id === active.id);
    const newI = goals.findIndex((g) => g.id === over.id);
    if (oldI < 0 || newI < 0) return;
    const next = arrayMove(goals, oldI, newI);
    reorderGoals(today, next.map((g) => g.id));
  };

  return (
    <Card className="relative">
      {showConfetti && <Confetti />}
      <CardHeader>
        <CardTitle>Goals for Today</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-fg-2)] tnum">
            {done} / {total}
          </span>
          <div className="w-16 h-1.5 rounded-full bg-[var(--color-elevated)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] transition-[width]"
              style={{
                width: `${total ? (done / total) * 100 : 0}%`,
                transitionDuration: "320ms",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:brightness-110"
            title="Manage recurring goals"
          >
            <Repeat size={11} />
            Manage
          </button>
        </div>
      </CardHeader>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={goals.map((g) => g.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-1">
            {goals.map((g) => {
              const rg = g.recurringGoalId
                ? recurringById.get(g.recurringGoalId)
                : undefined;
              return (
                <GoalRow
                  key={g.id}
                  goal={g}
                  recurringSummary={
                    rg && showRecurringIcon ? patternSummary(rg) : null
                  }
                  onToggle={() => {
                    toggleGoal(g.id);
                    haptic(g.completed ? "soft" : "success");
                  }}
                  onEdit={() => setEditing(g)}
                  onRename={(text) => updateGoal(g.id, { text })}
                  onEditRecurrence={
                    rg ? () => setRecurringEdit(rg.id) : undefined
                  }
                />
              );
            })}
            {goals.length === 0 && futurePreviews.length === 0 && (
              <li className="py-4 text-center text-sm text-[var(--color-fg-3)]">
                {isFuture
                  ? "Nothing planned yet — add goals to set this day's intent."
                  : "What needs doing today?"}
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

      {futurePreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-stroke)]">
          <div className="label mb-2 text-[10px]">Will generate</div>
          <ul className="space-y-1">
            {futurePreviews.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--color-elevated)] text-xs"
              >
                <CalendarClock
                  size={12}
                  className="text-[var(--color-accent)] shrink-0"
                />
                {r.emoji && <span className="shrink-0">{r.emoji}</span>}
                <span className="flex-1 truncate text-[var(--color-fg-2)]">
                  {r.text}
                </span>
                <span className="text-[10px] text-[var(--color-fg-3)] shrink-0">
                  {patternSummary(r)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a goal"
          className="control no-zoom flex-1 h-11 px-3.5 outline-none accent-ring placeholder:text-[var(--color-fg-3)]"
        />
        <button
          type="submit"
          aria-label="Add"
          disabled={!draft.trim()}
          className="h-11 w-11 grid place-items-center rounded-xl bg-[var(--color-accent-strong)] text-white active:scale-95 transition disabled:opacity-40"
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </form>

      <GoalEditModal
        goal={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          updateGoal(editing.id, patch);
          setEditing(null);
        }}
        onDelete={() => {
          if (!editing) return;
          // For recurring-sourced goals, also mark the generation as skipped
          // so the ticker doesn't bring it back on the next mount.
          if (editing.recurringGoalId) {
            skipRecurringGeneration(editing.recurringGoalId, editing.date);
          }
          removeGoal(editing.id);
          haptic("warn");
          setEditing(null);
        }}
      />

      <ManageRecurringModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
      />

      <RecurringEditFromIdModal
        id={recurringEdit}
        onClose={() => setRecurringEdit(null)}
      />
    </Card>
  );
}

function RecurringEditFromIdModal({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const recurringGoals = useStore((s) => s.recurringGoals);
  const updateRecurringGoal = useStore((s) => s.updateRecurringGoal);
  const removeRecurringGoal = useStore((s) => s.removeRecurringGoal);
  const rg = id ? recurringGoals.find((r) => r.id === id) : undefined;
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <>
      <RecurringGoalEditModal
        open={!!rg}
        editingId={rg?.id ?? null}
        initial={
          rg
            ? {
                text: rg.text,
                emoji: rg.emoji,
                priority: rg.priority,
                category: rg.category,
                timeEstimateMin: rg.timeEstimateMin,
                pattern: rg.pattern,
                daysOfWeek: rg.daysOfWeek,
                dayOfMonth: rg.dayOfMonth,
                monthlyLastDay: rg.monthlyLastDay,
                intervalDays: rg.intervalDays,
                startDate: rg.startDate,
                active: rg.active,
              }
            : undefined
        }
        onClose={onClose}
        onSave={(draft) => {
          if (!rg) return;
          updateRecurringGoal(rg.id, draft);
          haptic("tap");
          onClose();
        }}
        onDelete={() => {
          if (!rg) return;
          setConfirmDelete(true);
        }}
      />
      {rg && (
        <ConfirmModal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            removeRecurringGoal(rg.id);
            haptic("warn");
            setConfirmDelete(false);
            onClose();
          }}
          title={`Delete "${rg.text}"?`}
          description="Already-generated goals from this template stay on past days; only future generations stop."
        />
      )}
    </>
  );
}

function GoalRow({
  goal,
  recurringSummary,
  onToggle,
  onEdit,
  onRename,
  onEditRecurrence,
}: {
  goal: Goal;
  recurringSummary: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onRename: (text: string) => void;
  onEditRecurrence?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id });

  // long press → edit
  const pressTimer = React.useRef<number | null>(null);
  const longPressed = React.useRef(false);
  const [recurPopover, setRecurPopover] = React.useState(false);

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      haptic("long");
      onEdit();
    }, 520);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={
        "group flex items-center gap-2 rounded-xl px-1 py-1 " +
        (isDragging
          ? "bg-[var(--color-elevated)] shadow-[var(--shadow-float)]"
          : "")
      }
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="h-9 w-6 grid place-items-center text-[var(--color-fg-3)] touch-none cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <Checkbox checked={goal.completed} onChange={onToggle} />
      <button
        type="button"
        aria-label={`Priority ${goal.priority}`}
        onClick={onEdit}
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: PRIO_COLOR[goal.priority] }}
      />
      {recurringSummary && (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Recurring goal"
            onClick={() => setRecurPopover((v) => !v)}
            className="h-5 w-5 grid place-items-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            title={`Recurring · ${recurringSummary}`}
          >
            <Repeat size={11} />
          </button>
          {recurPopover && (
            <>
              <button
                type="button"
                aria-label="Close popover"
                onClick={() => setRecurPopover(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 w-52 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-card)] shadow-[var(--shadow-float)] px-3 py-2 text-xs">
                <div className="text-[var(--color-fg)] font-medium">
                  Recurring
                </div>
                <div className="text-[var(--color-fg-2)] mt-0.5">
                  {recurringSummary}
                </div>
                {onEditRecurrence && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecurPopover(false);
                      onEditRecurrence();
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[var(--color-accent)] text-[11px]"
                  >
                    Edit recurrence →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {goal.emoji && (
        <span className="text-[15px] leading-none shrink-0">{goal.emoji}</span>
      )}
      <input
        value={goal.text}
        onChange={(e) => onRename(e.target.value)}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        className={
          "flex-1 bg-transparent no-zoom text-[15px] outline-none placeholder:text-[var(--color-fg-3)] py-2 " +
          (goal.completed
            ? "line-through text-[var(--color-fg-3)]"
            : "text-[var(--color-fg)]")
        }
      />
      {(goal.timeEstimateMin || goal.category) && (
        <div className="flex items-center gap-1.5 shrink-0">
          {goal.timeEstimateMin ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-fg-2)] tnum">
              <Timer size={11} />
              {goal.timeEstimateMin}m
            </span>
          ) : null}
          {goal.category ? (
            <Pill tone="neutral" className="h-6 px-2 text-[10px]">
              <Tag size={10} />
              {goal.category}
            </Pill>
          ) : null}
        </div>
      )}
    </li>
  );
}
