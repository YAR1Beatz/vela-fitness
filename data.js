/* localStorage persistence. Debounced saves — never block typing. */
(function (global) {
  const STORAGE_KEY = "vela-fitness-v1";
  const SAVE_DELAY = 280;
  const C = () => global.VELA_CATALOG;
  const PROGRAM = () => global.VELA_PROGRAM;

  let state = null;
  let saveTimer = null;
  let listeners = [];

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function emptySet(suggestedReps, suggestedWeight) {
    return {
      reps: null,
      weight: null,
      repsText: "",
      weightText: "",
      done: false,
    };
  }

  function makeSets(count, suggestedReps, suggestedWeight) {
    const sets = [];
    for (let i = 0; i < count; i++) sets.push(emptySet(suggestedReps, suggestedWeight));
    return sets;
  }

  function suggestionFor(name, fallbackReps, fallbackWeight) {
    if (!state) return { reps: fallbackReps, weight: fallbackWeight };
    const rec = state.lastLogged[C().slug(name)];
    if (rec && (rec.reps != null || rec.weight != null)) {
      return {
        reps: rec.reps != null ? rec.reps : fallbackReps,
        weight: rec.weight != null ? rec.weight : fallbackWeight,
      };
    }
    return { reps: fallbackReps, weight: fallbackWeight };
  }

  function buildExercise(src) {
    const catalog = C().findExercise(src.name);
    const thumb = src.thumb || (catalog && catalog.thumb) || "generic";
    const suggested = suggestionFor(src.name, src.reps, src.weight);
    return {
      id: uid("ex"),
      key: C().slug(src.name),
      name: src.name,
      alt: src.alt || "",
      tempo: Array.isArray(src.tempo) ? src.tempo.slice() : [3, 0, 1, 1],
      thumb,
      notes: (state && state.notes[C().slug(src.name)]) || "",
      suggestedReps: suggested.reps,
      suggestedWeight: suggested.weight,
      programReps: src.reps,
      programWeight: src.weight,
      sets: makeSets(src.sets || 3, suggested.reps, suggested.weight),
    };
  }

  function buildWorkout(src) {
    return {
      id: src.id || uid("wo"),
      name: src.name,
      minutes: src.minutes || 60,
      completedAt: null,
      exercises: (src.exercises || []).map(buildExercise),
    };
  }

  function seedState() {
    const program = PROGRAM();
    return {
      version: 1,
      programId: program.id,
      week: 1,
      restSeconds: program.restSeconds || 90,
      activeWorkoutId: null,
      workouts: program.workouts.map(buildWorkout),
      history: {},
      notes: {},
      lastLogged: {},
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = seedState();
        saveNow();
        return state;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.workouts)) {
        state = seedState();
        saveNow();
        return state;
      }
      state = parsed;
      if (!state.history) state.history = {};
      if (!state.notes) state.notes = {};
      if (!state.lastLogged) state.lastLogged = {};
      if (!state.restSeconds) state.restSeconds = PROGRAM().restSeconds || 90;
      if (!state.week) state.week = 1;
      return state;
    } catch (err) {
      state = seedState();
      return state;
    }
  }

  function get() {
    if (!state) load();
    return state;
  }

  function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* quota or private mode — keep going in memory */
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY);
  }

  function notify() {
    listeners.forEach((fn) => {
      try { fn(state); } catch (e) {}
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((x) => x !== fn);
    };
  }

  function workoutById(id) {
    return get().workouts.find((w) => w.id === id) || null;
  }

  function resetToProgram() {
    const keptHistory = state ? state.history : {};
    const keptNotes = state ? state.notes : {};
    const keptLast = state ? state.lastLogged : {};
    state = seedState();
    state.history = keptHistory;
    state.notes = keptNotes;
    state.lastLogged = keptLast;
    /* Re-apply last-logged suggestions onto the fresh seed. */
    state.workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        const sug = suggestionFor(ex.name, ex.programReps, ex.programWeight);
        ex.suggestedReps = sug.reps;
        ex.suggestedWeight = sug.weight;
        if (keptNotes[ex.key]) ex.notes = keptNotes[ex.key];
      });
    });
    saveNow();
    notify();
  }

  function advanceWeek() {
    const s = get();
    s.week = (s.week || 1) + 1;
    s.activeWorkoutId = null;
    s.workouts.forEach((w) => {
      w.completedAt = null;
      w.exercises.forEach((ex) => {
        const sug = suggestionFor(ex.name, ex.programReps, ex.programWeight);
        ex.suggestedReps = sug.reps;
        ex.suggestedWeight = sug.weight;
        ex.sets = ex.sets.map(() => emptySet());
      });
    });
    saveNow();
    notify();
  }

  function setRestSeconds(n) {
    get().restSeconds = Math.max(15, Math.min(600, Number(n) || 90));
    scheduleSave();
  }

  function addWorkout({ name, minutes, exercises }) {
    const src = {
      id: uid("wo"),
      name: name || "Workout",
      minutes: minutes || 60,
      exercises: exercises || [],
    };
    const workout = buildWorkout(src);
    get().workouts.push(workout);
    saveNow();
    notify();
    return workout;
  }

  function deleteWorkout(id) {
    const s = get();
    const idx = s.workouts.findIndex((w) => w.id === id);
    if (idx < 0) return null;
    const removed = s.workouts.splice(idx, 1)[0];
    if (s.activeWorkoutId === id) s.activeWorkoutId = null;
    saveNow();
    notify();
    return { workout: removed, index: idx };
  }

  function restoreWorkout(workout, index) {
    const s = get();
    const i = Math.max(0, Math.min(index, s.workouts.length));
    s.workouts.splice(i, 0, workout);
    saveNow();
    notify();
  }

  function finishWorkout(id) {
    const w = workoutById(id);
    if (!w) return;
    w.completedAt = new Date().toISOString();
    const day = w.completedAt.slice(0, 10);
    w.exercises.forEach((ex) => {
      const doneSets = ex.sets
        .filter((st) => st.done)
        .map((st) => ({
          reps: st.reps,
          weight: st.weight,
        }));
      if (!doneSets.length) return;
      const key = ex.key;
      if (!state.history[key]) state.history[key] = [];
      state.history[key].unshift({ date: day, sets: doneSets, workout: w.name });
      const last = doneSets[doneSets.length - 1];
      state.lastLogged[key] = { reps: last.reps, weight: last.weight };
    });
    state.activeWorkoutId = null;
    saveNow();
    notify();
  }

  function unfinishWorkout(id) {
    const w = workoutById(id);
    if (!w) return;
    w.completedAt = null;
    saveNow();
    notify();
  }

  function updateSet(workoutId, exIndex, setIndex, patch) {
    const w = workoutById(workoutId);
    if (!w) return null;
    const ex = w.exercises[exIndex];
    if (!ex) return null;
    const st = ex.sets[setIndex];
    if (!st) return null;
    if (Object.prototype.hasOwnProperty.call(patch, "repsText")) {
      st.repsText = C().normalizeInput(patch.repsText);
      st.reps = C().parseNum(st.repsText);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "weightText")) {
      st.weightText = C().normalizeInput(patch.weightText);
      st.weight = C().parseNum(st.weightText);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "reps")) {
      st.reps = patch.reps;
      st.repsText = patch.reps == null ? "" : String(patch.reps).replace(".", ",");
    }
    if (Object.prototype.hasOwnProperty.call(patch, "weight")) {
      st.weight = patch.weight;
      st.weightText = patch.weight == null ? "" : String(patch.weight).replace(".", ",");
    }
    if (Object.prototype.hasOwnProperty.call(patch, "done")) {
      st.done = !!patch.done;
      if (st.done) {
        if (st.reps == null) {
          st.reps = ex.suggestedReps;
          st.repsText = st.reps == null ? "" : String(st.reps).replace(".", ",");
        }
        if (st.weight == null && ex.suggestedWeight != null) {
          st.weight = ex.suggestedWeight;
          st.weightText = String(st.weight).replace(".", ",");
        }
      }
    }
    scheduleSave();
    return st;
  }

  function addSet(workoutId, exIndex) {
    const w = workoutById(workoutId);
    if (!w) return;
    const ex = w.exercises[exIndex];
    if (!ex) return;
    ex.sets.push(emptySet());
    saveNow();
    notify();
  }

  function removeSet(workoutId, exIndex, setIndex) {
    const w = workoutById(workoutId);
    if (!w) return;
    const ex = w.exercises[exIndex];
    if (!ex || ex.sets.length <= 1) return;
    const i = setIndex == null ? ex.sets.length - 1 : setIndex;
    ex.sets.splice(i, 1);
    saveNow();
    notify();
  }

  function swapExercise(workoutId, exIndex, { name, alt, tempo, thumb, sets, reps, weight }) {
    const w = workoutById(workoutId);
    if (!w) return;
    const prev = w.exercises[exIndex];
    if (!prev) return;
    const catalog = C().findExercise(name);
    const src = {
      name,
      alt: alt != null ? alt : prev.alt,
      tempo: tempo || (catalog && catalog.tempo) || prev.tempo,
      sets: sets || prev.sets.length,
      reps: reps != null ? reps : (catalog && catalog.defaultReps) || prev.programReps,
      weight: weight !== undefined ? weight : (catalog && catalog.defaultWeight) || prev.programWeight,
      thumb: thumb || (catalog && catalog.thumb) || "generic",
    };
    const next = buildExercise(src);
    next.id = prev.id;
    w.exercises[exIndex] = next;
    saveNow();
    notify();
  }

  function setNotes(exerciseKey, text) {
    const s = get();
    s.notes[exerciseKey] = text;
    s.workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        if (ex.key === exerciseKey) ex.notes = text;
      });
    });
    scheduleSave();
  }

  function getHistory(exerciseKey) {
    return (get().history[exerciseKey] || []).slice();
  }

  function exerciseVolume(ex) {
    return ex.sets.reduce((sum, st) => {
      if (!st.done) return sum;
      const r = st.reps || 0;
      const w = st.weight || 0;
      return sum + r * w;
    }, 0);
  }

  function targetVolume(ex) {
    const r = ex.suggestedReps || 0;
    const w = ex.suggestedWeight || 0;
    return r * w * ex.sets.length;
  }

  function doneExerciseCount(workout) {
    return workout.exercises.filter((ex) => ex.sets.length && ex.sets.every((s) => s.done)).length;
  }

  global.VELA_DATA = {
    STORAGE_KEY,
    load,
    get,
    saveNow,
    scheduleSave,
    onChange,
    workoutById,
    resetToProgram,
    advanceWeek,
    setRestSeconds,
    addWorkout,
    deleteWorkout,
    restoreWorkout,
    finishWorkout,
    unfinishWorkout,
    updateSet,
    addSet,
    removeSet,
    swapExercise,
    setNotes,
    getHistory,
    exerciseVolume,
    targetVolume,
    doneExerciseCount,
    suggestionFor,
    uid,
  };
})(window);
