"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  Plus,
  Target,
  Dumbbell,
  Utensils,
  Brain,
  Users,
  Moon,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/store";
import { useScheduleForDay, useUnscheduledGoals } from "@/store/selectors";
import {
  Block,
  BlockType,
  BLOCK_COLORS,
  BLOCK_TYPE_LABELS,
} from "@/lib/types";
import { todayStr } from "@/lib/date";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const START_HOUR = 6;
const END_HOUR = 24; // midnight = 24
const SLOT_MIN = 30;
const SLOT_PX = 36;
const SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MIN;

const TYPE_ICON: Record<BlockType, React.ComponentType<{ size?: number }>> = {
  goal: Target,
  workout: Dumbbell,
  meal: Utensils,
  focus: Brain,
  meeting: Users,
  rest: Moon,
  other: Clock,
};

function minToHHMM(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}:${mm.toString().padStart(2, "0")}${ampm}`;
}

function roundToSlot(m: number) {
  return Math.round(m / SLOT_MIN) * SLOT_MIN;
}

export function Schedule() {
  const today = todayStr();
  const blocks = useScheduleForDay(today);
  const addBlock = useStore((s) => s.addBlock);
  const updateBlock = useStore((s) => s.updateBlock);
  const removeBlock = useStore((s) => s.removeBlock);
  const moveBlock = useStore((s) => s.moveBlock);
  const resizeBlock = useStore((s) => s.resizeBlock);
  const unscheduledGoals = useUnscheduledGoals(today);

  const [expanded, setExpanded] = React.useState<boolean | null>(null);
  const [editing, setEditing] = React.useState<Block | null>(null);
  const [newAt, setNewAt] = React.useState<number | null>(null);
  const [pickGoalOpen, setPickGoalOpen] = React.useState(false);
  const [pickGoalTime, setPickGoalTime] = React.useState<number | null>(null);

  // default: collapse if empty, expand otherwise
  const effectiveExpanded = expanded ?? blocks.length > 0;

  const now = useNowMin();
  const nowOffsetPx =
    now >= START_HOUR * 60 && now < END_HOUR * 60
      ? ((now - START_HOUR * 60) / SLOT_MIN) * SLOT_PX
      : null;

  const slotTimes = React.useMemo(() => {
    const arr: number[] = [];
    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += SLOT_MIN) {
      arr.push(m);
    }
    return arr;
  }, []);

  const onSlotTap = (mins: number) => {
    setNewAt(mins);
  };

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setExpanded(!effectiveExpanded)}
          className="flex items-center gap-1.5"
        >
          <CardTitle>Schedule</CardTitle>
          <ChevronDown
            size={14}
            className={cn(
              "text-[var(--color-fg-3)] transition-transform",
              effectiveExpanded ? "" : "-rotate-90"
            )}
          />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-fg-3)] tnum">
            {blocks.length}
          </span>
          {effectiveExpanded && unscheduledGoals.length > 0 && (
            <Button
              size="sm"
              variant="soft"
              onClick={() => setPickGoalOpen(true)}
            >
              <Plus size={12} />
              Schedule goal
            </Button>
          )}
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {effectiveExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="relative pl-12 pr-1"
              style={{ height: SLOTS * SLOT_PX }}
            >
              {/* hour grid + labels */}
              {Array.from(
                { length: END_HOUR - START_HOUR },
                (_, i) => i + START_HOUR
              ).map((h) => {
                const offset = (h - START_HOUR) * 60 * (SLOT_PX / SLOT_MIN);
                const past = now > h * 60 + 60;
                return (
                  <React.Fragment key={h}>
                    <div
                      className={cn(
                        "absolute left-0 -translate-y-1/2 text-[10px] tnum",
                        past
                          ? "text-[var(--color-fg-3)]/50"
                          : "text-[var(--color-fg-3)]"
                      )}
                      style={{ top: offset }}
                    >
                      {h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`}
                    </div>
                    <div
                      className="absolute left-10 right-0 border-t border-[var(--color-stroke)]"
                      style={{ top: offset }}
                    />
                  </React.Fragment>
                );
              })}

              {/* tappable empty slots */}
              {slotTimes.map((m) => {
                const top = ((m - START_HOUR * 60) / SLOT_MIN) * SLOT_PX;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => onSlotTap(m)}
                    className="absolute left-10 right-0 hover:bg-[var(--color-elevated)]/40 transition rounded-md"
                    style={{ top, height: SLOT_PX }}
                    aria-label={`Add block at ${minToHHMM(m)}`}
                  />
                );
              })}

              {/* now-line */}
              {nowOffsetPx != null && (
                <div
                  className="absolute left-10 right-0 pointer-events-none z-10"
                  style={{ top: nowOffsetPx }}
                >
                  <div className="relative">
                    <div className="h-[2px] bg-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent)]" />
                    <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                  </div>
                </div>
              )}

              {/* blocks */}
              {blocks.map((b) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  onEdit={() => setEditing(b)}
                  onMove={(newStart) => moveBlock(b.id, newStart)}
                  onResize={(newEnd) => resizeBlock(b.id, newEnd)}
                  onDelete={() => {
                    removeBlock(b.id);
                    haptic("warn");
                  }}
                />
              ))}
            </div>

            {blocks.length === 0 && (
              <div className="text-center text-xs text-[var(--color-fg-3)] py-2 -mt-2">
                Tap any slot to add a block.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <BlockEditModal
        block={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          updateBlock(editing.id, patch);
          setEditing(null);
        }}
        onDelete={() => {
          if (!editing) return;
          removeBlock(editing.id);
          haptic("warn");
          setEditing(null);
        }}
      />

      <BlockNewModal
        open={newAt != null}
        startMin={newAt ?? 9 * 60}
        onClose={() => setNewAt(null)}
        onCreate={(payload) => {
          addBlock({ date: today, ...payload });
          haptic("tap");
          setNewAt(null);
          setExpanded(true);
        }}
      />

      <PickGoalModal
        open={pickGoalOpen}
        onClose={() => {
          setPickGoalOpen(false);
          setPickGoalTime(null);
        }}
        time={pickGoalTime}
        onTimeChange={setPickGoalTime}
        onConfirm={(goal) => {
          if (pickGoalTime == null) return;
          const duration = goal.timeEstimateMin || 60;
          addBlock({
            date: today,
            startMin: pickGoalTime,
            endMin: pickGoalTime + duration,
            type: "goal",
            title: goal.text,
            goalId: goal.id,
          });
          haptic("tap");
          setPickGoalOpen(false);
          setPickGoalTime(null);
          setExpanded(true);
        }}
      />
    </Card>
  );
}

