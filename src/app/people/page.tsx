"use client";

import * as React from "react";
import { ArrowUpDown, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Screen } from "@/components/screen";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/people/avatar";
import { useStore } from "@/store";
import {
  daysSinceLastContact,
  personStatus,
  usePeopleRaw,
} from "@/store/selectors";
import {
  FREQUENCY_PRESETS,
  PEOPLE_RELATIONSHIP_PRESETS,
  Person,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

type SortMode = "overdue" | "name" | "recent";

export default function PeoplePage() {
  const people = usePeopleRaw();
  const removePerson = useStore((s) => s.removePerson);
  const [addOpen, setAddOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Person | null>(null);
  const [sort, setSort] = React.useState<SortMode>("overdue");

  const sorted = React.useMemo(() => {
    const arr = [...people];
    const now = new Date();
    if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "recent")
      arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else
      arr.sort((a, b) => {
        const aDays = daysSinceLastContact(a, now) - a.frequencyDays;
        const bDays = daysSinceLastContact(b, now) - b.frequencyDays;
        return bDays - aDays;
      });
    return arr;
  }, [people, sort]);

  return (
    <Screen title="People" subtitle="Keep the important relationships close.">
      <div className="flex items-center justify-between gap-2">
        <SortButton sort={sort} onChange={setSort} />
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus size={14} />
          Add person
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-sm text-[var(--color-fg-2)]">
            No one yet
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-2 text-xs text-[var(--color-accent)]"
          >
            Add your first →
          </button>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              onClick={() => setSelected(p)}
            />
          ))}
        </div>
      )}

      <AddPersonModal open={addOpen} onClose={() => setAddOpen(false)} />
      <PersonDetailModal
        person={selected}
        onClose={() => setSelected(null)}
        onDelete={() => {
          if (!selected) return;
          if (confirm(`Remove ${selected.name}?`)) {
            removePerson(selected.id);
            setSelected(null);
            haptic("warn");
          }
        }}
      />
    </Screen>
  );
}

function SortButton({
  sort,
  onChange,
}: {
  sort: SortMode;
  onChange: (s: SortMode) => void;
}) {
  const labels: Record<SortMode, string> = {
    overdue: "Overdue first",
    name: "Alphabetical",
    recent: "Recently added",
  };
  return (
    <button
      type="button"
      onClick={() =>
        onChange(
          sort === "overdue" ? "name" : sort === "name" ? "recent" : "overdue"
        )
      }
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[var(--color-stroke)] text-xs text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
    >
      <ArrowUpDown size={11} />
      {labels[sort]}
    </button>
  );
}

function PersonRow({
  person,
  onClick,
}: {
  person: Person;
  onClick: () => void;
}) {
  const now = new Date();
  const days = daysSinceLastContact(person, now);
  const status = personStatus(person, now);
  const last = person.history[0];

  const statusColor =
    status === "good"
      ? "text-[var(--color-success)]"
      : status === "due-soon"
        ? "text-[var(--color-warning)]"
        : "text-[var(--color-danger)]";

  const label = !last
    ? "No contact yet"
    : status === "overdue"
      ? `Overdue by ${days - person.frequencyDays}d`
      : days === 0
        ? "Today"
        : `${days}d ago`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full card p-3.5 flex items-center gap-3 card-hover text-left"
    >
      <Avatar name={person.name} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{person.name}</div>
        <div className="text-[11px] text-[var(--color-fg-3)] truncate">
          {person.relationship}
        </div>
      </div>
      <div className={cn("text-xs font-medium tnum", statusColor)}>
        {label}
      </div>
    </button>
  );
}

function AddPersonModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addPerson = useStore((s) => s.addPerson);
  const [name, setName] = React.useState("");
  const [relationship, setRelationship] = React.useState("Friend");
  const [frequencyDays, setFrequencyDays] = React.useState(14);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      setRelationship("Friend");
      setFrequencyDays(14);
      setNotes("");
    }
  }, [open]);

  const save = () => {
    if (!name.trim()) return;
    addPerson({
      name: name.trim(),
      relationship: relationship.trim() || "Other",
      frequencyDays,
      notes: notes.trim() || undefined,
    });
    haptic("success");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add person"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
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
            autoFocus
          />
        </div>
        <div>
          <div className="label mb-2">Relationship</div>
          <div className="flex flex-wrap gap-1.5">
            {PEOPLE_RELATIONSHIP_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRelationship(r)}
                className={cn(
                  "h-8 px-3 rounded-full border text-xs transition",
                  relationship === r
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Input
            className="mt-2"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Or type a custom one"
          />
        </div>
        <div>
          <div className="label mb-2">Reach out every</div>
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCY_PRESETS.map((f) => (
              <button
                key={f.days}
                type="button"
                onClick={() => setFrequencyDays(f.days)}
                className={cn(
                  "h-8 px-3 rounded-full border text-xs transition",
                  frequencyDays === f.days
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:color-mix(in_srgb,var(--color-accent)_24%,transparent)]"
                    : "border-[var(--color-stroke)] text-[var(--color-fg-2)]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            className="mt-2"
            type="number"
            inputMode="numeric"
            value={frequencyDays}
            onChange={(e) =>
              setFrequencyDays(parseInt(e.target.value, 10) || 7)
            }
            placeholder="Days"
          />
        </div>
        <div>
          <div className="label mb-2">Notes (optional)</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Birthday, kids' names, favorite topics…"
          />
        </div>
      </div>
    </Modal>
  );
}

function PersonDetailModal({
  person,
  onClose,
  onDelete,
}: {
  person: Person | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  const open = !!person;
  const updatePerson = useStore((s) => s.updatePerson);
  const logContact = useStore((s) => s.logContact);
  const removeContact = useStore((s) => s.removeContact);

  const [relationship, setRelationship] = React.useState("");
  const [frequencyDays, setFrequencyDays] = React.useState(14);
  const [notes, setNotes] = React.useState("");
  const [contactNote, setContactNote] = React.useState("");
  const [showNotePrompt, setShowNotePrompt] = React.useState(false);

  React.useEffect(() => {
    if (!person) return;
    setRelationship(person.relationship);
    setFrequencyDays(person.frequencyDays);
    setNotes(person.notes ?? "");
    setContactNote("");
    setShowNotePrompt(false);
  }, [person]);

  if (!open) return null;

  const persist = () => {
    updatePerson(person.id, {
      relationship: relationship.trim() || person.relationship,
      frequencyDays,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        persist();
        onClose();
      }}
      title={person.name}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 size={12} />
            Delete
          </Button>
          <Button
            onClick={() => {
              persist();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={person.name} size={56} />
          <div className="min-w-0">
            <div className="text-base font-semibold">{person.name}</div>
            <div className="text-xs text-[var(--color-fg-2)]">
              {person.relationship}
            </div>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => {
            logContact(person.id);
            haptic("success");
            setShowNotePrompt(true);
          }}
        >
          <MessageCircle size={14} />
          I reached out today
        </Button>

        {showNotePrompt && (
          <div className="rounded-xl border border-[var(--color-stroke)] bg-[var(--color-elevated)] p-3 space-y-2">
            <div className="label">Add a quick note</div>
            <Input
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              placeholder="What did you talk about?"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNotePrompt(false)}
              >
                Skip
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (contactNote.trim()) {
                    const last = person.history[0];
                    if (last) {
                      // attach note to the latest history entry
                      updatePerson(person.id, {
                        history: [
                          { ...last, note: contactNote.trim() },
                          ...person.history.slice(1),
                        ],
                      });
                    }
                  }
                  setContactNote("");
                  setShowNotePrompt(false);
                }}
              >
                Save note
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label mb-2">Relationship</div>
            <Input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            />
          </div>
          <div>
            <div className="label mb-2">Every (days)</div>
            <Input
              type="number"
              inputMode="numeric"
              value={frequencyDays}
              onChange={(e) =>
                setFrequencyDays(parseInt(e.target.value, 10) || 7)
              }
            />
          </div>
        </div>

        <div>
          <div className="label mb-2">Notes</div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {person.history.length > 0 && (
          <Card className="p-4">
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <ul className="space-y-1.5">
              {person.history.slice(0, 20).map((h) => (
                <li
                  key={h.id}
                  className="group flex items-start gap-2 text-sm"
                >
                  <span className="text-xs text-[var(--color-fg-3)] tnum w-24 shrink-0 pt-0.5">
                    {new Date(h.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="flex-1 text-[13px] text-[var(--color-fg-2)]">
                    {h.note || "Reached out"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeContact(person.id, h.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--color-fg-3)] hover:text-[var(--color-danger)] transition"
                    aria-label="Delete history entry"
                  >
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Modal>
  );
}
