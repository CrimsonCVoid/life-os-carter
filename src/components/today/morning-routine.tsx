"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
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
import { GripVertical, Plus, Flame, ChevronDown, Sunrise } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useStore } from "@/store";
import { useRoutine, useRoutineStreak } from "@/store/selectors";
import { MorningRoutineItem } from "@/lib/types";
import { todayStr } from "@/lib/date";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const EMOJI_PICKER = [
  "🛏️","📵","☀️","☕","🧘","💊","🎯","🚿","💧","🍳","🌱","🚶","📖","🧠","✍️","🧊","🌅","🪞","🦷","💪","🥗","🏃","🪥","🥛","🧴","⏰","🌿","🍵","📝","🧹",
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function MorningRoutine() {
  const today = todayStr();
  const items = useRoutine();
  const streak = useRoutineStreak();
  const settings = useStore((s) => s.settings.morningRoutine);
  const showOnTodayScreen = settings.showOnTodayScreen;

  const toggle = useStore((s) => s.toggleRoutineItem);
  const removeItem = useStore((s) => s.removeRoutineItem);
  const updateItem = useStore((s) => s.updateRoutineItem);
  const addItem = useStore((s) => s.addRoutineItem);
  const reorder = useStore((s) => s.reorderRoutine);

  const [editing, setEditing] = React.useState<MorningRoutineItem | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);

  const allDoneRef = React.useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const done = items.filter((r) => r.history[today]?.completed).length;
  const total = items.length;
  const allDone = total > 0 && done === total;
  const now = React.useMemo(() => new Date(), []);
  const past11 = now.getHours() >= 11;
  const past2pm = now.getHours() >= 14;

  const lastCompletedAt = React.useMemo(() => {
    if (!allDone) return null;
    const stamps = items
      .map((r) => r.history[today]?.completedAt)
      .filter(Boolean) as string[];
    return stamps.length ? stamps.sort().slice(-1)[0] : null;
  }, [items, today, allDone]);

  React.useEffect(() => {
    if (allDone && !allDoneRef.current) {
      haptic("success");
    }
    allDoneRef.current = allDone;
  }, [allDone]);

  if (!showOnTodayScreen) return null;

  const isCollapsed =
    allDone && settings.autoCollapseWhenDone && past11 && !expanded;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((r) => r.id === active.id);
    const newI = items.findIndex((r) => r.id === over.id);
    if (oldI < 0 || newI < 0) return;
    reorder(arrayMove(items, oldI, newI).map((r) => r.id));
  };

  // collapsed pill state
  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full card p-4 flex items-center gap-3 text-left card-hover border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
        aria-label="Expand morning routine"
      >
        <div className="h-9 w-9 grid place-items-center rounded-xl grad-hero text-white shrink-0">
          <Sunrise size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="label text-[10px]">Morning Routine</div>
          <div className="text-sm font-semibold tracking-tight flex items-center gap-2 flex-wrap">
            ✓ Complete
            {lastCompletedAt && (
              <span className="text-[var(--color-fg-2)] font-normal text-xs">
                at {formatTime(lastCompletedAt)}
              </span>
            )}
            {settings.showStreak && streak >= 1 && (
              <span className="text-[var(--color-warning)] text-xs tnum inline-flex items-center gap-0.5">
                · {streak} day{streak === 1 ? "" : "s"}
                <Flame size={11} fill="currentColor" />
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={16} className="text-[var(--color-fg-3)]" />
      </button>
    );
  }

  return (
    <Card
      className={cn(
        "relative transition-shadow",
        allDone &&
          "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_30%,transparent),0_0_28px_-4px_color-mix(in_srgb,var(--color-accent)_28%,transparent)]",
        !allDone && past2pm && "opacity-75"
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Morning Routine</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-fg-2)] tnum">
            {done} of {total}
          </span>
          {settings.showStreak && streak >= 3 && (
            <span className="text-xs font-semibold text-[var(--color-warning)] tnum inline-flex items-center gap-0.5">
              <Flame size={11} fill="currentColor" />
              {streak}
            </span>
          )}
        </div>
      </CardHeader>

      {!allDone && past2pm && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[11px] text-[var(--color-fg-2)]">
          The morning moment has passed — but you can still check in.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {items.map((r) => (
                <RoutineRow
                  key={r.id}
                  item={r}
                  date={today}
                  done={!!r.history[today]?.completed}
                  onToggle={() => {
                    toggle(r.id, today);
                    haptic(r.history[today]?.completed ? "soft" : "success");
                  }}
                  onEdit={() => setEditing(r)}
                />
              ))}
            </AnimatePresence>
            {items.length === 0 && (
              <li className="py-4 text-center text-sm text-[var(--color-fg-3)]">
                Your morning is a blank slate.
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-[var(--color-stroke-strong)] text-xs text-[var(--color-fg-3)] hover:text-[var(--color-fg-2)] hover:border-[var(--color-fg-3)] transition"
      >
        <Plus size={14} />
        Add item
      </button>

      <RoutineEditModal
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          updateItem(editing.id, patch);
          setEditing(null);
        }}
        onDelete={() => {
          if (!editing) return;
          removeItem(editing.id);
          haptic("warn");
          setEditing(null);
        }}
      />
      <RoutineAddModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(name, icon) => {
          addItem(name, icon);
          haptic("tap");
          setAdding(false);
        }}
      />
    </Card>
  );
}