function useNowMin() {
  const [now, setNow] = React.useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function BlockCard({
  block,
  onEdit,
  onMove,
  onResize,
  onDelete,
}: {
  block: Block;
  onEdit: () => void;
  onMove: (newStartMin: number) => void;
  onResize: (newEndMin: number) => void;
  onDelete: () => void;
}) {
  const top = ((block.startMin - START_HOUR * 60) / SLOT_MIN) * SLOT_PX;
  const height =
    ((block.endMin - block.startMin) / SLOT_MIN) * SLOT_PX - 4;
  const colors = BLOCK_COLORS[block.type];
  const Icon = TYPE_ICON[block.type];

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const longPressTimer = React.useRef<number | null>(null);
  const dragRef = React.useRef<{
    mode: "none" | "move" | "resize";
    startY: number;
    initialStart: number;
    initialEnd: number;
  }>({ mode: "none", startY: 0, initialStart: 0, initialEnd: 0 });

  const startLongPress = () => {
    longPressTimer.current = window.setTimeout(() => {
      haptic("long");
      setConfirmOpen(true);
    }, 700);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  };

  const onMovePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "move",
      startY: e.clientY,
      initialStart: block.startMin,
      initialEnd: block.endMin,
    };
    startLongPress();
  };
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget.parentElement as HTMLDivElement).setPointerCapture(
      e.pointerId
    );
    dragRef.current = {
      mode: "resize",
      startY: e.clientY,
      initialStart: block.startMin,
      initialEnd: block.endMin,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.mode === "none") return;
    cancelLongPress();
    const deltaPx = e.clientY - d.startY;
    const deltaMin = (deltaPx / SLOT_PX) * SLOT_MIN;
    if (d.mode === "move") {
      const newStart = Math.max(
        START_HOUR * 60,
        roundToSlot(d.initialStart + deltaMin)
      );
      const dur = d.initialEnd - d.initialStart;
      const clampedStart = Math.min(newStart, END_HOUR * 60 - dur);
      if (clampedStart !== block.startMin) onMove(clampedStart);
    } else if (d.mode === "resize") {
      const newEnd = roundToSlot(d.initialEnd + deltaMin);
      const clampedEnd = Math.min(
        END_HOUR * 60,
        Math.max(block.startMin + SLOT_MIN, newEnd)
      );
      if (clampedEnd !== block.endMin) onResize(clampedEnd);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    cancelLongPress();
    const d = dragRef.current;
    const dragged =
      d.mode !== "none" &&
      (block.startMin !== d.initialStart || block.endMin !== d.initialEnd);
    dragRef.current = {
      mode: "none",
      startY: 0,
      initialStart: 0,
      initialEnd: 0,
    };
    if (!dragged) {
      onEdit();
    }
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onMovePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          cancelLongPress();
          dragRef.current = {
            mode: "none",
            startY: 0,
            initialStart: 0,
            initialEnd: 0,
          };
        }}
        className="absolute left-10 right-0 rounded-lg px-2.5 py-1 select-none touch-none cursor-grab active:cursor-grabbing overflow-hidden"
        style={{
          top,
          height,
          background: colors.bg,
          border: `1px solid ${colors.ring}`,
          color: colors.fg,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {block.icon ? (
            <span className="text-base leading-none shrink-0">{block.icon}</span>
          ) : (
            <Icon size={13} />
          )}
          <span className="text-[12px] font-medium truncate flex-1">
            {block.title}
          </span>
          <span className="text-[10px] tnum opacity-70 shrink-0">
            {minToHHMM(block.startMin)}
          </span>
        </div>
        <div
          data-resize-handle
          onPointerDown={onResizePointerDown}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
        >
          <div className="mx-auto w-8 h-[3px] mt-0.5 rounded-full opacity-40 bg-current" />
        </div>
      </div>
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onDelete}
        title={`Delete "${block.title}"?`}
        description="The block will be removed from today's schedule."
      />
    </>
  );
}

