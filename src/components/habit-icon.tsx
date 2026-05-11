"use client";

import * as React from "react";
import {
  BookOpen,
  Brain,
  Moon,
  Droplet,
  Footprints,
  Sun,
  PenLine,
  Dumbbell,
  Wind,
  Smartphone,
  Leaf,
  Snowflake,
  Heart,
  Target,
} from "lucide-react";
import type { HabitIcon as HI } from "@/lib/types";

const MAP: Record<HI, React.ComponentType<{ size?: number; className?: string }>> = {
  book: BookOpen,
  brain: Brain,
  moon: Moon,
  droplet: Droplet,
  footprints: Footprints,
  sun: Sun,
  pen: PenLine,
  dumbbell: Dumbbell,
  wind: Wind,
  "no-phone": Smartphone,
  leaf: Leaf,
  snowflake: Snowflake,
  heart: Heart,
  target: Target,
};

export function HabitGlyph({
  name,
  size = 18,
  className,
}: {
  name: HI;
  size?: number;
  className?: string;
}) {
  const C = MAP[name] ?? Target;
  return <C size={size} className={className} />;
}

export const HABIT_ICON_NAMES: HI[] = [
  "book",
  "brain",
  "moon",
  "droplet",
  "footprints",
  "sun",
  "pen",
  "dumbbell",
  "wind",
  "no-phone",
  "leaf",
  "snowflake",
  "heart",
  "target",
];
