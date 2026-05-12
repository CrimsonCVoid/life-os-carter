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
import { GripVertical, Plus, ChevronDown, Moon } from "lucide-react";
import { StreakBadge } from "@/components/ui/streak-badge";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useStore } from "@/store";
import { useEveningRoutine, useEveningStreak } from "@/store/selectors";
import { EveningRoutineItem } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useDay } from "./day-context";

const EMOJI_PICKER = [
  "🌙","📵","💡","🎯","📖","💊","🛁","☕","🧘","🚿","💧","📝","🪥","🦷","🧴","🛏️","🌿","🍵","🌌","⏰","🪞","🎧","🧠","✍️","📓","🥛","🍪","🌅","☁️","🌖",
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function EveningRoutine() {
  const { date: today, isToday, isFuture } = useDay();
  const items = useEveningRoutine();
  const streak = useEveningStreak();
  const settings = useStore((s) => s.settings.eveningRoutine);
  const showOnTodayScreen = settings.showOnTodayScreen;

  const toggle = useStore((s) => s.toggleEveningItem);
  const removeItem = useStore((s) => s.removeEveningItem);
  const updateItem = useStore((s) => s.updateEveningItem);
  const addItem = useStore((s) => s.addEveningItem);
  const reorder = useStore((s) => s.reorderEvening);

  const [editing, setEditing] = React.useState<EveningRoutineItem | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [expandedOverride, setExpandedOverride] = React.useState<
    boolean | null
  >(null);

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

  // Time-gated collapse rules apply only on actual today.
  const now = new Date();
  const hour = now.getHours();
  // Before 5pm: collapsed header (haven't started wind-down)
  // 5pm–10pm: full default
  // 10pm onwards: full
  // After 2am AND incomplete: dim treatment
  const before5pm = isToday && hour < 17;
  const past2am = isToday && hour >= 2 && hour < 5;
  const pastMidnight = isToday && hour < 5; // 00:00–05:00 counts as "past midnight"

  // Auto-collapsed cases:
  // 1. All done + autoCollapse + past midnight → single pill (collapsed by default)
  // 2. Before 5pm → header-only (collapsed by default)
  // Both honor the user toggling expandedOverride.
  const autoCollapseDoneToPill =
    allDone && settings.autoCollapseWhenDone && pastMidnight;
  const autoCollapseBefore5pm = before5pm && !allDone;
  const defaultExpanded = !(autoCollapseDoneToPill || autoCollapseBefore5pm);
  const expanded =
    expandedOverride == null ? defaultExpanded : expandedOverride;

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
  if (isFuture) return null;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((r) => r.id === active.id);
    const newI = items.findIndex((r) => r.id === over.id);
    if (oldI < 0 || newI < 0) return;
    reorder(arrayMove(items, oldI, newI).map((r) => r.id));
  };

  // Collapsed-when-done pill
  if (autoCollapseDoneToPill && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpandedOverride(true)}
        className="w-full card p-4 flex items-center gap-3 text-left card-hover border-[color:color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
        aria-label="Expand evening routine"
      >
        <div className="h-9 w-9 grid place-items-center rounded-xl grad-hero text-white shrink-0">
          <Moon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="label text-[10px]">Evening Routine</div>
          <div className="text-sm font-semibold tracking-tight flex items-center gap-2 flex-wrap">
            ✓ Complete
            {lastCompletedAt && (
              <span className="text-[var(--color-fg-2)] font-normal text-xs">
                at {formatTime(lastCompletedAt)}
              </span>
            )}
            {settings.showStreak && streak >= 1 && (
              <span className="inline-flex items-center gap-1 text-xs">
                <span className="text-[var(--color-fg-3)]">·</span>
                <StreakBadge streak={streak} alwaysShow size={11} />
                <span className="text-[var(--color-fg-3)] font-normal">
                  day{streak === 1 ? "" : "s"}
                </span>
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={16} className="text-[var(--color-fg-3)]" />
      </button>
    );
  }

  // Before-5pm collapsed header
  if (autoCollapseBefore5pm && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpandedOverride(true)}
        className="w-full card p-3 flex items-center justify-between gap-3 text-left card-hover"
        aria-label="Expand evening routine"
      >
        <div className="flex items-center gap-2">
          <Moon size={14} className="text-[var(--color-fg-3)]" />
          <span className="text-sm text-[var(--color-fg-2)]">
            Evening Routine
          </span>
          <span className="text-[11px] text-[var(--color-fg-3)]">
            · starts later
          </span>
        </div>
        <ChevronDown size={14} className="text-[var(--color-fg-3)]" />
      </button>
    );
  }

  return (
    <Card
      className={cn(
        "relative transition-shadow",
        allDone &&
          "shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_30%,transparent),0_0_28px_-4px_color-mix(in_srgb,var(--color-accent)_28%,transparent)]",
        !allDone && past2am && "opacity-70"
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Evening Routine</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-fg-2)] tnum">
            {done} of {total}
          </span>
          {settings.showStreak && <StreakBadge streak={streak} size={11} />}
        </div>
      </CardHeader>

      {!allDone && past2am && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[11px] text-[var(--color-fg-2)]">
          The evening moment has passed — but you can still check in.
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
                  done={!!r.history[today]?.completed}
                  /** Soft separator above the tomorrow-prep item. */
                  spaceAbove={r.name === "Set tomorrow's goals"}
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
                Your evening is a blank slate. Try “Lights out by 11pm.”
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
  done,
  spaceAbove,
  onToggle,
  onEdit,
}: {
  item: EveningRoutineItem;
  done: boolean;
  spaceAbove?: boolean;
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
        done && "opacity-70",
        spaceAbove && "mt-3 pt-3 border-t border-[var(--color-stroke)]"
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
      {item.icon && (
        <span className="text-[22px] leading-none shrink-0 select-none">
          {item.icon}
        </span>
      )}
      <button
        type="button"
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onClick={(e) => {
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
  item: EveningRoutineItem | null;
  onClose: () => void;
  onSave: (patch: Partial<EveningRoutineItem>) => void;
  onDelete: () => void;
}) {
  const open = !!item;
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("🌙");

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
  const [icon, setIcon] = React.useState("🌙");

  React.useEffect(() => {
    if (open) {
      setName("");
      setIcon("🌙");
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New evening item"
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
            placeholder="Brush teeth"
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
