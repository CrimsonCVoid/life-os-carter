export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Core"
  | "Cardio"
  | "Other";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell"
  | "other";

export type LibraryExercise = {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  aliases?: string[];
};

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Cardio",
  "Other",
];

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: "Barbell bench press", muscleGroup: "Chest", equipment: "barbell", aliases: ["Bench press", "Bench", "Flat bench"] },
  { name: "Incline barbell bench press", muscleGroup: "Chest", equipment: "barbell", aliases: ["Incline bench", "Incline press"] },
  { name: "Decline barbell bench press", muscleGroup: "Chest", equipment: "barbell", aliases: ["Decline bench"] },
  { name: "Dumbbell bench press", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["DB bench", "Flat dumbbell press"] },
  { name: "Incline dumbbell press", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["Incline DB press", "Incline dumbbell bench"] },
  { name: "Decline dumbbell press", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["Decline DB press"] },
  { name: "Dumbbell floor press", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["DB floor press"] },
  { name: "Dumbbell fly", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["DB fly", "Flat fly"] },
  { name: "Incline dumbbell fly", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["Incline fly"] },
  { name: "Decline dumbbell fly", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["Decline fly"] },
  { name: "Cable fly", muscleGroup: "Chest", equipment: "cable", aliases: ["Cable crossover", "Crossover"] },
  { name: "Low-to-high cable fly", muscleGroup: "Chest", equipment: "cable", aliases: ["Low cable fly"] },
  { name: "High-to-low cable fly", muscleGroup: "Chest", equipment: "cable", aliases: ["High cable fly"] },
  { name: "Cable chest press", muscleGroup: "Chest", equipment: "cable", aliases: ["Standing cable press"] },
  { name: "Machine chest press", muscleGroup: "Chest", equipment: "machine", aliases: ["Chest press machine"] },
  { name: "Incline machine press", muscleGroup: "Chest", equipment: "machine", aliases: ["Incline chest press machine"] },
  { name: "Hammer Strength chest press", muscleGroup: "Chest", equipment: "machine", aliases: ["Plate-loaded chest press"] },
  { name: "Pec deck", muscleGroup: "Chest", equipment: "machine", aliases: ["Machine fly", "Pec fly"] },
  { name: "Smith machine bench press", muscleGroup: "Chest", equipment: "machine", aliases: ["Smith bench"] },
  { name: "Smith machine incline press", muscleGroup: "Chest", equipment: "machine", aliases: ["Smith incline"] },
  { name: "Push-up", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Push up", "Pushup"] },
  { name: "Incline push-up", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Incline pushup"] },
  { name: "Decline push-up", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Decline pushup"] },
  { name: "Deficit push-up", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Deficit pushup"] },
  { name: "Archer push-up", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Archer pushup"] },
  { name: "Chest dip", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Dips", "Parallel bar dip"] },
  { name: "Weighted chest dip", muscleGroup: "Chest", equipment: "bodyweight", aliases: ["Weighted dip"] },
  { name: "Svend press", muscleGroup: "Chest", equipment: "dumbbell", aliases: ["Plate squeeze press"] },

  { name: "Pull-up", muscleGroup: "Back", equipment: "bodyweight", aliases: ["Pullup", "Pull up"] },
  { name: "Chin-up", muscleGroup: "Back", equipment: "bodyweight", aliases: ["Chinup", "Chin up"] },
  { name: "Weighted pull-up", muscleGroup: "Back", equipment: "bodyweight", aliases: ["Weighted pullup"] },
  { name: "Neutral-grip pull-up", muscleGroup: "Back", equipment: "bodyweight", aliases: ["Hammer-grip pull-up"] },
  { name: "Wide-grip pull-up", muscleGroup: "Back", equipment: "bodyweight", aliases: ["Wide pull-up"] },
  { name: "Lat pulldown", muscleGroup: "Back", equipment: "cable", aliases: ["Pulldown"] },
  { name: "Wide-grip lat pulldown", muscleGroup: "Back", equipment: "cable", aliases: ["Wide pulldown"] },
  { name: "Close-grip lat pulldown", muscleGroup: "Back", equipment: "cable", aliases: ["Close-grip pulldown"] },
  { name: "Neutral-grip lat pulldown", muscleGroup: "Back", equipment: "cable", aliases: ["V-bar pulldown"] },
  { name: "Straight-arm pulldown", muscleGroup: "Back", equipment: "cable", aliases: ["Straight arm pulldown"] },
  { name: "Barbell row", muscleGroup: "Back", equipment: "barbell", aliases: ["Bent-over row", "BB row"] },
  { name: "Pendlay row", muscleGroup: "Back", equipment: "barbell", aliases: ["Dead-stop row"] },
  { name: "Yates row", muscleGroup: "Back", equipment: "barbell", aliases: ["Underhand barbell row"] },
  { name: "T-bar row", muscleGroup: "Back", equipment: "barbell", aliases: ["T bar row"] },
  { name: "Chest-supported T-bar row", muscleGroup: "Back", equipment: "machine", aliases: ["Chest-supported row"] },
  { name: "Dumbbell row", muscleGroup: "Back", equipment: "dumbbell", aliases: ["Single-arm DB row", "One-arm dumbbell row"] },
  { name: "Chest-supported dumbbell row", muscleGroup: "Back", equipment: "dumbbell", aliases: ["Incline DB row"] },
  { name: "Seal row", muscleGroup: "Back", equipment: "barbell", aliases: ["Prone bench row"] },
  { name: "Seated cable row", muscleGroup: "Back", equipment: "cable", aliases: ["Cable row"] },
  { name: "Single-arm cable row", muscleGroup: "Back", equipment: "cable", aliases: ["One-arm cable row"] },
  { name: "Inverted row", muscleGroup: "Back", equipment: "bodyweight", aliases: ["Australian pull-up", "Bodyweight row"] },
  { name: "Machine row", muscleGroup: "Back", equipment: "machine", aliases: ["Plate-loaded row"] },
  { name: "Conventional deadlift", muscleGroup: "Back", equipment: "barbell", aliases: ["Deadlift", "DL"] },
  { name: "Sumo deadlift", muscleGroup: "Back", equipment: "barbell", aliases: ["Sumo DL"] },
  { name: "Trap-bar deadlift", muscleGroup: "Back", equipment: "barbell", aliases: ["Hex-bar deadlift"] },
  { name: "Rack pull", muscleGroup: "Back", equipment: "barbell", aliases: ["Block pull"] },
  { name: "Snatch-grip deadlift", muscleGroup: "Back", equipment: "barbell", aliases: ["Snatch grip DL"] },
  { name: "Barbell shrug", muscleGroup: "Back", equipment: "barbell", aliases: ["BB shrug"] },
  { name: "Dumbbell shrug", muscleGroup: "Back", equipment: "dumbbell", aliases: ["DB shrug"] },
  { name: "Cable shrug", muscleGroup: "Back", equipment: "cable", aliases: ["Cable trap shrug"] },
  { name: "Face pull", muscleGroup: "Back", equipment: "cable", aliases: ["Rope face pull"] },

  { name: "Overhead press", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["OHP", "Standing press", "Military press"] },
  { name: "Seated barbell overhead press", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["Seated OHP"] },
  { name: "Push press", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["BB push press"] },
  { name: "Behind-the-neck press", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["BTN press"] },
  { name: "Dumbbell shoulder press", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["DB shoulder press", "Seated DB press"] },
  { name: "Arnold press", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["Arnold"] },
  { name: "Single-arm dumbbell press", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["One-arm DB press"] },
  { name: "Machine shoulder press", muscleGroup: "Shoulders", equipment: "machine", aliases: ["Shoulder press machine"] },
  { name: "Smith machine overhead press", muscleGroup: "Shoulders", equipment: "machine", aliases: ["Smith OHP"] },
  { name: "Landmine press", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["Landmine shoulder press"] },
  { name: "Dumbbell lateral raise", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["Side raise", "Lateral raise"] },
  { name: "Cable lateral raise", muscleGroup: "Shoulders", equipment: "cable", aliases: ["Cable side raise"] },
  { name: "Machine lateral raise", muscleGroup: "Shoulders", equipment: "machine", aliases: ["Lateral raise machine"] },
  { name: "Leaning lateral raise", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["Lean-away lateral"] },
  { name: "Dumbbell front raise", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["Front raise"] },
  { name: "Plate front raise", muscleGroup: "Shoulders", equipment: "other", aliases: ["Plate raise"] },
  { name: "Cable front raise", muscleGroup: "Shoulders", equipment: "cable", aliases: ["Front cable raise"] },
  { name: "Barbell front raise", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["BB front raise"] },
  { name: "Reverse pec deck", muscleGroup: "Shoulders", equipment: "machine", aliases: ["Rear delt machine", "Reverse fly machine"] },
  { name: "Bent-over reverse fly", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["Rear delt fly", "DB reverse fly"] },
  { name: "Cable reverse fly", muscleGroup: "Shoulders", equipment: "cable", aliases: ["Cable rear delt fly"] },
  { name: "Face pull (rope)", muscleGroup: "Shoulders", equipment: "cable", aliases: ["Rope face pull"] },
  { name: "Upright row", muscleGroup: "Shoulders", equipment: "barbell", aliases: ["BB upright row"] },
  { name: "Dumbbell upright row", muscleGroup: "Shoulders", equipment: "dumbbell", aliases: ["DB upright row"] },
  { name: "Cable upright row", muscleGroup: "Shoulders", equipment: "cable" },

  { name: "Barbell curl", muscleGroup: "Biceps", equipment: "barbell", aliases: ["BB curl"] },
  { name: "EZ-bar curl", muscleGroup: "Biceps", equipment: "barbell", aliases: ["EZ curl"] },
  { name: "Dumbbell curl", muscleGroup: "Biceps", equipment: "dumbbell", aliases: ["DB curl", "Bicep curl"] },
  { name: "Incline dumbbell curl", muscleGroup: "Biceps", equipment: "dumbbell", aliases: ["Incline DB curl"] },
  { name: "Hammer curl", muscleGroup: "Biceps", equipment: "dumbbell", aliases: ["DB hammer curl"] },
  { name: "Cross-body hammer curl", muscleGroup: "Biceps", equipment: "dumbbell", aliases: ["Crossbody hammer curl"] },
  { name: "Preacher curl", muscleGroup: "Biceps", equipment: "barbell", aliases: ["BB preacher curl"] },
  { name: "Dumbbell preacher curl", muscleGroup: "Biceps", equipment: "dumbbell", aliases: ["DB preacher"] },
  { name: "Machine preacher curl", muscleGroup: "Biceps", equipment: "machine", aliases: ["Preacher machine"] },
  { name: "Concentration curl", muscleGroup: "Biceps", equipment: "dumbbell" },
  { name: "Cable curl", muscleGroup: "Biceps", equipment: "cable", aliases: ["Bar cable curl"] },
  { name: "Rope hammer curl", muscleGroup: "Biceps", equipment: "cable", aliases: ["Cable rope curl"] },
  { name: "Spider curl", muscleGroup: "Biceps", equipment: "dumbbell" },
  { name: "Zottman curl", muscleGroup: "Biceps", equipment: "dumbbell" },
  { name: "Reverse curl", muscleGroup: "Biceps", equipment: "barbell", aliases: ["Overhand curl"] },

  { name: "Triceps pushdown", muscleGroup: "Triceps", equipment: "cable", aliases: ["Cable pushdown", "Pushdown"] },
  { name: "Rope pushdown", muscleGroup: "Triceps", equipment: "cable", aliases: ["Rope triceps pushdown"] },
  { name: "V-bar pushdown", muscleGroup: "Triceps", equipment: "cable", aliases: ["V bar pushdown"] },
  { name: "Overhead cable extension", muscleGroup: "Triceps", equipment: "cable", aliases: ["Overhead triceps extension", "Cable overhead extension"] },
  { name: "Skullcrusher", muscleGroup: "Triceps", equipment: "barbell", aliases: ["Lying triceps extension", "Skull crusher"] },
  { name: "Dumbbell skullcrusher", muscleGroup: "Triceps", equipment: "dumbbell", aliases: ["DB skullcrusher"] },
  { name: "Dumbbell overhead extension", muscleGroup: "Triceps", equipment: "dumbbell", aliases: ["DB overhead triceps extension"] },
  { name: "Single-arm dumbbell extension", muscleGroup: "Triceps", equipment: "dumbbell", aliases: ["One-arm DB triceps extension"] },
  { name: "Close-grip bench press", muscleGroup: "Triceps", equipment: "barbell", aliases: ["CGBP"] },
  { name: "Triceps dip", muscleGroup: "Triceps", equipment: "bodyweight", aliases: ["Bench dip"] },
  { name: "Weighted triceps dip", muscleGroup: "Triceps", equipment: "bodyweight", aliases: ["Weighted dip (triceps)"] },
  { name: "Diamond push-up", muscleGroup: "Triceps", equipment: "bodyweight", aliases: ["Close-hand push-up"] },
  { name: "Kickback", muscleGroup: "Triceps", equipment: "dumbbell", aliases: ["Triceps kickback"] },
  { name: "Cable kickback", muscleGroup: "Triceps", equipment: "cable" },
  { name: "Machine triceps extension", muscleGroup: "Triceps", equipment: "machine", aliases: ["Triceps machine"] },

  { name: "Back squat", muscleGroup: "Quads", equipment: "barbell", aliases: ["Barbell back squat", "Squat"] },
  { name: "Front squat", muscleGroup: "Quads", equipment: "barbell", aliases: ["BB front squat"] },
  { name: "High-bar back squat", muscleGroup: "Quads", equipment: "barbell", aliases: ["High bar squat"] },
  { name: "Low-bar back squat", muscleGroup: "Quads", equipment: "barbell", aliases: ["Low bar squat"] },
  { name: "Pause squat", muscleGroup: "Quads", equipment: "barbell" },
  { name: "Box squat", muscleGroup: "Quads", equipment: "barbell" },
  { name: "Safety bar squat", muscleGroup: "Quads", equipment: "barbell", aliases: ["SSB squat"] },
  { name: "Zercher squat", muscleGroup: "Quads", equipment: "barbell" },
  { name: "Overhead squat", muscleGroup: "Quads", equipment: "barbell", aliases: ["OHS"] },
  { name: "Goblet squat", muscleGroup: "Quads", equipment: "dumbbell" },
  { name: "Dumbbell front squat", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["DB front squat"] },
  { name: "Bulgarian split squat", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["BSS", "Rear-foot elevated split squat"] },
  { name: "Split squat", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["Static lunge"] },
  { name: "Walking lunge", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["DB walking lunge"] },
  { name: "Reverse lunge", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["DB reverse lunge"] },
  { name: "Forward lunge", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["DB forward lunge"] },
  { name: "Curtsy lunge", muscleGroup: "Quads", equipment: "dumbbell" },
  { name: "Step-up", muscleGroup: "Quads", equipment: "dumbbell", aliases: ["DB step-up", "Step up"] },
  { name: "Weighted step-up", muscleGroup: "Quads", equipment: "dumbbell" },
  { name: "Pistol squat", muscleGroup: "Quads", equipment: "bodyweight", aliases: ["Single-leg squat"] },
  { name: "Sissy squat", muscleGroup: "Quads", equipment: "bodyweight" },
  { name: "Leg press", muscleGroup: "Quads", equipment: "machine", aliases: ["45-degree leg press"] },
  { name: "Single-leg press", muscleGroup: "Quads", equipment: "machine", aliases: ["One-leg press"] },
  { name: "Hack squat", muscleGroup: "Quads", equipment: "machine" },
  { name: "Reverse hack squat", muscleGroup: "Quads", equipment: "machine" },
  { name: "Pendulum squat", muscleGroup: "Quads", equipment: "machine" },
  { name: "Smith machine squat", muscleGroup: "Quads", equipment: "machine", aliases: ["Smith squat"] },
  { name: "Leg extension", muscleGroup: "Quads", equipment: "machine", aliases: ["Quad extension"] },
  { name: "Single-leg extension", muscleGroup: "Quads", equipment: "machine", aliases: ["One-leg extension"] },
  { name: "Belt squat", muscleGroup: "Quads", equipment: "machine" },

  { name: "Romanian deadlift", muscleGroup: "Hamstrings", equipment: "barbell", aliases: ["RDL"] },
  { name: "Dumbbell Romanian deadlift", muscleGroup: "Hamstrings", equipment: "dumbbell", aliases: ["DB RDL"] },
  { name: "Stiff-leg deadlift", muscleGroup: "Hamstrings", equipment: "barbell", aliases: ["SLDL"] },
  { name: "Single-leg Romanian deadlift", muscleGroup: "Hamstrings", equipment: "dumbbell", aliases: ["Single-leg RDL", "SLRDL"] },
  { name: "Good morning", muscleGroup: "Hamstrings", equipment: "barbell", aliases: ["BB good morning"] },
  { name: "Seated leg curl", muscleGroup: "Hamstrings", equipment: "machine" },
  { name: "Lying leg curl", muscleGroup: "Hamstrings", equipment: "machine" },
  { name: "Standing leg curl", muscleGroup: "Hamstrings", equipment: "machine" },
  { name: "Nordic curl", muscleGroup: "Hamstrings", equipment: "bodyweight", aliases: ["Nordic hamstring curl"] },
  { name: "Glute-ham raise", muscleGroup: "Hamstrings", equipment: "machine", aliases: ["GHR"] },
  { name: "Cable pull-through", muscleGroup: "Hamstrings", equipment: "cable", aliases: ["Pull through"] },
  { name: "Kettlebell swing", muscleGroup: "Hamstrings", equipment: "kettlebell", aliases: ["KB swing"] },
  { name: "Slider hamstring curl", muscleGroup: "Hamstrings", equipment: "bodyweight", aliases: ["Slide curl"] },
  { name: "Stability ball hamstring curl", muscleGroup: "Hamstrings", equipment: "bodyweight", aliases: ["Swiss ball hamstring curl"] },
  { name: "Glute-ham raise (machine)", muscleGroup: "Hamstrings", equipment: "machine", aliases: ["GHR machine"] },

  { name: "Barbell hip thrust", muscleGroup: "Glutes", equipment: "barbell", aliases: ["Hip thrust", "BB hip thrust"] },
  { name: "Single-leg hip thrust", muscleGroup: "Glutes", equipment: "bodyweight", aliases: ["One-leg hip thrust"] },
  { name: "Glute bridge", muscleGroup: "Glutes", equipment: "bodyweight" },
  { name: "Barbell glute bridge", muscleGroup: "Glutes", equipment: "barbell", aliases: ["BB glute bridge"] },
  { name: "Cable glute kickback", muscleGroup: "Glutes", equipment: "cable", aliases: ["Cable kickback (glute)"] },
  { name: "Machine glute kickback", muscleGroup: "Glutes", equipment: "machine", aliases: ["Glute kickback machine"] },
  { name: "Hip abduction machine", muscleGroup: "Glutes", equipment: "machine", aliases: ["Abductor machine"] },
  { name: "Standing cable abduction", muscleGroup: "Glutes", equipment: "cable", aliases: ["Cable hip abduction"] },
  { name: "Banded clamshell", muscleGroup: "Glutes", equipment: "bodyweight", aliases: ["Clamshell"] },
  { name: "Banded lateral walk", muscleGroup: "Glutes", equipment: "bodyweight", aliases: ["Monster walk"] },
  { name: "Frog pump", muscleGroup: "Glutes", equipment: "bodyweight" },
  { name: "B-stance hip thrust", muscleGroup: "Glutes", equipment: "barbell", aliases: ["Staggered hip thrust"] },
  { name: "Smith machine hip thrust", muscleGroup: "Glutes", equipment: "machine" },
  { name: "Machine hip thrust", muscleGroup: "Glutes", equipment: "machine", aliases: ["Glute drive"] },
  { name: "Glute-focused back extension", muscleGroup: "Glutes", equipment: "machine", aliases: ["45-degree hyper", "Hyperextension"] },

  { name: "Standing calf raise", muscleGroup: "Calves", equipment: "machine" },
  { name: "Seated calf raise", muscleGroup: "Calves", equipment: "machine" },
  { name: "Donkey calf raise", muscleGroup: "Calves", equipment: "machine" },
  { name: "Smith machine calf raise", muscleGroup: "Calves", equipment: "machine" },
  { name: "Leg press calf raise", muscleGroup: "Calves", equipment: "machine", aliases: ["Calf press on leg press"] },
  { name: "Dumbbell calf raise", muscleGroup: "Calves", equipment: "dumbbell", aliases: ["DB calf raise"] },
  { name: "Single-leg calf raise", muscleGroup: "Calves", equipment: "bodyweight", aliases: ["One-leg calf raise"] },
  { name: "Tibialis raise", muscleGroup: "Calves", equipment: "bodyweight", aliases: ["Tib raise"] },

  { name: "Plank", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Front plank"] },
  { name: "Side plank", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Plank with shoulder tap", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Shoulder tap"] },
  { name: "Long-lever plank", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Crunch", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Floor crunch"] },
  { name: "Reverse crunch", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Bicycle crunch", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Sit-up", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Situp", "Sit up"] },
  { name: "Weighted sit-up", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Decline sit-up", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "V-up", muscleGroup: "Core", equipment: "bodyweight", aliases: ["V up"] },
  { name: "Hollow body hold", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Hollow hold"] },
  { name: "Dead bug", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Deadbug"] },
  { name: "Bird dog", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Ab wheel rollout", muscleGroup: "Core", equipment: "other", aliases: ["Ab wheel", "Ab roller"] },
  { name: "Barbell rollout", muscleGroup: "Core", equipment: "barbell", aliases: ["BB rollout"] },
  { name: "Hanging leg raise", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Hanging leg lift"] },
  { name: "Hanging knee raise", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Toes to bar", muscleGroup: "Core", equipment: "bodyweight", aliases: ["T2B"] },
  { name: "Captain's chair leg raise", muscleGroup: "Core", equipment: "bodyweight", aliases: ["Captains chair"] },
  { name: "Cable crunch", muscleGroup: "Core", equipment: "cable", aliases: ["Kneeling cable crunch"] },
  { name: "Cable woodchopper", muscleGroup: "Core", equipment: "cable", aliases: ["Woodchopper", "Wood chop"] },
  { name: "Russian twist", muscleGroup: "Core", equipment: "bodyweight" },
  { name: "Pallof press", muscleGroup: "Core", equipment: "cable", aliases: ["Anti-rotation press"] },
  { name: "Farmer's carry", muscleGroup: "Core", equipment: "dumbbell", aliases: ["Farmers walk", "Loaded carry"] },

  { name: "Treadmill", muscleGroup: "Cardio", equipment: "other", aliases: ["Run", "Running"] },
  { name: "Stationary bike", muscleGroup: "Cardio", equipment: "machine", aliases: ["Bike", "Cycling"] },
  { name: "Rowing machine", muscleGroup: "Cardio", equipment: "machine", aliases: ["Row erg", "Rower"] },
  { name: "Elliptical", muscleGroup: "Cardio", equipment: "machine" },
  { name: "Stairmaster", muscleGroup: "Cardio", equipment: "machine", aliases: ["Stair stepper", "Stair climber"] },
];

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function scoreCandidate(ex: LibraryExercise, q: string): number {
  const nameLc = normalize(ex.name);
  const aliasesLc = (ex.aliases ?? []).map(normalize);

  if (nameLc === q) return 1000;
  if (nameLc.startsWith(q)) return 500;
  if (aliasesLc.includes(q)) return 400;
  if (aliasesLc.some((a) => a.startsWith(q))) return 300;

  const nameWords = nameLc.split(/\s+/);
  if (nameWords.some((w) => w.startsWith(q))) return 200;

  for (const a of aliasesLc) {
    if (a.split(/\s+/).some((w) => w.startsWith(q))) return 150;
  }

  if (nameLc.includes(q)) return 100;
  if (aliasesLc.some((a) => a.includes(q))) return 50;

  return 0;
}

export function searchExercises(
  query: string,
  limit: number = 20
): LibraryExercise[] {
  const q = normalize(query);
  if (!q) return [];

  const scored: { ex: LibraryExercise; score: number }[] = [];
  for (const ex of EXERCISE_LIBRARY) {
    const score = scoreCandidate(ex, q);
    if (score > 0) scored.push({ ex, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.ex.name.localeCompare(b.ex.name);
  });

  return scored.slice(0, limit).map((s) => s.ex);
}

export function groupByMuscle(
  exercises: LibraryExercise[]
): Map<MuscleGroup, LibraryExercise[]> {
  const out = new Map<MuscleGroup, LibraryExercise[]>();
  for (const group of MUSCLE_GROUPS) {
    const items = exercises
      .filter((e) => e.muscleGroup === group)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (items.length > 0) out.set(group, items);
  }
  return out;
}
