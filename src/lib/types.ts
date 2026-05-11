// canonical date string: "YYYY-MM-DD"
export type DateStr = string;

export type Priority = "P1" | "P2" | "P3";

export type Units = {
  weight: "lb" | "kg";
  liquid: "oz" | "ml";
};

export type AccentColor = "violet" | "emerald" | "rose" | "amber";

export type DayType = string;

export type Goal = {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  emoji?: string;
  category?: string;
  timeEstimateMin?: number;
  date: DateStr;
  order: number;
};

export type HabitIcon =
  | "book"
  | "brain"
  | "moon"
  | "droplet"
  | "footprints"
  | "sun"
  | "pen"
  | "dumbbell"
  | "wind"
  | "no-phone"
  | "leaf"
  | "snowflake"
  | "heart"
  | "target";

export type Habit = {
  id: string;
  name: string;
  icon: HabitIcon;
  target?: number; // for trackable count-based habits, default 1
  history: Record<DateStr, boolean>;
  order: number;
  createdAt: string;
};

export type WorkoutType =
  | "Push"
  | "Pull"
  | "Legs"
  | "Cardio"
  | "Yoga"
  | "Other";

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight?: number; // in user's preferred units (lb/kg)
};

export type Workout = {
  id: string;
  date: DateStr;
  type: WorkoutType;
  durationMin: number;
  intensity: number; // 1..10
  notes?: string;
  exercises: Exercise[];
  createdAt: string;
};

export type HealthLog = {
  date: DateStr; // primary key
  sleepHours?: number;
  sleepQuality?: number; // 1..10
  mood?: number; // 1..10
  energy?: number; // 1..10
  waterOz?: number; // always stored in oz; display converted
  weight?: number; // always stored in lb; display converted
  steps?: number;
};

export type JournalSource = "manual" | "reflection" | "overseer";

export type JournalEntry = {
  id: string;
  date: DateStr;
  mood?: number;
  energy?: number;
  text: string;
  tags: string[];
  source: JournalSource;
  createdAt: string;
};

export type Day = {
  date: DateStr;
  dayType: DayType;
  scoreCache?: number;
  reminder?: string;
};

export type ListItem = {
  id: string;
  text: string;
  date: DateStr;
  order: number;
};

export type Plan = ListItem;
export type Win = ListItem;
export type Struggle = ListItem;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type CachedBriefing = {
  date: DateStr;
  text: string;
};

export type Settings = {
  units: Units;
  accent: AccentColor;
  dayTypePresets: string[];
  hasOnboarded: boolean;
  waterTargetOz: number;
  habitTemplates: Array<{ name: string; icon: HabitIcon }>;
  morningBriefing?: CachedBriefing;
  eveningSummary?: CachedBriefing;
};

export const DEFAULT_DAY_TYPES = [
  "Pull Day",
  "Push Day",
  "Leg Day",
  "Rest Day",
  "Recovery",
  "Deep Work",
  "Travel",
];

export const HABIT_TEMPLATES: Array<{ name: string; icon: HabitIcon }> = [
  { name: "Read 20 minutes", icon: "book" },
  { name: "Meditate", icon: "brain" },
  { name: "No phone after 10pm", icon: "no-phone" },
  { name: "Cold shower", icon: "snowflake" },
  { name: "Stretch", icon: "wind" },
  { name: "Walk outside", icon: "footprints" },
  { name: "Sunlight before noon", icon: "sun" },
  { name: "Journal", icon: "pen" },
  { name: "No alcohol", icon: "leaf" },
  { name: "Strength training", icon: "dumbbell" },
];
