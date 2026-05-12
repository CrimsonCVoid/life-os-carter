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
  /** Set when this goal was auto-generated from a RecurringGoal template. */
  recurringGoalId?: string;
};

/* ---------- RECURRING GOALS ---------- */

export type RecurrencePattern =
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "weekly_count"
  | "biweekly"
  | "monthly"
  | "custom";

export type RecurringGoal = {
  id: string;
  text: string;
  emoji?: string;
  priority: Priority;
  category?: string;
  timeEstimateMin?: number;
  pattern: RecurrencePattern;
  /** 0=Sun..6=Sat. Used for weekly/biweekly. */
  daysOfWeek?: number[];
  /** 1-31. Used for monthly (unless monthlyLastDay is true). */
  dayOfMonth?: number;
  /** When true, monthly recurrence falls on the last day of each month. */
  monthlyLastDay?: boolean;
  /** Used for custom — every N days from startDate. N >= 1. */
  intervalDays?: number;
  /** Used for weekly_count — target completions per calendar week. N >= 1. */
  weeklyTimes?: number;
  startDate: DateStr;
  active: boolean;
  createdAt: string;
};

export type RecurringGoalGenerationStatus = "generated" | "skipped";

export type RecurringGoalGeneration = {
  recurringGoalId: string;
  date: DateStr;
  /** Empty string when status is "skipped" before any goal existed. */
  generatedGoalId: string;
  status: RecurringGoalGenerationStatus;
};

export const RECURRENCE_PATTERN_LABELS: Record<RecurrencePattern, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  weekly: "Weekly · pick days",
  weekly_count: "Weekly · X times",
  biweekly: "Biweekly",
  monthly: "Monthly",
  custom: "Every N days",
};

export const RECURRENCE_PATTERNS: RecurrencePattern[] = [
  "daily",
  "weekdays",
  "weekends",
  "weekly",
  "weekly_count",
  "biweekly",
  "monthly",
  "custom",
];

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

/* ---------- GYM (RepCount-style logging) ---------- */

export type LiftSet = {
  weight: number; // lb (0 means bodyweight)
  reps: number;
  order: number;
};

export type LiftExercise = {
  id: string;
  name: string;
  /** Lowercased + trimmed name for matching across sessions. */
  normalizedName: string;
  sets: LiftSet[];
};

export type LiftSession = {
  id: string;
  date: DateStr;
  exercises: LiftExercise[];
  createdAt: string;
  /** Raw paste text, for re-edit / debug. */
  raw?: string;
};

/**
 * Workout type was originally a narrow union but the Gym page lets users
 * pick from dayTypePresets (or type their own), so we treat this as an
 * open string. Common presets: Push, Pull, Legs, Cardio, Yoga, Other.
 */
export type WorkoutType = string;

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
  /** Wake-up time as "HH:MM" 24h. Bedtime is derived = wakeTime - sleepHours. */
  wakeTime?: string;
  mood?: number; // 1..10
  /** Legacy single-value energy. Kept for backward-compat; new code reads
   * from EnergyLog (`store.energy[date]`). */
  energy?: number;
  waterOz?: number; // always stored in oz; display converted
  weight?: number; // always stored in lb; display converted
  steps?: number;
};

/* ---------- TIME BLOCKING ---------- */

export type BlockType =
  | "goal"
  | "workout"
  | "meal"
  | "focus"
  | "meeting"
  | "rest"
  | "other";

export type Block = {
  id: string;
  date: DateStr;
  startMin: number; // minutes since midnight
  endMin: number;
  type: BlockType;
  title: string;
  icon?: string;
  notes?: string;
  goalId?: string;
  createdAt: string;
};

export const BLOCK_COLORS: Record<BlockType, { bg: string; fg: string; ring: string }> = {
  goal: { bg: "var(--color-accent-soft)", fg: "var(--color-accent)", ring: "color-mix(in srgb, var(--color-accent) 32%, transparent)" },
  workout: { bg: "color-mix(in srgb, #34D399 14%, transparent)", fg: "#34D399", ring: "color-mix(in srgb, #34D399 32%, transparent)" },
  meal: { bg: "color-mix(in srgb, #FBBF24 14%, transparent)", fg: "#FBBF24", ring: "color-mix(in srgb, #FBBF24 32%, transparent)" },
  focus: { bg: "color-mix(in srgb, #818CF8 14%, transparent)", fg: "#A5B4FC", ring: "color-mix(in srgb, #818CF8 32%, transparent)" },
  meeting: { bg: "color-mix(in srgb, #FB7185 14%, transparent)", fg: "#FB7185", ring: "color-mix(in srgb, #FB7185 32%, transparent)" },
  rest: { bg: "var(--color-elevated)", fg: "var(--color-fg-3)", ring: "var(--color-stroke-strong)" },
  other: { bg: "var(--color-elevated)", fg: "var(--color-fg-2)", ring: "var(--color-stroke-strong)" },
};

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  goal: "Goal",
  workout: "Workout",
  meal: "Meal",
  focus: "Focus",
  meeting: "Meeting",
  rest: "Rest",
  other: "Other",
};