function RoutineRow({
  item,
  date,
  done,
  onToggle,
  onEdit,
}: {
  item: MorningRoutineItem;
  date: string;
  done: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const pressTimer = React.useRef<number | null>(null);
  const startPress = () => {
    pressTimer.current = window.setTimeout(() => {
      haptic("long");
      onEdit();
    }, 520);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  return (
    <motion.li
      ref={setNodeRef}
      layout
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn(
        "group flex items-center gap-2 rounded-xl px-1 py-1",
        isDragging && "bg-[var(--color-elevated)] shadow-[var(--shadow-float)]",
        done && "opacity-70"
      )}
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
      <span className="text-[22px] leading-none shrink-0 select-none">
        {item.icon}
      </span>
      <button
        type="button"
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onClick={(e) => {
          // single tap goes to checkbox; clicking text area focuses edit
          if (pressTimer.current) onEdit();
          e.preventDefault();
        }}
        className={cn(
          "flex-1 text-left bg-transparent text-[15px] outline-none py-2 truncate",
          done
            ? "line-through text-[var(--color-fg-3)]"
            : "text-[var(--color-fg)]"
        )}
      >
        {item.name}
      </button>
      <Checkbox checked={done} onChange={onToggle} />
    </motion.li>
  );
}

function RoutineEditModal({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: MorningRoutineItem | null;
  onClose: () => void;
  onSave: (patch: Partial<MorningRoutineItem>) => void;
  onDelete: () => void;
}) {
  const open = !!item;
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("🎯");

  React.useEffect(() => {
    if (item) {
      setName(item.name);
      setIcon(item.icon);
    }
  }, [item]);

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit item"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave({ name: name.trim() || item!.name, icon })}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Name</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <EmojiPicker value={icon} onPick={setIcon} />
      </div>
    </Modal>
  );
}

function RoutineAddModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, icon: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("🎯");

  React.useEffect(() => {
    if (open) {
      setName("");
      setIcon("🎯");
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New routine item"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onAdd(name.trim(), icon)}
            disabled={!name.trim()}
          >
            Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-2">Name</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Drink a glass of water"
            autoFocus
          />
        </div>
        <EmojiPicker value={icon} onPick={setIcon} />
      </div>
    </Modal>
  );
}

function EmojiPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (e: string) => void;
}) {
  return (
    <div>
      <div className="label mb-2">Icon</div>
      <div className="grid grid-cols-10 gap-1.5 max-h-44 overflow-y-auto nice-scroll pr-1">
        {EMOJI_PICKER.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className={cn(
              "h-10 grid place-items-center rounded-lg border text-xl transition",
              value === e
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-stroke)] hover:border-[var(--color-stroke-strong)]"
            )}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
