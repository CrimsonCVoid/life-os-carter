"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import {
  EXERCISE_LIBRARY,
  MUSCLE_GROUPS,
  categoryToMuscleGroup,
  searchExercisesWithCustom,
  groupByMuscle,
  type LibraryExercise,
  type MuscleGroup,
} from "@/lib/exercise-library";
import type { CustomExerciseCatalog } from "@/store";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseName: string) => void;
  recentExercises?: string[];
  /** RepCount-imported exercises. Surfaced first in search and merged
   *  into the muscle-group browser. Premade library entries whose name
   *  collides with a custom one are hidden so the user's wording wins. */
  customCatalog?: CustomExerciseCatalog;
};

type ChipFilter = MuscleGroup | "All";

const ROW_MOTION_LIMIT = 8;

export function ExerciseLibraryPicker({
  open,
  onClose,
  onPick,
  recentExercises,
  customCatalog,
}: Props) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<ChipFilter>("All");

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setFilter("All");
    }
  }, [open]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  /** Project the imported catalog into LibraryExercise shape so it can
   *  flow through the same search / browse rendering paths as the
   *  premade library. Equipment is unknown for imported entries — we
   *  default to "other"; categories map via categoryToMuscleGroup. */
  const customLibrary = React.useMemo<LibraryExercise[]>(() => {
    if (!customCatalog) return [];
    return Object.values(customCatalog)
      .map((entry) => ({
        name: entry.name,
        muscleGroup: categoryToMuscleGroup(entry.category),
        equipment: "other" as const,
      }));
  }, [customCatalog]);

  const searchResults = React.useMemo<LibraryExercise[]>(
    () =>
      isSearching
        ? searchExercisesWithCustom(trimmedQuery, customLibrary, 50)
        : [],
    [isSearching, trimmedQuery, customLibrary]
  );

  const browseGrouped = React.useMemo<Map<MuscleGroup, LibraryExercise[]>>(() => {
    // Merge custom + premade for the muscle-group browse view. Hide
    // premade entries that the user already has a same-named custom for.
    const customNamesLc = new Set(
      customLibrary.map((e) => e.name.toLowerCase())
    );
    const premade = EXERCISE_LIBRARY.filter(
      (e) => !customNamesLc.has(e.name.toLowerCase())
    );
    const merged = [...customLibrary, ...premade];
    const pool =
      filter === "All"
        ? merged
        : merged.filter((e) => e.muscleGroup === filter);
    return groupByMuscle(pool);
  }, [filter, customLibrary]);

  const hasExactMatch = React.useMemo(() => {
    if (!isSearching) return true;
    const q = trimmedQuery.toLowerCase();
    if (EXERCISE_LIBRARY.some((e) => e.name.toLowerCase() === q)) return true;
    return customLibrary.some((e) => e.name.toLowerCase() === q);
  }, [isSearching, trimmedQuery, customLibrary]);

  const handlePick = React.useCallback(
    (name: string) => {
      haptic("tap");
      onPick(name);
      setQuery("");
      onClose();
    },
    [onPick, onClose]
  );

  const handleCustomPick = React.useCallback(() => {
    if (!isSearching) return;
    haptic("success");
    onPick(trimmedQuery);
    setQuery("");
    onClose();
  }, [isSearching, trimmedQuery, onPick, onClose]);

  let rowIndex = 0;
  const nextRowIndex = () => rowIndex++;

  return (
    <Modal open={open} onClose={onClose} title="Add exercise" size="lg">
      <div className="space-y-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          inputMode="search"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
        />

        {!isSearching && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              label="All"
              active={filter === "All"}
              onClick={() => {
                haptic("soft");
                setFilter("All");
              }}
            />
            {MUSCLE_GROUPS.map((g) => (
              <FilterChip
                key={g}
                label={g}
                active={filter === g}
                onClick={() => {
                  haptic("soft");
                  setFilter(g);
                }}
              />
            ))}
          </div>
        )}

        {!isSearching && recentExercises && recentExercises.length > 0 && (
          <div>
            <SectionHeader>Recent</SectionHeader>
            <div className="flex flex-wrap gap-1.5">
              {recentExercises.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handlePick(name)}
                  className={cn(
                    "h-8 px-3 rounded-full text-[12px] font-medium",
                    "bg-[var(--color-elevated)] text-[var(--color-fg)]",
                    "border border-[var(--color-stroke)]",
                    "active:scale-[0.97] transition-transform duration-[80ms]"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isSearching && (
          <div className="space-y-4">
            {Array.from(browseGrouped.entries()).map(([group, items]) => (
              <div key={group}>
                <SectionHeader>{group}</SectionHeader>
                <div className="flex flex-col">
                  {items.map((ex) => (
                    <ExerciseRow
                      key={`${group}-${ex.name}`}
                      ex={ex}
                      index={nextRowIndex()}
                      onPick={handlePick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {isSearching && (
          <div className="flex flex-col">
            {searchResults.length === 0 && (
              <div className="text-center text-[13px] text-[var(--color-fg-2)] py-4">
                No exercises matched
              </div>
            )}
            {searchResults.map((ex) => (
              <ExerciseRow
                key={`s-${ex.name}`}
                ex={ex}
                index={nextRowIndex()}
                onPick={handlePick}
              />
            ))}
            {!hasExactMatch && (
              <button
                type="button"
                onClick={handleCustomPick}
                className={cn(
                  "w-full h-12 px-3 mt-1 flex items-center justify-center",
                  "rounded-lg border-t border-[var(--color-stroke)]",
                  "text-[13px] font-medium text-[var(--color-accent)]",
                  "active:scale-[0.99] transition-transform duration-[80ms]"
                )}
              >
                + Use &quot;{trimmedQuery}&quot;
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-3)] font-medium mb-2 mt-1">
      {children}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-full text-[12px] font-medium",
        "active:scale-[0.97] transition-transform duration-[80ms]",
        active
          ? "bg-[var(--color-accent-strong)] text-white"
          : "bg-[var(--color-elevated)] text-[var(--color-fg-2)] border border-[var(--color-stroke)]"
      )}
    >
      {label}
    </button>
  );
}

function ExerciseRow({
  ex,
  index,
  onPick,
}: {
  ex: LibraryExercise;
  index: number;
  onPick: (name: string) => void;
}) {
  const meta = `${ex.equipment.toUpperCase()} · ${ex.muscleGroup.toUpperCase()}`;
  const rowContent = (
    <button
      type="button"
      onClick={() => onPick(ex.name)}
      className={cn(
        "w-full h-12 px-3 flex items-center justify-between gap-3",
        "rounded-lg active:bg-[var(--color-card-hover)]",
        "active:scale-[0.99] transition-transform duration-[80ms]"
      )}
    >
      <span className="text-[15px] font-medium text-[var(--color-fg)] truncate text-left">
        {ex.name}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-fg-3)] shrink-0">
        {meta}
      </span>
    </button>
  );

  if (index < ROW_MOTION_LIMIT) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: index * 0.02 }}
      >
        {rowContent}
      </motion.div>
    );
  }
  return rowContent;
}