/* ---------- ENERGY CURVE ---------- */

export type EnergyPeriod = "morning" | "midday" | "afternoon" | "evening";

export const ENERGY_PERIODS: EnergyPeriod[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
];

export const ENERGY_PERIOD_LABELS: Record<EnergyPeriod, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** Period bounds in [startHour, endHour). Used to bucket timestamps. */
export const ENERGY_PERIOD_RANGES: Record<EnergyPeriod, [number, number]> = {
  morning: [5, 11],
  midday: [11, 15],
  afternoon: [15, 19],
  evening: [19, 24],
};

export type EnergyLog = {
  date: DateStr;
  values: Partial<Record<EnergyPeriod, number>>; // 1..10
};

/* ---------- NUTRITION ---------- */

export type MealAiAnalysis = {
  overallConfidence: "high" | "medium" | "low";
  identifiedItems: Array<{ name: string; estimatedGrams: number }>;
  notes: string;
};

export type Meal = {
  id: string;
  date: DateStr;
  time: string; // "HH:MM"
  name?: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  /** Set when this meal originated from a SavedMeal chip tap. */
  savedMealId?: string;
  /** IndexedDB key for the full-resolution photo (life-os-meal-photos). */
  photoId?: string;
  /** Inline base64 thumbnail for fast list rendering (~80px wide). */
  thumbnailDataUrl?: string;
  /** AI analysis metadata if this meal was logged via the photo flow. */
  aiAnalysis?: MealAiAnalysis;
  createdAt: string;
};

export type SavedMeal = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  /** Number of times this favorite has been logged. Used to sort chips. */
  useCount: number;
};

