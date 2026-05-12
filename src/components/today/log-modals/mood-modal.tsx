"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useStore } from "@/store";
import { haptic } from "@/lib/haptics";
import { useSelectedDate } from "../day-context";

const MOOD_EMOJI = [
  "😭",
  "😞",
  "😕",
  "😐",
  "🙂",
  "😊",
  "😄",
  "😁",
  "🤩",
  "🥳",
];

export function MoodLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const date = useSelectedDate();
  const log = useStore((s) => s.health[date]);
  const setHealth = useStore((s) => s.setHealth);

  const [val, setVal] = React.useState(log?.mood ?? 7);

  React.useEffect(() => {
    if (open) setVal(log?.mood ?? 7);
  }, [open, log]);

  const save = () => {
    setHealth(date, { mood: val });
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log mood"
      description="How are you feeling right now?"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="text-7xl text-center leading-none">
          {MOOD_EMOJI[val - 1] ?? "🙂"}
        </div>
        <div className="text-center text-2xl font-semibold tnum">
          {val}/10
        </div>
        <Slider
          value={val}
          min={1}
          max={10}
          step={1}
          onChange={setVal}
          marks={[1, 5, 10]}
        />
        <div className="grid grid-cols-10 gap-1">
          {MOOD_EMOJI.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setVal(i + 1)}
              className={
                "h-9 grid place-items-center rounded-md text-base transition " +
                (val === i + 1
                  ? "bg-[var(--color-accent-soft)] scale-110"
                  : "hover:bg-[var(--color-elevated)] opacity-70")
              }
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