function BlockEditModal({
  block,
  onClose,
  onSave,
  onDelete,
}: {
  block: Block | null;
  onClose: () => void;
  onSave: (patch: Partial<Block>) => void;
  onDelete: () => void;
}) {
  const open = !!block;
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<BlockType>("focus");
  const [start, setStart] = React.useState(9 * 60);
  const [end, setEnd] = React.useState(10 * 60);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!block) return;
    setTitle(block.title);
    setType(block.type);
    setStart(block.startMin);
    setEnd(block.endMin);
    setNotes(block.notes ?? "");
  }, [block]);

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit block"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                onSave({
                  title: title.trim() || block.title,
                  type,
                  startMin: start,
                  endMin: Math.max(end, start + 15),
                  notes: notes.trim() || undefined,
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      }
    >
      <BlockFormFields
        title={title}
        setTitle={setTitle}
        type={type}
        setType={setType}
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        notes={notes}
        setNotes={setNotes}
      />
    </Modal>
  );
}

function BlockNewModal({
  open,
  startMin,
  onClose,
  onCreate,
}: {
  open: boolean;
  startMin: number;
  onClose: () => void;
  onCreate: (payload: Omit<Block, "id" | "createdAt" | "date">) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<BlockType>("focus");
  const [start, setStart] = React.useState(startMin);
  const [end, setEnd] = React.useState(startMin + 60);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setType("focus");
      setStart(startMin);
      setEnd(startMin + 60);
      setNotes("");
    }
  }, [open, startMin]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New block"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim()}
            onClick={() =>
              onCreate({
                title: title.trim(),
                type,
                startMin: start,
                endMin: Math.max(end, start + 15),
                notes: notes.trim() || undefined,
              })
            }
          >
            Add
          </Button>
        </div>
      }
    >
      <BlockFormFields
        title={title}
        setTitle={setTitle}
        type={type}
        setType={setType}
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        notes={notes}
        setNotes={setNotes}
      />
    </Modal>
  );
}

