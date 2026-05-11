"use client";

import * as React from "react";
import { Plus, Trash2, Flame, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { HabitGlyph, HABIT_ICON_NAMES } from "@/components/habit-icon";
import { useStore } from "@/store";
import { useHabits } from "@/store/selectors";
import {
  Habit,
  HabitIcon as HI,
  HABIT_TEMPLATES,
} from "@/lib/types";
import { lastNDates, todayStr, format, fromDateStr } from "@/lib/date";
import { streakForHabit, longestStreak } from "@/lib/score";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export default function HabitsPage() {
  const habits = useHabits();
  const addHabit = useStore((s) => s.addHabit);
  const removeHabit = useStore((s) => s.removeHabit);
  const reorderHabits = useStore((s) => s.reorderHabits);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Habit | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = habits.findIndex((h) => h.id === active.id);
    const newI = habits.findIndex((h) => h.id === over.id);
    if (oldI < 0 || newI < 0) return;
    reorderHabits(arrayMove(habits, oldI, newI).map((h) => h.id));
  };

  return (
    <Screen title="Habits" subtitle="Build them, watch them stack">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus size={14} />
          Add habit
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={habits.map((h) => h.id)}
          strategy={verticalListSortingStrategy}
        >
          {habits.map((h) => (
            <HabitFullRow
              key={h.id}
              habit={h}
              onEdit={() => setEditing(h)}
              onRemove={() => {
                removeHabit(h.id);
                haptic("warn");
              }}
            />
          ))}
        </SortableContext>
      </DndContext>

      {habits.length === 0 && (
        <Card className="text-center py-8">
          <div className="text-sm text-[var(--color-fg-2)]">
            No habits yet
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 text-xs text-[var(--color-accent)]"
          >
            Pick a few to start →
          </button>
        </Card>
      )}

      <AddHabitModal
        open={open}
        onClose={() => setOpen(false)}
        onAdd={(name, icon) => {
          addHabit(name, icon);
          haptic("tap");
        }}
      />

      <EditHabitModal
        habit={editing}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

function HabitFullRow({
  habit,
  onEdit,
  onRemove,
}: {
  habit: Habit;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const toggleHabit = useStore((s) => s.toggleHabit);
  const today = todayStr();
  const streak = streakForHabit(habit.history, today);
  const longest = longestStreak(habit.history);
  const dates = React.useMemo(() => lastNDates(60), []);
  const done = dates.filter((d) => habit.history[d]).length;
  const rate = Math.round((done / dates.length) * 100);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.id });

  return (
    <Card
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn("relative", isDragging && "shadow-[var(--shadow-float)]")}
    >
      <CardHeader>
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label="Reorder"
            className="h-8 w-6 grid place-items-center text-[var(--color-fg-3)] touch-none cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
          <div className="h-9 w-9 grid place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <HabitGlyph name={habit.icon} size={16} />
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="font-semibold text-sm hover:underline text-left truncate"
          >
            {habit.name}
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Delete habit"
          className="h-8 w-8 grid place-items-center rounded-lg text-[var(--color-fg-3)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={14} />
        </button>
      </CardHeader>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Streak" value={
          <span className="flex items-center gap-1">
            <Flame size={12} fill="currentColor" className="text-[var(--color-warning)]" />
            <span className="tnum">{streak}</span>
          </span>
        } />
        <Stat label="Longest" value={<span className="tnum">{longest}</span>} />
        <Stat label="60d rate" value={<span className="tnum">{rate}%</span>} />
      </div>

      <Calendar60 history={habit.history} onToggle={(d) => {
        toggleHabit(habit.id, d);
        haptic("tap");
      }} />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] px-3 py-2">
      <div className="label text-[9px]">{label}</div>
      <div className="text-base font-semibold tnum mt-0.5">{value}</div>
    </div>
  );
}

function Calendar60({
  history,
  onToggle,
}: {
  history: Record<string, boolean>;
  onToggle: (date: string) => void;
}) {
  const today = todayStr();
  const dates = React.useMemo(() => lastNDates(60), []);

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
        {dates.map((d) => {
          const done = !!history[d];
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onToggle(d)}
              title={`${format(fromDateStr(d), "MMM d")}${done ? " · done" : ""}`}
              className={cn(
                "aspect-square rounded-[3px] transition",
                done
                  ? "bg-[var(--color-accent-strong)] hover:brightness-110"
                  : "bg-[var(--color-elevated)] hover:bg-[var(--color-card-hover)]",
                isToday && "ring-1 ring-[var(--color-fg-2)]"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function AddHabitModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, icon: HI) => void;
}) {
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<HI>("target");

  React.useEffect(() => {
    if (open) {
      setName("");
      setIcon("target");
    }
  }, [open]);

  const save = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), icon);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New habit"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            Add habit
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Quick pick</div>
          <div className="flex flex-wrap gap-1.5">
            {HABIT_TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setName(t.name);
                  setIcon(t.icon);
                }}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-stroke)] text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)] hover:border-[var(--color-stroke-strong)] transition"
              >
                <HabitGlyph name={t.icon} size={12} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Name</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Read 20 min"
            autoFocus
          />
        </div>
        <div>
          <div className="label mb-2">Icon</div>
          <div className="grid grid-cols-7 gap-1.5">
            {HABIT_ICON_NAMES.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={cn(
                  "h-11 grid place-items-center rounded-lg border transition",
                  icon === i
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:border-[var(--color-stroke-strong)]"
                )}
              >
                <HabitGlyph name={i} size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EditHabitModal({
  habit,
  onClose,
}: {
  habit: Habit | null;
  onClose: () => void;
}) {
  const updateHabit = useStore((s) => s.updateHabit);
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<HI>("target");
  const open = !!habit;

  React.useEffect(() => {
    if (habit) {
      setName(habit.name);
      setIcon(habit.icon);
    }
  }, [habit]);

  const save = () => {
    if (!habit) return;
    updateHabit(habit.id, { name: name.trim() || habit.name, icon });
    onClose();
  };

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit habit"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Name</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="label mb-2">Icon</div>
          <div className="grid grid-cols-7 gap-1.5">
            {HABIT_ICON_NAMES.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={cn(
                  "h-11 grid place-items-center rounded-lg border transition",
                  icon === i
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                )}
              >
                <HabitGlyph name={i} size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
