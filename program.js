/* ========================================================================
 * VELA Bro Split program — THE file to edit when the exact exercise list
 * arrives. Change workouts, exercises, alternatives, tempo, sets, reps
 * and suggested weights here. Nothing else in the app needs to change.
 *
 * Existing phone installs keep their saved data. After you update this
 * file, use Settings → Reset to default program on the phone to load it.
 *
 * Shape of an exercise:
 *   name    – display name
 *   alt     – suggested alternative (optional)
 *   tempo   – [eccentric, pause, concentric, pause], e.g. [3, 0, 1, 1]
 *   sets    – number of sets
 *   reps    – suggested reps
 *   weight  – suggested kg (use a decimal like 52.5). null = bodyweight / not set
 *   thumb   – illustration key (see catalog.js THUMBS)
 * ======================================================================== */

window.VELA_PROGRAMS = {
  "bro-split": {
  id: "bro-split",
  name: "Bro Split",
  restSeconds: 90,
  cycleWeeks: 5,
  defaultDays: 4,
  /* 4-day layout: Chest, Legs, Back, Biceps+Triceps+Delts.
     5-day layout splits shoulder work out of Arms into a Delts day
     and adds a few extra shoulder lifts (see fiveDay). */
  workouts: [
    {
      id: "chest",
      name: "Chest",
      minutes: 60,
      exercises: [
        { name: "Flat Barbell Bench Press", alt: "Incline Dumbbell Press", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: 60, thumb: "bench" },
        { name: "Incline Dumbbell Press", alt: "Incline Machine Press", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 24, thumb: "incline" },
        { name: "Chest Dip", alt: "Decline Bench Press", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: null, thumb: "dip" },
        { name: "Cable Fly", alt: "Pec Deck", tempo: [3, 0, 2, 1], sets: 3, reps: 12, weight: 12.5, thumb: "fly" },
        { name: "Machine Chest Press", alt: "Push-Up", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 50, thumb: "press" },
        { name: "Overhead Cable Crossover", alt: "Low Cable Fly", tempo: [3, 0, 2, 1], sets: 3, reps: 12, weight: 10, thumb: "cable" },
      ],
    },
    {
      id: "legs-2",
      name: "Legs 2",
      minutes: 60,
      exercises: [
        /* Confirmed from Morten */
        { name: "Seated Leg Curl", alt: "Standing Leg Curl", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: 52.5, thumb: "leg-curl" },
        { name: "Leg Extension", alt: "Leg Press Machine", tempo: [3, 0, 2, 1], sets: 3, reps: 15, weight: 70, thumb: "leg-extension" },
        { name: "Romanian Deadlift", alt: "Smith Machine Squat", tempo: [3, 1, 2, 1], sets: 3, reps: 10, weight: 60, thumb: "rdl" },
        /* Placeholders until the rest of the list arrives */
        { name: "Walking Lunge", alt: "Bulgarian Split Squat", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 16, thumb: "lunge" },
        { name: "Hip Thrust", alt: "Glute Bridge", tempo: [3, 1, 1, 1], sets: 3, reps: 10, weight: 60, thumb: "hip-thrust" },
        { name: "Standing Calf Raise", alt: "Seated Calf Raise", tempo: [2, 1, 2, 1], sets: 3, reps: 12, weight: 40, thumb: "calf" },
      ],
    },
    {
      id: "back",
      name: "Back",
      minutes: 60,
      exercises: [
        { name: "Lat Pulldown", alt: "Pull-Up", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: 50, thumb: "pulldown" },
        { name: "Seated Cable Row", alt: "Chest-Supported Row", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: 50, thumb: "row" },
        { name: "Single-Arm Dumbbell Row", alt: "T-Bar Row", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 24, thumb: "db-row" },
        { name: "Face Pull", alt: "Rear Delt Fly", tempo: [2, 0, 2, 1], sets: 3, reps: 15, weight: 15, thumb: "face-pull" },
        { name: "Straight-Arm Pulldown", alt: "Dumbbell Pullover", tempo: [3, 0, 2, 1], sets: 3, reps: 12, weight: 20, thumb: "pullover" },
        { name: "Back Extension", alt: "Reverse Hyper", tempo: [3, 0, 1, 1], sets: 3, reps: 12, weight: 15, thumb: "hyper" },
      ],
    },
    {
      id: "arms",
      name: "Biceps, Triceps & Delts",
      minutes: 60,
      exercises: [
        { name: "Seated Dumbbell Shoulder Press", alt: "Machine Shoulder Press", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: 20, thumb: "ohp" },
        { name: "Lateral Raise", alt: "Cable Lateral Raise", tempo: [2, 0, 2, 1], sets: 3, reps: 12, weight: 8, thumb: "lateral" },
        { name: "Rear Delt Fly", alt: "Face Pull", tempo: [2, 0, 2, 1], sets: 3, reps: 12, weight: 8, thumb: "rear-delt" },
        { name: "EZ-Bar Curl", alt: "Dumbbell Curl", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 25, thumb: "curl" },
        { name: "Hammer Curl", alt: "Incline Dumbbell Curl", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 12, thumb: "hammer" },
        { name: "Cable Rope Tricep Extension", alt: "Overhead Rope Extension", tempo: [2, 0, 2, 1], sets: 3, reps: 12, weight: 20, thumb: "pushdown" },
        { name: "Skull Crusher", alt: "Close-Grip Bench Press", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 25, thumb: "skull" },
        { name: "Overhead Tricep Extension", alt: "Diamond Push-Up", tempo: [3, 0, 2, 1], sets: 3, reps: 12, weight: 12, thumb: "overhead-tri" },
      ],
    },
  ],
  /* Used when the plan is 5x/week. Shoulder lifts currently on the Arms
     day move to Delts; extras fill the session to about 5–6 exercises. */
  fiveDay: {
    armsName: "Arms (Biceps & Triceps)",
    armsDay4Name: "Biceps, Triceps & Delts",
    delts: {
      id: "delts",
      name: "Delts",
      minutes: 60,
      extras: [
        { name: "Arnold Press", alt: "Barbell Overhead Press", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 14, thumb: "ohp" },
        { name: "Front Raise", alt: "Cable Lateral Raise", tempo: [2, 0, 2, 1], sets: 3, reps: 12, weight: 8, thumb: "lateral" },
        { name: "Barbell Shrug", alt: "Face Pull", tempo: [1, 1, 1, 1], sets: 3, reps: 12, weight: 60, thumb: "rdl" },
      ],
    },
    /* Names that count as shoulder work when splitting the Arms day. */
    shoulderNames: [
      "Seated Dumbbell Shoulder Press",
      "Machine Shoulder Press",
      "Barbell Overhead Press",
      "Arnold Press",
      "Lateral Raise",
      "Cable Lateral Raise",
      "Front Raise",
      "Rear Delt Fly",
      "Barbell Shrug",
    ],
  },

  },

  "max-ot": {
    id: "max-ot",
    name: "Max-OT",
    author: "Jeff Willet",
    source: "https://ast-ss.com/mass-provisions-training-schedule/",
    restSeconds: 180,
    cycleWeeks: 8,
    defaultDays: 5,
    recoveryWeek: true,
    /* Seeded from Jeff Willet’s published Mass PROvisions Max-OT schedule
       (AST Sports Science, https://ast-ss.com/mass-provisions-training-schedule/).
       Names, order, sets and rep ranges follow that table. Working sets only —
       warm-up / acclimation sets mentioned in the table are not counted.
       Display names use the app’s singular style (the source often uses plurals). */
    workouts: [
      {
        id: "maxot-shoulders",
        name: "Shoulders & Traps",
        dayLabel: "Monday",
        minutes: 60,
        exercises: [
          { name: "Standing Barbell Shoulder Press", alt: "Seated Dumbbell Press", tempo: [3, 0, 1, 1], sets: 3, reps: 6, repsRange: "4-6", weight: 35, thumb: "ohp" },
          { name: "Seated Dumbbell Press", alt: "Machine Shoulder Press", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 20, thumb: "ohp" },
          { name: "Side Lateral Dumbbell Raise", alt: "Cable Lateral Raise", tempo: [2, 0, 2, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 8, thumb: "lateral" },
          { name: "Rear Lateral Dumbbell Raise", alt: "Face Pull", tempo: [2, 0, 2, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 8, thumb: "rear-delt" },
          { name: "Barbell Shrug", alt: "", tempo: [1, 1, 1, 1], sets: 3, reps: 6, repsRange: "4-6", weight: 60, thumb: "rdl" },
        ],
      },
      {
        id: "maxot-legs",
        name: "Calves & Legs",
        dayLabel: "Tuesday",
        minutes: 60,
        exercises: [
          { name: "Calf Raises on Leg Press", alt: "Standing Calf Raise", tempo: [2, 1, 2, 1], sets: 3, reps: 8, repsRange: "6-8", weight: 40, thumb: "calf" },
          { name: "Seated Calf Raise", alt: "Standing Calf Raise", tempo: [2, 1, 2, 1], sets: 2, reps: 8, repsRange: "6-8", weight: 30, thumb: "calf" },
          { name: "Barbell Back Squat", alt: "Goblet Squat", tempo: [3, 1, 2, 1], sets: 3, reps: 6, repsRange: "4-6", weight: 70, thumb: "rdl" },
          { name: "Front Squat", alt: "Hack Squat", tempo: [3, 1, 2, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 50, thumb: "rdl" },
          { name: "Stiff-Leg Deadlift", alt: "Romanian Deadlift", tempo: [3, 1, 2, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 60, thumb: "rdl" },
        ],
      },
      {
        id: "maxot-back",
        name: "Abs & Back",
        dayLabel: "Wednesday",
        minutes: 60,
        exercises: [
          { name: "Swiss Ball Leg Raise", alt: "Hanging Leg Raise", tempo: [2, 0, 1, 1], sets: 2, reps: 15, repsRange: "15-20", weight: null, thumb: "generic" },
          { name: "Cable Crunch", alt: "Crunch", tempo: [2, 0, 2, 1], sets: 3, reps: 10, repsRange: "8-12", weight: 25, thumb: "cable" },
          { name: "Swiss Ball Crunch", alt: "Crunch", tempo: [2, 0, 1, 1], sets: 2, reps: 15, repsRange: "15-20", weight: null, thumb: "generic" },
          { name: "Cable Row", alt: "Chest-Supported Row", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 50, thumb: "row" },
          { name: "Lat Pulldown", alt: "Pull-Up", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 50, thumb: "pulldown" },
          { name: "Row Machine", alt: "Barbell Bent-Over Row", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 40, thumb: "row" },
          { name: "Pull-Up", alt: "Lat Pulldown", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "to positive failure", weight: null, thumb: "pulldown" },
        ],
      },
      {
        id: "maxot-chest",
        name: "Chest & Triceps",
        dayLabel: "Thursday",
        minutes: 60,
        exercises: [
          { name: "Incline Bench Press", alt: "Incline Dumbbell Press", tempo: [3, 0, 1, 1], sets: 3, reps: 6, repsRange: "4-6", weight: 50, thumb: "incline" },
          { name: "Flat Barbell Bench Press", alt: "Flat Dumbbell Press", tempo: [3, 0, 1, 1], sets: 3, reps: 6, repsRange: "4-6", weight: 60, thumb: "bench" },
          { name: "Weighted Dip", alt: "Chest Dip", tempo: [3, 0, 1, 1], sets: 1, reps: 6, repsRange: "4-6", weight: 10, thumb: "dip" },
          { name: "Incline Dumbbell Tricep Extension", alt: "Lying Tricep Extension", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 25, thumb: "skull" },
          { name: "Lying Tricep Extension", alt: "Close-Grip Bench Press", tempo: [3, 0, 1, 1], sets: 1, reps: 6, repsRange: "4-6", weight: 25, thumb: "skull" },
          { name: "Cable Pushdown", alt: "Overhead Rope Extension", tempo: [2, 0, 2, 1], sets: 1, reps: 6, repsRange: "4-6", weight: 20, thumb: "pushdown" },
        ],
      },
      {
        id: "maxot-arms",
        name: "Biceps & Forearms",
        dayLabel: "Friday",
        minutes: 60,
        exercises: [
          { name: "Barbell Curl", alt: "EZ-Bar Curl", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 25, thumb: "curl" },
          { name: "Dumbbell Alternate Curl", alt: "Dumbbell Curl", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 12, thumb: "curl" },
          { name: "Hammer Curl", alt: "Incline Dumbbell Curl", tempo: [3, 0, 1, 1], sets: 2, reps: 6, repsRange: "4-6", weight: 12, thumb: "hammer" },
          { name: "Barbell Wrist Curl", alt: "Standing Dumbbell Wrist Curl", tempo: [2, 0, 2, 1], sets: 2, reps: 8, repsRange: "6-8", weight: 20, thumb: "curl" },
          { name: "Standing Dumbbell Wrist Curl", alt: "Barbell Wrist Curl", tempo: [2, 0, 2, 1], sets: 2, reps: 8, repsRange: "6-8", weight: 12, thumb: "curl" },
        ],
      },
    ],
  },
};

window.VELA_PROGRAM = window.VELA_PROGRAMS["bro-split"];
