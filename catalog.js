/* Exercise catalog, illustrations, and number formatting. */
(function (global) {
  const ACCENT = "#1EE0C8";
  const INK = "#E7F2FA";
  const SOFT = "rgba(231,242,250,0.28)";
  const BG = "#0B2740";

  function svg(body) {
    return `<svg viewBox="0 0 88 88" width="68" height="68" aria-hidden="true"><rect width="88" height="88" rx="14" fill="${BG}"/>${body}</svg>`;
  }

  const THUMBS = {
    bench: svg(`<rect x="14" y="46" width="60" height="8" rx="3" fill="${INK}" opacity="0.35"/><rect x="20" y="28" width="48" height="10" rx="3" fill="${ACCENT}" opacity="0.9"/><circle cx="18" cy="33" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><circle cx="70" cy="33" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M36 56v14M52 56v14" stroke="${ACCENT}" stroke-width="2.4" stroke-linecap="round"/>`),
    incline: svg(`<path d="M18 62 L18 40 L62 22 L70 26 L26 46 L26 62Z" fill="${INK}" opacity="0.2"/><rect x="22" y="36" width="44" height="8" rx="3" transform="rotate(-18 44 40)" fill="${ACCENT}" opacity="0.9"/><circle cx="20" cy="48" r="7" fill="none" stroke="${ACCENT}" stroke-width="3"/><circle cx="70" cy="32" r="7" fill="none" stroke="${ACCENT}" stroke-width="3"/>`),
    dip: svg(`<rect x="16" y="20" width="8" height="44" rx="3" fill="${INK}" opacity="0.3"/><rect x="64" y="20" width="8" height="44" rx="3" fill="${INK}" opacity="0.3"/><path d="M24 34h40M34 34c0 16 4 28 10 28s10-12 10-28" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`),
    fly: svg(`<circle cx="44" cy="44" r="14" fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.3"/><path d="M18 30c12 4 18 10 26 14M70 30c-12 4-18 10-26 14" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="28" r="5" fill="${ACCENT}"/><circle cx="72" cy="28" r="5" fill="${ACCENT}"/>`),
    press: svg(`<rect x="22" y="18" width="28" height="36" rx="6" fill="${INK}" opacity="0.2"/><rect x="22" y="46" width="36" height="10" rx="3" fill="#7AF0E0" opacity="0.9"/><path d="M50 56c10 2 18 10 22 20" stroke="#7AF0E0" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="58" cy="62" r="6.5" fill="none" stroke="${INK}" stroke-width="2.4" opacity="0.45"/>`),
    cable: svg(`<rect x="18" y="14" width="8" height="60" rx="3" fill="${INK}" opacity="0.25"/><rect x="62" y="14" width="8" height="60" rx="3" fill="${INK}" opacity="0.25"/><path d="M22 24h16c8 0 12 8 22 20" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M66 24H50c-8 0-12 8-22 20" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-linecap="round"/>`),
    "leg-curl": svg(`<rect x="18" y="28" width="40" height="10" rx="3" fill="${ACCENT}" opacity="0.85"/><rect x="18" y="28" width="12" height="34" rx="3" fill="${INK}" opacity="0.35"/><rect x="14" y="56" width="50" height="8" rx="3" fill="${INK}" opacity="0.22"/><circle cx="58" cy="54" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M58 46.5c8 2 14 8 16 16" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="68" y="20" width="10" height="28" rx="2" fill="${INK}" opacity="0.2"/><path d="M70 24h6M70 28h6M70 32h6M70 36h6" stroke="${ACCENT}" stroke-width="1.2" opacity="0.7"/>`),
    "leg-extension": svg(`<rect x="22" y="18" width="28" height="36" rx="6" fill="${INK}" opacity="0.2"/><rect x="22" y="46" width="36" height="10" rx="3" fill="#7AF0E0" opacity="0.9"/><path d="M50 56c10 2 18 10 22 20" stroke="#7AF0E0" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="58" cy="62" r="6.5" fill="none" stroke="${INK}" stroke-width="2.4" opacity="0.45"/><rect x="16" y="64" width="34" height="8" rx="3" fill="${INK}" opacity="0.2"/>`),
    rdl: svg(`<rect x="14" y="40" width="60" height="6" rx="3" fill="${INK}" opacity="0.55"/><circle cx="20" cy="43" r="10" fill="none" stroke="${ACCENT}" stroke-width="3.2"/><circle cx="20" cy="43" r="5.5" fill="none" stroke="${INK}" stroke-width="2" opacity="0.35"/><circle cx="68" cy="43" r="10" fill="none" stroke="${ACCENT}" stroke-width="3.2"/><circle cx="68" cy="43" r="5.5" fill="none" stroke="${INK}" stroke-width="2" opacity="0.35"/><path d="M36 58h16M40 58v10M48 58v10" stroke="${ACCENT}" stroke-width="2.4" stroke-linecap="round"/>`),
    lunge: svg(`<circle cx="36" cy="18" r="7" fill="none" stroke="${ACCENT}" stroke-width="2.6"/><path d="M36 26 L36 44 L24 70M36 44 L52 70M28 44h16" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="74" r="4" fill="${INK}" opacity="0.4"/><circle cx="52" cy="74" r="4" fill="${INK}" opacity="0.4"/>`),
    "hip-thrust": svg(`<rect x="14" y="48" width="60" height="10" rx="4" fill="${INK}" opacity="0.22"/><rect x="26" y="34" width="36" height="16" rx="6" fill="${ACCENT}" opacity="0.85"/><circle cx="20" cy="42" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><circle cx="68" cy="42" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/>`),
    calf: svg(`<path d="M34 16c8 0 12 8 12 20v20c0 8-2 16-8 22" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M30 78h20" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.45"/><rect x="52" y="50" width="18" height="6" rx="2" fill="${ACCENT}"/>`),
    pulldown: svg(`<rect x="18" y="14" width="52" height="6" rx="3" fill="${INK}" opacity="0.35"/><path d="M28 20v14M60 20v14M28 34h32" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/><path d="M34 34c2 20 4 34 10 34s8-14 10-34" stroke="${ACCENT}" stroke-width="3" fill="none"/>`),
    row: svg(`<rect x="16" y="30" width="40" height="10" rx="3" fill="${ACCENT}" opacity="0.9"/><rect x="16" y="50" width="56" height="8" rx="3" fill="${INK}" opacity="0.22"/><path d="M56 35c10 2 16 10 18 22" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="62" cy="48" r="7" fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.4"/>`),
    "db-row": svg(`<path d="M20 62 L44 36 L68 62" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.35"/><circle cx="30" cy="28" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><rect x="38" y="26" width="22" height="6" rx="3" fill="${ACCENT}"/><circle cx="68" cy="29" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/>`),
    "face-pull": svg(`<circle cx="44" cy="26" r="8" fill="none" stroke="${INK}" stroke-width="2.4" opacity="0.4"/><path d="M44 36v10M28 50h32" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/><path d="M16 30c8 8 14 16 12 26M72 30c-8 8-14 16-12 26" stroke="${ACCENT}" stroke-width="3" fill="none" stroke-linecap="round"/>`),
    pullover: svg(`<rect x="18" y="48" width="52" height="8" rx="3" fill="${INK}" opacity="0.25"/><path d="M24 48c4-22 14-30 20-30 8 0 10 10 22 28" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="66" cy="50" r="7" fill="none" stroke="${ACCENT}" stroke-width="3"/>`),
    hyper: svg(`<path d="M16 54h56" stroke="${INK}" stroke-width="4" stroke-linecap="round" opacity="0.25"/><path d="M28 54c6-16 14-28 16-28s10 12 16 28" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="44" cy="22" r="6" fill="none" stroke="${ACCENT}" stroke-width="2.4"/>`),
    ohp: svg(`<circle cx="44" cy="18" r="6" fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.45"/><path d="M44 26v22M32 36h24" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="36" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><circle cx="66" cy="36" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M36 48 L28 74M52 48 L60 74" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.35"/>`),
    lateral: svg(`<circle cx="44" cy="28" r="6" fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.45"/><path d="M44 36v20M28 70L44 56 60 70" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.35"/><path d="M16 40h56" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="40" r="6" fill="none" stroke="${ACCENT}" stroke-width="2.6"/><circle cx="74" cy="40" r="6" fill="none" stroke="${ACCENT}" stroke-width="2.6"/>`),
    "rear-delt": svg(`<circle cx="44" cy="30" r="7" fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.4"/><path d="M44 38v14" stroke="${INK}" stroke-width="3" opacity="0.35"/><path d="M20 34c8 14 16 22 24 22s16-8 24-22" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`),
    curl: svg(`<circle cx="22" cy="58" r="9" fill="none" stroke="${ACCENT}" stroke-width="3"/><rect x="30" y="55" width="28" height="6" rx="3" fill="${ACCENT}"/><circle cx="66" cy="58" r="9" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M44 54c0-20-8-30-8-30" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.4"/>`),
    hammer: svg(`<rect x="40" y="16" width="8" height="40" rx="3" fill="${ACCENT}"/><circle cx="44" cy="64" r="10" fill="none" stroke="${ACCENT}" stroke-width="3.2"/><circle cx="44" cy="64" r="5" fill="none" stroke="${INK}" stroke-width="2" opacity="0.35"/>`),
    pushdown: svg(`<rect x="40" y="12" width="8" height="28" rx="3" fill="${INK}" opacity="0.35"/><path d="M44 40c-12 4-16 14-16 22M44 40c12 4 16 14 16 22" stroke="${ACCENT}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M24 64h40" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>`),
    skull: svg(`<rect x="18" y="48" width="52" height="8" rx="3" fill="${INK}" opacity="0.25"/><circle cx="22" cy="28" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><rect x="30" y="25" width="28" height="6" rx="3" fill="${ACCENT}"/><circle cx="66" cy="28" r="8" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M44 32v16" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>`),
    "overhead-tri": svg(`<circle cx="44" cy="22" r="6" fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.45"/><path d="M44 30v18" stroke="${INK}" stroke-width="3" opacity="0.35"/><circle cx="44" cy="18" r="10" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M34 52 L28 74M54 52 L60 74" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>`),
    generic: svg(`<circle cx="44" cy="44" r="18" fill="none" stroke="${ACCENT}" stroke-width="3"/><path d="M32 44h24M44 32v24" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>`),
  };

  const PLAY = `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#07111F" fill-opacity="0.88"/><path d="M11.2 8.8v10.4L19.4 14 11.2 8.8z" fill="#1EE0C8"/></svg>`;

  const CATEGORIES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms", "Legs", "Core"];
  const LEG_SUBS = ["Quads", "Hamstrings", "Glutes", "Calves"];
  const EQUIPMENT = ["Barbell", "Dumbbell", "Machine", "Cable", "Bodyweight", "Smith"];

  /* Built-in library used by Swap / Add. Seed program exercises come first. */
  const EXERCISES = [
    { name: "Flat Barbell Bench Press", aliases: ["Barbell Bench Press", "Flat Bench Press"], thumb: "bench", category: "Chest", equipment: "Barbell", defaultReps: 8, defaultWeight: 60, tempo: [3, 0, 1, 1] },
    { name: "Incline Dumbbell Press", thumb: "incline", category: "Chest", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 24, tempo: [3, 0, 1, 1] },
    { name: "Incline Machine Press", thumb: "incline", category: "Chest", equipment: "Machine", defaultReps: 10, defaultWeight: 40, tempo: [3, 0, 1, 1] },
    { name: "Chest Dip", thumb: "dip", category: "Chest", equipment: "Bodyweight", defaultReps: 8, defaultWeight: null, tempo: [3, 0, 1, 1] },
    { name: "Decline Bench Press", thumb: "bench", category: "Chest", equipment: "Barbell", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "Cable Fly", thumb: "fly", category: "Chest", equipment: "Cable", defaultReps: 12, defaultWeight: 12.5, tempo: [3, 0, 2, 1] },
    { name: "Pec Deck", thumb: "fly", category: "Chest", equipment: "Machine", defaultReps: 12, defaultWeight: 30, tempo: [3, 0, 2, 1] },
    { name: "Machine Chest Press", thumb: "press", category: "Chest", equipment: "Machine", defaultReps: 10, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "Push-Up", thumb: "press", category: "Chest", equipment: "Bodyweight", defaultReps: 12, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Overhead Cable Crossover", thumb: "cable", category: "Chest", equipment: "Cable", defaultReps: 12, defaultWeight: 10, tempo: [3, 0, 2, 1] },
    { name: "Low Cable Fly", thumb: "cable", category: "Chest", equipment: "Cable", defaultReps: 12, defaultWeight: 10, tempo: [3, 0, 2, 1] },
    { name: "Incline Barbell Press", aliases: ["Incline Bench Press"], thumb: "incline", category: "Chest", equipment: "Barbell", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "Flat Dumbbell Press", thumb: "bench", category: "Chest", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 24, tempo: [3, 0, 1, 1] },
    { name: "Dumbbell Fly", thumb: "fly", category: "Chest", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 12, tempo: [3, 0, 2, 1] },
    { name: "Smith Machine Bench Press", thumb: "bench", category: "Chest", equipment: "Smith", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },

    { name: "Seated Leg Curl", thumb: "leg-curl", category: "Legs", sub: "Hamstrings", equipment: "Machine", defaultReps: 8, defaultWeight: 52.5, tempo: [3, 0, 1, 1] },
    { name: "Standing Leg Curl", thumb: "leg-curl", category: "Legs", sub: "Hamstrings", equipment: "Machine", defaultReps: 8, defaultWeight: 40, tempo: [3, 0, 1, 1] },
    { name: "Lying Leg Curl", thumb: "leg-curl", category: "Legs", sub: "Hamstrings", equipment: "Machine", defaultReps: 10, defaultWeight: 40, tempo: [3, 0, 1, 1] },
    { name: "Leg Extension", thumb: "leg-extension", category: "Legs", sub: "Quads", equipment: "Machine", defaultReps: 15, defaultWeight: 70, tempo: [3, 0, 2, 1] },
    { name: "Leg Press Machine", thumb: "press", category: "Legs", sub: "Quads", equipment: "Machine", defaultReps: 10, defaultWeight: 80, tempo: [3, 0, 2, 1] },
    { name: "Romanian Deadlift", thumb: "rdl", category: "Legs", sub: "Hamstrings", equipment: "Barbell", defaultReps: 10, defaultWeight: 60, tempo: [3, 1, 2, 1] },
    { name: "Smith Machine Squat", thumb: "rdl", category: "Legs", sub: "Quads", equipment: "Smith", defaultReps: 10, defaultWeight: 50, tempo: [3, 1, 2, 1] },
    { name: "Barbell Back Squat", thumb: "rdl", category: "Legs", sub: "Quads", equipment: "Barbell", defaultReps: 8, defaultWeight: 70, tempo: [3, 1, 2, 1] },
    { name: "Front Squat", thumb: "rdl", category: "Legs", sub: "Quads", equipment: "Barbell", defaultReps: 8, defaultWeight: 50, tempo: [3, 1, 2, 1] },
    { name: "Goblet Squat", thumb: "rdl", category: "Legs", sub: "Quads", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 20, tempo: [3, 0, 2, 1] },
    { name: "Hack Squat", thumb: "press", category: "Legs", sub: "Quads", equipment: "Machine", defaultReps: 10, defaultWeight: 60, tempo: [3, 0, 2, 1] },
    { name: "Walking Lunge", thumb: "lunge", category: "Legs", sub: "Quads", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 16, tempo: [3, 0, 1, 1] },
    { name: "Bulgarian Split Squat", thumb: "lunge", category: "Legs", sub: "Quads", equipment: "Dumbbell", defaultReps: 8, defaultWeight: 16, tempo: [3, 0, 1, 1] },
    { name: "Step-Up", thumb: "lunge", category: "Legs", sub: "Quads", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 16, tempo: [2, 0, 1, 1] },
    { name: "Hip Thrust", thumb: "hip-thrust", category: "Legs", sub: "Glutes", equipment: "Barbell", defaultReps: 10, defaultWeight: 60, tempo: [3, 1, 1, 1] },
    { name: "Glute Bridge", thumb: "hip-thrust", category: "Legs", sub: "Glutes", equipment: "Bodyweight", defaultReps: 12, defaultWeight: null, tempo: [2, 1, 1, 1] },
    { name: "Cable Kickback", thumb: "hip-thrust", category: "Legs", sub: "Glutes", equipment: "Cable", defaultReps: 12, defaultWeight: 15, tempo: [2, 0, 2, 1] },
    { name: "Standing Calf Raise", thumb: "calf", category: "Legs", sub: "Calves", equipment: "Machine", defaultReps: 12, defaultWeight: 40, tempo: [2, 1, 2, 1] },
    { name: "Seated Calf Raise", thumb: "calf", category: "Legs", sub: "Calves", equipment: "Machine", defaultReps: 12, defaultWeight: 30, tempo: [2, 1, 2, 1] },
    { name: "Dumbbell Calf Raise", thumb: "calf", category: "Legs", sub: "Calves", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 16, tempo: [2, 1, 2, 1] },

    { name: "Lat Pulldown", thumb: "pulldown", category: "Back", equipment: "Cable", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "Pull-Up", thumb: "pulldown", category: "Back", equipment: "Bodyweight", defaultReps: 6, defaultWeight: null, tempo: [3, 0, 1, 1] },
    { name: "Chin-Up", thumb: "pulldown", category: "Back", equipment: "Bodyweight", defaultReps: 6, defaultWeight: null, tempo: [3, 0, 1, 1] },
    { name: "Seated Cable Row", aliases: ["Cable Row", "Cable Rows"],  thumb: "row", category: "Back", equipment: "Cable", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "Chest-Supported Row", aliases: ["Row Machine"], thumb: "row", category: "Back", equipment: "Machine", defaultReps: 8, defaultWeight: 40, tempo: [3, 0, 1, 1] },
    { name: "Single-Arm Dumbbell Row", thumb: "db-row", category: "Back", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 24, tempo: [3, 0, 1, 1] },
    { name: "Barbell Bent-Over Row", thumb: "db-row", category: "Back", equipment: "Barbell", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "T-Bar Row", thumb: "db-row", category: "Back", equipment: "Barbell", defaultReps: 8, defaultWeight: 40, tempo: [3, 0, 1, 1] },
    { name: "Straight-Arm Pulldown", thumb: "pullover", category: "Back", equipment: "Cable", defaultReps: 12, defaultWeight: 20, tempo: [3, 0, 2, 1] },
    { name: "Dumbbell Pullover", thumb: "pullover", category: "Back", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 16, tempo: [3, 0, 2, 1] },
    { name: "Back Extension", thumb: "hyper", category: "Back", equipment: "Bodyweight", defaultReps: 12, defaultWeight: 15, tempo: [3, 0, 1, 1] },
    { name: "Reverse Hyper", thumb: "hyper", category: "Back", equipment: "Machine", defaultReps: 12, defaultWeight: 20, tempo: [3, 0, 1, 1] },
    { name: "Conventional Deadlift", thumb: "rdl", category: "Back", equipment: "Barbell", defaultReps: 5, defaultWeight: 80, tempo: [3, 1, 1, 1] },

    { name: "Seated Dumbbell Shoulder Press", aliases: ["Seated Dumbbell Press"], thumb: "ohp", category: "Shoulders", equipment: "Dumbbell", defaultReps: 8, defaultWeight: 20, tempo: [3, 0, 1, 1] },
    { name: "Machine Shoulder Press", thumb: "ohp", category: "Shoulders", equipment: "Machine", defaultReps: 8, defaultWeight: 30, tempo: [3, 0, 1, 1] },
    { name: "Barbell Overhead Press", aliases: ["Standing Barbell Shoulder Press"], thumb: "ohp", category: "Shoulders", equipment: "Barbell", defaultReps: 8, defaultWeight: 35, tempo: [3, 0, 1, 1] },
    { name: "Arnold Press", thumb: "ohp", category: "Shoulders", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 14, tempo: [3, 0, 1, 1] },
    { name: "Lateral Raise", aliases: ["Side Lateral Dumbbell Raise", "Side Lateral Dumbbell Raises"], thumb: "lateral", category: "Shoulders", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 8, tempo: [2, 0, 2, 1] },
    { name: "Cable Lateral Raise", thumb: "lateral", category: "Shoulders", equipment: "Cable", defaultReps: 12, defaultWeight: 8, tempo: [2, 0, 2, 1] },
    { name: "Front Raise", thumb: "lateral", category: "Shoulders", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 8, tempo: [2, 0, 2, 1] },
    { name: "Rear Delt Fly", aliases: ["Rear Lateral Dumbbell Raise", "Rear Lateral Dumbbell Raises"],  thumb: "rear-delt", category: "Shoulders", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 8, tempo: [2, 0, 2, 1] },
    { name: "Face Pull", thumb: "face-pull", category: "Shoulders", equipment: "Cable", defaultReps: 15, defaultWeight: 15, tempo: [2, 0, 2, 1] },
    { name: "Barbell Shrug", thumb: "rdl", category: "Shoulders", equipment: "Barbell", defaultReps: 12, defaultWeight: 60, tempo: [1, 1, 1, 1] },

    { name: "EZ-Bar Curl", thumb: "curl", category: "Biceps", equipment: "Barbell", defaultReps: 10, defaultWeight: 25, tempo: [3, 0, 1, 1] },
    { name: "Barbell Curl", thumb: "curl", category: "Biceps", equipment: "Barbell", defaultReps: 10, defaultWeight: 25, tempo: [3, 0, 1, 1] },
    { name: "Dumbbell Curl", thumb: "curl", category: "Biceps", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 12, tempo: [3, 0, 1, 1] },
    { name: "Hammer Curl", thumb: "hammer", category: "Biceps", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 12, tempo: [3, 0, 1, 1] },
    { name: "Incline Dumbbell Curl", thumb: "curl", category: "Biceps", equipment: "Dumbbell", defaultReps: 10, defaultWeight: 10, tempo: [3, 0, 1, 1] },
    { name: "Preacher Curl", thumb: "curl", category: "Biceps", equipment: "Machine", defaultReps: 10, defaultWeight: 25, tempo: [3, 0, 1, 1] },
    { name: "Cable Curl", thumb: "curl", category: "Biceps", equipment: "Cable", defaultReps: 12, defaultWeight: 20, tempo: [3, 0, 1, 1] },
    { name: "Concentration Curl", thumb: "curl", category: "Biceps", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 10, tempo: [3, 0, 1, 1] },

    { name: "Tricep Rope Pushdown", aliases: ["Cable Pushdown", "Cable Pushdowns"], thumb: "pushdown", category: "Triceps", equipment: "Cable", defaultReps: 12, defaultWeight: 20, tempo: [2, 0, 2, 1] },
    { name: "Overhead Rope Extension", thumb: "overhead-tri", category: "Triceps", equipment: "Cable", defaultReps: 12, defaultWeight: 16, tempo: [3, 0, 2, 1] },
    { name: "Lying Tricep Extension", aliases: ["Lying Tricep Extensions", "Skull Crusher"], thumb: "skull", category: "Triceps", equipment: "Barbell", defaultReps: 10, defaultWeight: 25, tempo: [3, 0, 1, 1] },
    { name: "Skull Crusher", aliases: ["Lying Tricep Extension"], thumb: "skull", category: "Triceps", equipment: "Barbell", defaultReps: 10, defaultWeight: 25, tempo: [3, 0, 1, 1] },
    { name: "Close-Grip Bench Press", thumb: "bench", category: "Triceps", equipment: "Barbell", defaultReps: 8, defaultWeight: 50, tempo: [3, 0, 1, 1] },
    { name: "Overhead Tricep Extension", thumb: "overhead-tri", category: "Triceps", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 12, tempo: [3, 0, 2, 1] },
    { name: "Diamond Push-Up", thumb: "press", category: "Triceps", equipment: "Bodyweight", defaultReps: 10, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Tricep Kickback", thumb: "pushdown", category: "Triceps", equipment: "Dumbbell", defaultReps: 12, defaultWeight: 8, tempo: [2, 0, 2, 1] },
    { name: "Bench Dip", thumb: "dip", category: "Triceps", equipment: "Bodyweight", defaultReps: 10, defaultWeight: null, tempo: [2, 0, 1, 1] },

    { name: "Plank", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 30, defaultWeight: null, tempo: [1, 0, 1, 0] },
    { name: "Side Plank", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 30, defaultWeight: null, tempo: [1, 0, 1, 0] },
    { name: "Crunch", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 15, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Hanging Leg Raise", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 10, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Hanging Knee Raise", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 12, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Cable Crunch", thumb: "cable", category: "Core", equipment: "Cable", defaultReps: 12, defaultWeight: 25, tempo: [2, 0, 2, 1] },
    { name: "Ab Wheel Rollout", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 8, defaultWeight: null, tempo: [3, 0, 2, 1] },
    { name: "Russian Twist", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 16, defaultWeight: null, tempo: [1, 0, 1, 0] },
    { name: "Pallof Press", thumb: "cable", category: "Core", equipment: "Cable", defaultReps: 10, defaultWeight: 15, tempo: [2, 1, 2, 1] },
    { name: "Dead Bug", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 10, defaultWeight: null, tempo: [2, 0, 2, 0] },
    { name: "Single-Leg Leg Press Calf Raise", aliases: ["Calf Raises on Leg Press"], thumb: "calf", category: "Legs", sub: "Calves", equipment: "Machine", defaultReps: 8, defaultWeight: 40, tempo: [2, 1, 2, 1] },
    { name: "Stiff-Leg Deadlift", thumb: "rdl", category: "Legs", sub: "Hamstrings", equipment: "Barbell", defaultReps: 6, defaultWeight: 60, tempo: [3, 1, 2, 1] },
    { name: "Swiss Ball Leg Raise", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 15, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Swiss Ball Crunch", thumb: "generic", category: "Core", equipment: "Bodyweight", defaultReps: 15, defaultWeight: null, tempo: [2, 0, 1, 1] },
    { name: "Weighted Dip", thumb: "dip", category: "Chest", equipment: "Bodyweight", defaultReps: 6, defaultWeight: 10, tempo: [3, 0, 1, 1] },
    { name: "Incline Dumbbell Tricep Extension", aliases: ["Incline Tricep Extension", "Incline Triceps Extension"], thumb: "skull", category: "Triceps", equipment: "Dumbbell", defaultReps: 6, defaultWeight: 25, tempo: [3, 0, 1, 1] },
    { name: "Alternating Dumbbell Curl", aliases: ["Dumbbell Alternate Curl", "Dumbbell Alternate Curls"], thumb: "curl", category: "Biceps", equipment: "Dumbbell", defaultReps: 6, defaultWeight: 12, tempo: [3, 0, 1, 1] },
    { name: "Barbell Wrist Curl", thumb: "curl", category: "Forearms", equipment: "Barbell", defaultReps: 8, defaultWeight: 20, tempo: [2, 0, 2, 1] },
    { name: "Dumbbell Wrist Curl", aliases: ["Standing Dumbbell Wrist Curl", "Standing Dumbbell Wrist Curls"], thumb: "curl", category: "Forearms", equipment: "Dumbbell", defaultReps: 8, defaultWeight: 12, tempo: [2, 0, 2, 1] },
  ];

    function slug(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "exercise";
  }

  /* Old keys stay linked after a rename so history, notes, and last-logged follow. */
  const KEY_ALIASES = {
    "incline-tricep-extension": "incline-dumbbell-tricep-extension",
    "incline-triceps-extension": "incline-dumbbell-tricep-extension",
    /* Flat bench — canonical new name, used in both programs. */
    "barbell-bench-press": "flat-barbell-bench-press",
    "flat-bench-press": "flat-barbell-bench-press",
    /* Lying tricep extension is the Max-OT source name for what we had as Skull Crusher. */
    "skull-crusher": "lying-tricep-extension",
    "lying-tricep-extensions": "lying-tricep-extension",
    /* Max-OT source names map onto existing catalog keys so photos + history follow. */
    "standing-barbell-shoulder-press": "barbell-overhead-press",
    "seated-dumbbell-press": "seated-dumbbell-shoulder-press",
    "side-lateral-dumbbell-raise": "lateral-raise",
    "side-lateral-dumbbell-raises": "lateral-raise",
    "rear-lateral-dumbbell-raise": "rear-delt-fly",
    "rear-lateral-dumbbell-raises": "rear-delt-fly",
    "calf-raises-on-leg-press": "single-leg-leg-press-calf-raise",
    "cable-row": "seated-cable-row",
    "cable-rows": "seated-cable-row",
    "row-machine": "chest-supported-row",
    "incline-bench-press": "incline-barbell-press",
    "cable-pushdown": "tricep-rope-pushdown",
    "cable-pushdowns": "tricep-rope-pushdown",
    "dumbbell-alternate-curl": "alternating-dumbbell-curl",
    "dumbbell-alternate-curls": "alternating-dumbbell-curl",
    "standing-dumbbell-wrist-curl": "dumbbell-wrist-curl",
    "standing-dumbbell-wrist-curls": "dumbbell-wrist-curl",
    "weighted-dips": "weighted-dip",
  };

  function canonicalKey(nameOrKey) {
    const key = slug(nameOrKey);
    return KEY_ALIASES[key] || key;
  }

  function keysFor(nameOrKey) {
    const canon = canonicalKey(nameOrKey);
    const aliases = Object.keys(KEY_ALIASES).filter((k) => KEY_ALIASES[k] === canon && k !== canon);
    return [canon].concat(aliases);
  }

  function findExercise(name) {
    const raw = slug(name);
    const key = canonicalKey(name);
    return EXERCISES.find((e) => {
      if (canonicalKey(e.name) === key || slug(e.name) === raw) return true;
      return (e.aliases || []).some((a) => slug(a) === raw || canonicalKey(a) === key);
    }) || null;
  }

  function categoryOf(name) {
    const ex = findExercise(name);
    return (ex && ex.category) || "Chest";
  }

  function filterExercises({ category, sub, equipment, query } = {}) {
    const q = String(query || "").trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (category && e.category !== category) return false;
      if (category === "Legs" && sub && e.sub !== sub) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (q) {
        const hay = [e.name, ...(e.aliases || []), e.category, e.sub || "", e.equipment].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function thumbMarkup(key) {
    return THUMBS[key] || THUMBS.generic;
  }

  function playMarkup() {
    return PLAY;
  }

  function photoFor(name) {
    const photos = global.VELA_PHOTOS || {};
    for (const k of keysFor(name)) {
      if (photos[k]) return photos[k];
    }
    return photos[slug(name)] || null;
  }

  function videoFor(name) {
    const photo = photoFor(name);
    if (photo && photo.video) return photo;
    return null;
  }

  function photoMarkup(name, { mini = false, large = false } = {}) {
    const photo = photoFor(name);
    const fallback = thumbMarkup((findExercise(name) || {}).thumb || "generic");
    if (!photo || !((photo.frames && photo.frames.length) || photo.video)) return fallback;
    /* Mini list thumbs stay as stills so a plan or library row doesn't autoplay many videos. */
    if (!mini && photo.video) {
      const poster = photo.poster || (photo.frames && photo.frames[0]) || "";
      const cls = ["ex-photo", "ex-video", large ? "large" : ""].filter(Boolean).join(" ");
      return `<div class="${cls}" data-testid="ex-photo">
        ${poster ? `<img class="frame frame-a video-poster" src="${poster}" alt="" draggable="false">` : ""}
        <video class="ex-demo-video" src="${photo.video}" poster="${poster}" autoplay loop muted playsinline webkit-playsinline data-testid="ex-video"></video>
      </div>`;
    }
    const frames = photo.frames || [];
    if (!frames.length) return fallback;
    const cls = ["ex-photo", mini ? "mini" : "", large ? "large" : "", frames.length < 2 ? "single" : ""]
      .filter(Boolean)
      .join(" ");
    const imgs = frames
      .map((src, i) => {
        const letter = i === 0 ? "a" : "b";
        return `<img class="frame frame-${letter}" src="${src}" alt="" draggable="false">`;
      })
      .join("");
    return `<div class="${cls}" data-frames="${frames.length}" data-testid="ex-photo">${imgs}</div>`;
  }

  /* Danish-style numbers: 52,5 and 1.260 */
  function formatNumber(value, { decimals = "auto" } = {}) {
    if (value == null || value === "" || Number.isNaN(Number(value))) return "";
    const n = Number(value);
    const abs = Math.abs(n);
    const hasFrac = !Number.isInteger(n);
    const maxFrac = decimals === "auto" ? (hasFrac ? 2 : 0) : decimals;
    const minFrac = decimals === "auto" ? (hasFrac ? 1 : 0) : decimals;
    const [intRaw, frac = ""] = abs.toFixed(Math.min(2, Math.max(minFrac, hasFrac ? 1 : 0))).split(".");
    let intPart = intRaw;
    if (decimals !== "auto") {
      const fixed = abs.toFixed(decimals);
      const parts = fixed.split(".");
      intPart = parts[0];
      const fr = parts[1] || "";
      const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const sign = n < 0 ? "−" : "";
      return fr.length ? `${sign}${grouped},${fr}` : `${sign}${grouped}`;
    }
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const sign = n < 0 ? "−" : "";
    if (!hasFrac) return `${sign}${grouped}`;
    /* trim trailing zeros but keep at least one decimal if original had one like 52.5 */
    let fr = frac.replace(/0+$/, "");
    if (fr.length === 0) fr = "0";
    return `${sign}${grouped},${fr}`;
  }

  function formatKg(value) {
    const s = formatNumber(value);
    return s === "" ? "" : `${s} kg`;
  }

  function formatVolume(value) {
    if (value == null || Number.isNaN(Number(value))) return "0 kg";
    const n = Math.round(Number(value));
    return `${formatNumber(n)} kg`;
  }

  function formatSetLabel(reps, weight) {
    const r = reps == null || reps === "" ? null : formatNumber(reps);
    const w = weight == null || weight === "" ? null : formatKg(weight);
    if (r && w) return `${r} reps · ${w}`;
    if (r) return `${r} reps`;
    if (w) return w;
    return "Set";
  }

  function parseNum(text) {
    if (text == null) return null;
    const s = String(text).trim().replace(/\s/g, "").replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeInput(text) {
    /* Keep what the user typed; allow comma or dot as decimal. */
    return String(text == null ? "" : text);
  }

  global.VELA_CATALOG = {
    THUMBS,
    EXERCISES,
    CATEGORIES,
    LEG_SUBS,
    EQUIPMENT,
    slug,
    KEY_ALIASES,
    canonicalKey,
    keysFor,
    findExercise,
    categoryOf,
    filterExercises,
    thumbMarkup,
    playMarkup,
    photoFor,
    videoFor,
    photoMarkup,
    formatNumber,
    formatKg,
    formatVolume,
    formatSetLabel,
    parseNum,
    normalizeInput,
  };
})(window);
