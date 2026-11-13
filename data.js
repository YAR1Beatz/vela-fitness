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
      sessionId: uid("ses"),
      timerStartedAt: null,
      timerAccumMs: 0,
      timerPaused: true,
      timerElapsedFinal: null,
      exercises: (src.exercises || []).map(buildExercise),
    };
  }

  function ensureSession(workout) {
    if (workout && !workout.sessionId) workout.sessionId = uid("ses");
    return workout && workout.sessionId;
  }

  function migrate(state) {
    const ver = state.version || 1;
    if (ver >= 2) {
      (state.workouts || []).forEach((w) => {
        if (!w.sessionId) w.sessionId = uid("ses");
        if (w.timerAccumMs == null) w.timerAccumMs = 0;
        if (w.timerPaused == null) w.timerPaused = true;
        if (w.timerStartedAt === undefined) w.timerStartedAt = null;
        if (w.timerElapsedFinal === undefined) w.timerElapsedFinal = null;
      });
      return state;
    }
    (state.workouts || []).forEach((w) => {
      if (!w.sessionId) w.sessionId = uid("ses");
      if (w.timerStartedAt === undefined) w.timerStartedAt = null;
      if (w.timerAccumMs == null) w.timerAccumMs = 0;
      if (w.timerPaused == null) w.timerPaused = true;
      if (w.timerElapsedFinal === undefined) w.timerElapsedFinal = null;
    });
    Object.keys(state.history || {}).forEach((key) => {
      (state.history[key] || []).forEach((h) => {
        if (!h.sessionId) h.sessionId = uid("ses");
        if (!h.date && h.datetime) h.date = String(h.datetime).slice(0, 10);
        if (!Array.isArray(h.sets)) h.sets = [];
        h.sets = h.sets.map((s) => ({
          reps: s && s.reps != null ? s.reps : null,
          weight: s && s.weight != null ? s.weight : null,
        }));
      });
    });
    state.version = 2;
    return state;
  }

  function seedState() {
    const program = PROGRAM();
    return {
      version: 2,
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
      migrate(state);
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

  function upsertSessionHistory(w) {
    if (!w) return;
    ensureSession(w);
    const stamp = w.completedAt || new Date().toISOString();
    const day = stamp.slice(0, 10);
    w.exercises.forEach((ex) => {
      if (!ex.sets.some((st) => st.done)) return;
      const entry = {
        date: day,
        datetime: stamp,
        workout: w.name,
        workoutId: w.id,
        week: get().week,
        sessionId: w.sessionId,
        sets: ex.sets.map((st) =>
          st.done ? { reps: st.reps, weight: st.weight } : { reps: null, weight: null }
        ),
      };
      if (!state.history[ex.key]) state.history[ex.key] = [];
      const i = state.history[ex.key].findIndex((h) => h.sessionId === w.sessionId);
      if (i >= 0) state.history[ex.key][i] = entry;
      else state.history[ex.key].unshift(entry);
      const lastDone = [...ex.sets].reverse().find((st) => st.done);
      if (lastDone) state.lastLogged[ex.key] = { reps: lastDone.reps, weight: lastDone.weight };
    });
  }

  function advanceWeek() {
    const s = get();
    /* Flush any logged sets from this week into history before resetting. */
    s.workouts.forEach((w) => {
      if (w.exercises.some((ex) => ex.sets.some((st) => st.done))) upsertSessionHistory(w);
    });
    s.week = (s.week || 1) + 1;
    s.activeWorkoutId = null;
    s.workouts.forEach((w) => {
      w.completedAt = null;
      w.sessionId = uid("ses");
      w.timerStartedAt = null;
      w.timerAccumMs = 0;
      w.timerPaused = true;
      w.timerElapsedFinal = null;
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

  function pauseTimer(workoutId) {
    const w = workoutById(workoutId);
    if (!w || w.timerPaused) return;
    w.timerAccumMs = (w.timerAccumMs || 0) + (Date.now() - (w.timerStartedAt || Date.now()));
    w.timerPaused = true;
    w.timerStartedAt = null;
    scheduleSave();
  }

  function startTimer(workoutId) {
    const w = workoutById(workoutId);
    if (!w || w.completedAt) return;
    ensureSession(w);
    if (w.timerPaused || !w.timerStartedAt) {
      w.timerStartedAt = Date.now();
      w.timerPaused = false;
      if (w.timerAccumMs == null) w.timerAccumMs = 0;
      scheduleSave();
    }
  }

  function toggleTimer(workoutId) {
    const w = workoutById(workoutId);
    if (!w || w.completedAt) return;
    if (w.timerPaused || !w.timerStartedAt) startTimer(workoutId);
    else pauseTimer(workoutId);
    saveNow();
    return w;
  }

  function timerMs(workout) {
    if (!workout) return 0;
    if (workout.completedAt && workout.timerElapsedFinal != null) return workout.timerElapsedFinal;
    let ms = workout.timerAccumMs || 0;
    if (!workout.timerPaused && workout.timerStartedAt) ms += Date.now() - workout.timerStartedAt;
    return Math.max(0, ms);
  }

  function formatTimer(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function finishWorkout(id) {
    const w = workoutById(id);
    if (!w) return;
    if (!w.timerPaused) pauseTimer(id);
    w.timerElapsedFinal = w.timerAccumMs || 0;
    w.completedAt = new Date().toISOString();
    upsertSessionHistory(w);
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

  function trackSets(workoutId, exIndex, setIndexes, reps, weight) {
    const w = workoutById(workoutId);
    if (!w) return;
    const ex = w.exercises[exIndex];
    if (!ex) return;
    (setIndexes || []).forEach((i) => {
      const st = ex.sets[i];
      if (!st) return;
      updateSet(workoutId, exIndex, i, { reps, weight, done: true });
    });
    upsertSessionHistory(w);
    saveNow();
    notify();
    return ex;
  }

  function previousSession(exerciseKey, exceptSessionId) {
    const list = get().history[exerciseKey] || [];
    return list.find((h) => !exceptSessionId || h.sessionId !== exceptSessionId) || null;
  }

  /* Overload rule: compare this set to the same set number in the previous session.
     Higher weight = up, lower weight = down, same weight = same,
     except same weight with more reps = up, same weight with fewer reps = down. */
  function compareSet(current, previous) {
    if (!current || !previous) return null;
    if (previous.weight == null && previous.reps == null) return null;
    const cw = current.weight, pw = previous.weight;
    const cr = current.reps, pr = previous.reps;
    if (cw != null && pw != null) {
      if (cw > pw) return "up";
      if (cw < pw) return "down";
      if (cr != null && pr != null && cr > pr) return "up";
      if (cr != null && pr != null && cr < pr) return "down";
      return "same";
    }
    if (cr != null && pr != null) {
      if (cr > pr) return "up";
      if (cr < pr) return "down";
      return "same";
    }
    return null;
  }

  function setOverload(ex, setIndex, sessionId) {
    const set = ex && ex.sets[setIndex];
    if (!set || !set.done) return null;
    const prev = previousSession(ex.key, sessionId);
    if (!prev) return null;
    return compareSet(set, (prev.sets || [])[setIndex]);
  }

  function sessionSetOverload(entry, older) {
    if (!entry || !older) return [];
    return (entry.sets || []).map((s, i) => compareSet(s, (older.sets || [])[i]));
  }

  function exerciseOverloadSummary(ex, sessionId) {
    const prev = previousSession(ex.key, sessionId);
    if (!prev || !ex) return null;
    let dW = 0, nW = 0, dR = 0, nR = 0;
    ex.sets.forEach((s, i) => {
      if (!s.done) return;
      const p = (prev.sets || [])[i];
      if (!p) return;
      if (s.weight != null && p.weight != null) {
        dW += s.weight - p.weight;
        nW += 1;
      }
      if (s.reps != null && p.reps != null) {
        dR += s.reps - p.reps;
        nR += 1;
      }
    });
    if (!nW && !nR) return null;
    const avgW = nW ? dW / nW : 0;
    if (nW && Math.abs(avgW) > 1e-9) {
      const sign = avgW > 0 ? "up" : "down";
      const rounded = Math.round(avgW * 100) / 100;
      const abs = Math.abs(rounded);
      const num = Number.isInteger(abs) ? String(abs) : String(abs);
      const prefix = rounded > 0 ? "+" : "−";
      return { sign, deltaKg: avgW, text: `${prefix}${num} kg vs last week` };
    }
    if (dR > 0) return { sign: "up", deltaReps: dR, text: `+${dR} reps vs last week` };
    if (dR < 0) return { sign: "down", deltaReps: dR, text: `${dR} reps vs last week` };
    return { sign: "same", text: "Same as last week" };
  }

  function formatLogged(weight, reps) {
    if (weight != null && weight !== "" && reps != null && reps !== "") {
      return `${Number(weight).toFixed(2)}kg x ${reps}`;
    }
    if (reps != null && reps !== "") return `${reps} reps`;
    if (weight != null && weight !== "") return `${Number(weight).toFixed(2)}kg`;
    return "Set";
  }

  function formatAim(weight) {
    if (weight == null || weight === "") return "";
    const n = Number(weight);
    if (Number.isNaN(n)) return "";
    const s = Number.isInteger(n) ? String(n) : String(n);
    return `Aim for ${s}kg`;
  }

  function formatVolumeKg(value) {
    return `${Math.round(Number(value) || 0)}Kg`;
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
    ensureSession,
    startTimer,
    pauseTimer,
    toggleTimer,
    timerMs,
    formatTimer,
    trackSets,
    upsertSessionHistory,
    previousSession,
    compareSet,
    setOverload,
    sessionSetOverload,
    exerciseOverloadSummary,
    formatLogged,
    formatAim,
    formatVolumeKg,
  };
})(window);