export type NutritionTargets = {
  enabled: boolean;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

export type PhotoFoodSettings = {
  saveMealPhotos: boolean;
  autoFillName: boolean;
  seenTooltip: boolean;
};

export const DEFAULT_PHOTO_FOOD_SETTINGS: PhotoFoodSettings = {
  saveMealPhotos: true,
  autoFillName: true,
  seenTooltip: false,
};

/* ---------- INSIGHTS (pattern detection) ---------- */

export type PatternTone = "positive" | "neutral" | "nudge";

export type PatternInsight = {
  headline: string;
  /** Lowercased + stripped fingerprint, used for dismiss tracking. */
  fingerprint: string;
  /** Metric key from metric-colors.ts when one fits, used for card tint. */
  metric?: string;
  /** Inline data point — e.g. "6.4 avg" / "3 of 7 days". */
  dataPoint?: string;
  tone: PatternTone;
};

export type CachedPatterns = {
  /** Date string for the day this batch was generated. */
  date: DateStr;
  patterns: PatternInsight[];
  /** Which pattern in the batch is currently surfaced. */
  currentIndex: number;
};

export type DismissedPattern = {
  fingerprint: string;
  headline: string;
  dismissedAt: string;
};

export type InsightsFrequency = "daily" | "every-3" | "weekly";

export type InsightsSettings = {
  enabled: boolean;
  frequency: InsightsFrequency;
};

export const DEFAULT_INSIGHTS_SETTINGS: InsightsSettings = {
  enabled: true,
  frequency: "daily",
};

/* ---------- WEEKLY REVIEW ---------- */

export type WeeklyReviewData = {
  weekStart: DateStr; // Sunday
  weekEnd: DateStr;
  summary: string;
  wins: string[];
  struggles: string[];
  trends: string[];
  nextWeekPriorities: string[];
  generatedAt: string;
  dismissed?: boolean;
  /** True once the user has written this review to the journal. */
  savedToJournal?: boolean;
};

export type WeeklyReviewSettings = {
  enabled: boolean;
  triggerDay: number; // 0=Sun..6=Sat
  triggerHour: number; // 0..23 (local)
};

export const DEFAULT_WEEKLY_REVIEW_SETTINGS: WeeklyReviewSettings = {
  enabled: true,
  triggerDay: 0, // Sunday
  triggerHour: 19, // 7pm
};

/* ---------- DAY NAVIGATION ---------- */

export type DayNavigationSettings = {
  daysBack: number; // 7..365
  daysForward: number; // 0..30
  swipeEnabled: boolean;
};

export const DEFAULT_DAY_NAVIGATION_SETTINGS: DayNavigationSettings = {
  daysBack: 30,
  daysForward: 7,
  swipeEnabled: true,
};

/* ---------- BODY ---------- */

export type BodyMeasurement = {
  id: string;
  date: DateStr;
  weight?: number; // stored in lb
  chest?: number; // inches (legacy — no longer surfaced in UI)
  waist?: number;
  hips?: number;
  bicep?: number;
  thigh?: number;
  bodyFatPct?: number;
  notes?: string;
  /** Optional IndexedDB key for an attached photo in life-os-photos. */
  photoIdbKey?: string;
  createdAt: string;
};

export type PhotoAngle = "front" | "side" | "back";

export const PHOTO_ANGLES: PhotoAngle[] = ["front", "side", "back"];

export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

export type PhotoMeta = {
  id: string;
  date: DateStr;
  angle: PhotoAngle;
  weightAtTime?: number;
  /** IndexedDB blob store key. */
  idbKey: string;
  createdAt: string;
};


export type JournalSource =
  | "manual"
  | "reflection"
  | "overseer"
  | "voice"
  | "weekly-review";

export type JournalEntry = {
  id: string;
  date: DateStr;
  mood?: number;
  energy?: number;
  text: string;
  tags: string[];
  source: JournalSource;
  createdAt: string;
  /** Voice entries: 1-3 sentence AI summary. */
  summary?: string;
  /** Voice entries: dominant emotion word (e.g. "energetic", "anxious"). */
  moodWord?: string;
  /** Voice entries: key into the IndexedDB audio blob store. */
  audioId?: string;
};

export type VoiceJournalSettings = {
  saveRecordings: boolean;
  autoCheckTodos: boolean;
  autoLogMood: boolean;
};

export const DEFAULT_VOICE_JOURNAL_SETTINGS: VoiceJournalSettings = {
  saveRecordings: false,
  autoCheckTodos: true,
  autoLogMood: true,
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

export type MorningRoutineEntry = {
  completed: boolean;
  completedAt?: string; // ISO datetime
};

export type MorningRoutineItem = {
  id: string;
  name: string;
  icon: string; // emoji
  order: number;
  history: Record<DateStr, MorningRoutineEntry>;
};

export type MorningRoutineSettings = {
  showOnTodayScreen: boolean;
  autoCollapseWhenDone: boolean;
  showStreak: boolean;
};

/* ---------- EVENING ROUTINE ---------- */

export type EveningRoutineEntry = MorningRoutineEntry;

export type EveningRoutineItem = {
  id: string;
  name: string;
  icon: string;
  order: number;
  history: Record<DateStr, EveningRoutineEntry>;
};

export type EveningRoutineSettings = MorningRoutineSettings;

export const DEFAULT_EVENING_ROUTINE: Array<{ name: string; icon: string }> = [
  { name: "No screens 20 min before bed", icon: "" },
  { name: "Read 15 min", icon: "" },
  { name: "Magnesium", icon: "" },
  { name: "Set tomorrow's goals", icon: "" },
  { name: "Lights out by target time", icon: "" },
];

export const DEFAULT_EVENING_ROUTINE_SETTINGS: EveningRoutineSettings = {
  showOnTodayScreen: true,
  autoCollapseWhenDone: true,
  showStreak: true,
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
  morningRoutine: MorningRoutineSettings;
  routineSeeded: boolean;
  eveningRoutine: EveningRoutineSettings;
  eveningRoutineSeeded: boolean;
  nutrition: NutritionTargets;
  showNutritionOnToday: boolean;
  voiceJournal: VoiceJournalSettings;
  showRecurringIcon: boolean;
  photoFood: PhotoFoodSettings;
  insights: InsightsSettings;
  weeklyReview: WeeklyReviewSettings;
  dayNavigation: DayNavigationSettings;
};

export const DEFAULT_MORNING_ROUTINE: Array<{ name: string; icon: string }> = [
  { name: "Make the bed", icon: "" },
  { name: "No phone for first 30 min", icon: "" },
  { name: "Morning sunlight — 10 min", icon: "" },
  { name: "No coffee for first 30 min", icon: "" },
  { name: "Morning stretches — 5 min", icon: "" },
  { name: "Creatine 10g", icon: "" },
  { name: "Vitamins", icon: "" },
  { name: "Set top 3 priorities for today", icon: "" },
];

export const DEFAULT_MORNING_ROUTINE_SETTINGS: MorningRoutineSettings = {
  showOnTodayScreen: true,
  autoCollapseWhenDone: true,
  showStreak: true,
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
