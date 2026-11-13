/* ========================================================================
 * VELA default program — THE file to edit when the exact exercise list
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

window.VELA_PROGRAM = {
  id: "vela-default",
  name: "VELA Program",
  restSeconds: 90,
  workouts: [
    {
      id: "chest",
      name: "Chest",
      minutes: 60,
      exercises: [
        { name: "Barbell Bench Press", alt: "Incline Dumbbell Press", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: 60, thumb: "bench" },
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
        { name: "Tricep Rope Pushdown", alt: "Overhead Rope Extension", tempo: [2, 0, 2, 1], sets: 3, reps: 12, weight: 20, thumb: "pushdown" },
        { name: "Skull Crusher", alt: "Close-Grip Bench Press", tempo: [3, 0, 1, 1], sets: 3, reps: 10, weight: 25, thumb: "skull" },
        { name: "Overhead Tricep Extension", alt: "Diamond Push-Up", tempo: [3, 0, 2, 1], sets: 3, reps: 12, weight: 12, thumb: "overhead-tri" },
      ],
    },
  ],
};