function BlockFormFields({
  title,
  setTitle,
  type,
  setType,
  start,
  setStart,
  end,
  setEnd,
  notes,
  setNotes,
}: {
  title: string;
  setTitle: (v: string) => void;
  type: BlockType;
  setType: (v: BlockType) => void;
  start: number;
  setStart: (v: number) => void;
  end: number;
  setEnd: (v: number) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-2">Title</div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Block title"
          autoFocus
        />
      </div>
      <div>
        <div className="label mb-2">Type</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => {
            const c = BLOCK_COLORS[t];
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium border transition",
                  active
                    ? ""
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                )}
                style={
                  active
                    ? {
                        background: c.bg,
                        color: c.fg,
                        borderColor: c.ring,
                      }
                    : undefined
                }
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: c.fg }}
                />
                {BLOCK_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label mb-2">Start</div>
          <TimeSelect value={start} onChange={setStart} />
        </div>
        <div>
          <div className="label mb-2">End</div>
          <TimeSelect
            value={end}
            onChange={setEnd}
            min={start + SLOT_MIN}
          />
        </div>
      </div>
      <div>
        <div className="label mb-2">Notes</div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
  min,
}: {
  value: number;
  onChange: (m: number) => void;
  min?: number;
}) {
  const opts: number[] = [];
  for (let m = 0; m < 24 * 60; m += 15) opts.push(m);
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="control no-zoom h-11 w-full px-3 outline-none accent-ring"
    >
      {opts.map((m) => {
        const disabled = min != null && m < min;
        return (
          <option key={m} value={m} disabled={disabled}>
            {minToHHMM(m)}
          </option>
        );
      })}
    </select>
  );
}

function PickGoalModal({
  open,
  onClose,
  time,
  onTimeChange,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  time: number | null;
  onTimeChange: (t: number) => void;
  onConfirm: (goal: { id: string; text: string; timeEstimateMin?: number }) => void;
}) {
  const today = todayStr();
  const goals = useUnscheduledGoals(today);
  const [selected, setSelected] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSelected(null);
      if (time == null) onTimeChange(9 * 60);
    }
  }, [open, time, onTimeChange]);

  if (!open) return null;
  const chosen = goals.find((g) => g.id === selected);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a goal"
      description="Pick an unscheduled goal and a time."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!chosen || time == null}
            onClick={() => chosen && onConfirm(chosen)}
          >
            Schedule
          </Button>
        </div>
      }
    >
      {goals.length === 0 ? (
        <div className="text-sm text-[var(--color-fg-2)] text-center py-6">
          No unscheduled goals right now.
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="label mb-2">Goal</div>
            <ul className="space-y-1.5 max-h-56 overflow-y-auto nice-scroll">
              {goals.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(g.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition",
                      selected === g.id
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-stroke)] bg-[var(--color-elevated)]"
                    )}
                  >
                    <div className="text-sm font-medium">
                      {g.emoji ? `${g.emoji} ` : ""}
                      {g.text}
                    </div>
                    {g.timeEstimateMin && (
                      <div className="text-[10px] text-[var(--color-fg-3)] mt-0.5">
                        {g.timeEstimateMin} min estimated
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label mb-2">Start time</div>
            <TimeSelect value={time ?? 9 * 60} onChange={onTimeChange} />
          </div>
        </div>
      )}
    </Modal>
  );
}
