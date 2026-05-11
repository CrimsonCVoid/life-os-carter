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
import { GripVertical, Plus, Tag, Timer } from "lucide-react";
import { useStore } from "@/store";
import { useTodayGoals, useToday } from "@/store/selectors";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Goal, Priority } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { GoalEditModal } from "./goal-edit-modal";
import { Confetti } from "@/components/confetti";

const PRIO_COLOR: Record<Priority, string> = {
  P1: "var(--color-p1)",
  P2: "var(--color-p2)",
  P3: "var(--color-p3)",
};

export function Goals() {
  const today = useToday();
  const goals = useTodayGoals();
  const addGoal = useStore((s) => s.addGoal);
  const toggleGoal = useStore((s) => s.toggleGoal);
  const removeGoal = useStore((s) => s.removeGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const reorderGoals = useStore((s) => s.reorderGoals);

  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState<Goal | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const allDoneRef = React.useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const done = goals.filter((g) => g.completed).length;
  const total = goals.length;

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
    addGoal({ text, priority: "P2" });
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
            {goals.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                onToggle={() => {
                  toggleGoal(g.id);
                  haptic(g.completed ? "soft" : "success");
                }}
                onEdit={() => setEditing(g)}
                onRename={(text) => updateGoal(g.id, { text })}
              />
            ))}
            {goals.length === 0 && (
              <li className="py-4 text-center text-sm text-[var(--color-fg-3)]">
                What needs doing today?
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

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
          removeGoal(editing.id);
          haptic("warn");
          setEditing(null);
        }}
      />
    </Card>
  );
}

function GoalRow({
  goal,
  onToggle,
  onEdit,
  onRename,
}: {
  goal: Goal;
  onToggle: () => void;
  onEdit: () => void;
  onRename: (text: string) => void;
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
