"use client";

import * as React from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ListItem } from "@/lib/types";
import { haptic } from "@/lib/haptics";

type BulletKind = "dot" | "plus" | "minus";

type Props = {
  title: string;
  placeholder: string;
  items: ListItem[];
  bullet: BulletKind;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  onItemClick?: (item: ListItem) => void;
  itemAction?: { icon: typeof Plus; label: string; onClick: (i: ListItem) => void };
  emptyText?: string;
};

const BULLET_COLOR: Record<BulletKind, string> = {
  dot: "var(--color-accent)",
  plus: "var(--color-success)",
  minus: "var(--color-danger)",
};
const BULLET_GLYPH: Record<BulletKind, string> = {
  dot: "•",
  plus: "+",
  minus: "−",
};

export function ListSection({
  title,
  placeholder,
  items,
  bullet,
  onAdd,
  onRemove,
  onUpdate,
  onItemClick,
  itemAction,
  emptyText,
}: Props) {
  const [draft, setDraft] = React.useState("");

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
    haptic("tap");
  };

  const ActionIcon = itemAction?.icon ?? ArrowRight;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-xs text-[var(--color-fg-3)] tnum">
          {items.length}
        </span>
      </CardHeader>

      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded-xl px-1.5 py-1"
          >
            <span
              aria-hidden
              className="w-5 text-center font-semibold leading-none"
              style={{ color: BULLET_COLOR[bullet] }}
            >
              {BULLET_GLYPH[bullet]}
            </span>
            <input
              value={item.text}
              onChange={(e) => onUpdate(item.id, e.target.value)}
              onClick={() => onItemClick?.(item)}
              className="flex-1 bg-transparent no-zoom text-[15px] outline-none placeholder:text-[var(--color-fg-3)] py-2 text-[var(--color-fg)]"
            />
            {itemAction && (
              <button
                type="button"
                onClick={() => itemAction.onClick(item)}
                aria-label={itemAction.label}
                title={itemAction.label}
                className="h-11 w-11 grid place-items-center rounded-lg text-[var(--color-fg-3)] hover:text-[var(--color-accent)] hover:bg-[var(--color-elevated)] transition"
              >
                <ActionIcon size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onRemove(item.id);
                haptic("warn");
              }}
              aria-label="Delete"
              className="h-11 w-11 grid place-items-center rounded-lg text-[var(--color-fg-3)] hover:text-[var(--color-danger)] hover:bg-[var(--color-elevated)] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {items.length === 0 && emptyText && (
          <li className="py-3 text-center text-xs text-[var(--color-fg-3)]">
            {emptyText}
          </li>
        )}
      </ul>

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
          placeholder={placeholder}
          className="control no-zoom flex-1 h-10 px-3 outline-none accent-ring placeholder:text-[var(--color-fg-3)]"
        />
        <button
          type="submit"
          aria-label="Add"
          disabled={!draft.trim()}
          className="h-10 w-10 grid place-items-center rounded-xl bg-[var(--color-elevated)] border border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)] active:scale-95 transition disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={2.4} />
        </button>
      </form>
    </Card>
  );
}
