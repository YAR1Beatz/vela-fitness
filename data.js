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

  function ensureWorkoutFields(w) {
    if (!w.sessionId) w.sessionId = uid("ses");
    if (w.timerAccumMs == null) w.timerAccumMs = 0;
    if (w.timerPaused == null) w.timerPaused = true;
    if (w.timerStartedAt === undefined) w.timerStartedAt = null;
    if (w.timerElapsedFinal === undefined) w.timerElapsedFinal = null;
    (w.exercises || []).forEach((ex) => {
      if (!ex.id) ex.id = uid("ex");
      if (!ex.key && ex.name) ex.key = C().slug(ex.name);
    });
  }

  function migrate(state) {
    const ver = state.version || 1;
    if (ver < 2) {
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
    }
    if (state.version < 3) {
      /* v3: workout edits (add/swap/remove/reorder) are the source of truth
         and already carry into future weeks via advanceWeek. No data rewrite. */
      state.version = 3;
    }
    if (state.version < 4) {
      const program = PROGRAM();
      state.programId = state.programId || program.id || "bro-split";
      state.cycleWeeks = program.cycleWeeks || 5;
      /* Existing installs already have a 4-day plan; don't force the setup step. */
      if (state.daysPerWeek == null) {
        const hasDelts = (state.workouts || []).some((w) => w.id === "delts");
        state.daysPerWeek = hasDelts ? 5 : 4;
      }
      state.version = 4;
    }
    if (state.cycleWeeks == null) state.cycleWeeks = (PROGRAM().cycleWeeks || 5);
    (state.workouts || []).forEach(ensureWorkoutFields);
    return state;
  }

  function seedState() {
    const program = PROGRAM();
    return {
      version: 4,
      programId: program.id,
      week: 1,
      cycleWeeks: program.cycleWeeks || 5,
      daysPerWeek: null,
      restSeconds: program.restSeconds || 90,
      activeWorkoutId: null,
      workouts: program.workouts.map(buildWorkout),
      history: {},
      notes: {},
      lastLogged: {},
    };
  }

  function cycleWeeks() {
    return get().cycleWeeks || PROGRAM().cycleWeeks || 5;
  }

  function isCycleEnd(week) {
    const w = week == null ? (get().week || 1) : week;
    const n = cycleWeeks();
    return n > 0 && w > 0 && w % n === 0;
  }

  function weekLabel(week) {
    const w = week == null ? (get().week || 1) : week;
    const n = cycleWeeks();
    if (w <= n) return `Week ${w} of ${n}`;
    return `Week ${w}`;
  }

  function programName() {
    return (PROGRAM() && PROGRAM().name) || "Bro Split";
  }

  function shoulderNameSet() {
    const five = PROGRAM().fiveDay || {};
    const names = five.shoulderNames || [];
    return new Set(names.map((n) => C().slug(n)));
  }

  function isShoulderExercise(ex) {
    if (!ex || !ex.name) return false;
    if (shoulderNameSet().has(C().slug(ex.name))) return true;
    const cat = C().findExercise(ex.name);
    return !!(cat && cat.category === "Shoulders");
  }

  function applySuggestions(workout) {
    (workout.exercises || []).forEach((ex) => {
      const sug = suggestionFor(ex.name, ex.programReps, ex.programWeight);
      ex.suggestedReps = sug.reps;
      ex.suggestedWeight = sug.weight;
    });
  }

  function resetWorkoutSession(w) {
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
  }

  function flushLoggedSessions() {
    const s = get();
    s.workouts.forEach((w) => {
      if (w.exercises.some((ex) => ex.sets.some((st) => st.done))) upsertSessionHistory(w);
    });
  }

  function armsAndDeltsTemplates() {
    const program = PROGRAM();
    const arms4 = (program.workouts || []).find((w) => w.id === "arms");
    const five = program.fiveDay || {};
    return {
      arms4,
      armsName4: (five.armsDay4Name) || (arms4 && arms4.name) || "Biceps, Triceps & Delts",
      armsName5: five.armsName || "Arms (Biceps & Triceps)",
      deltsSrc: five.delts || { id: "delts", name: "Delts", minutes: 60, extras: [] },
    };
  }

  function buildDeltsFromArms(arms) {
    const { deltsSrc } = armsAndDeltsTemplates();
    const moved = (arms.exercises || []).filter(isShoulderExercise);
    const extras = (deltsSrc.extras || []).filter((src) => {
      const key = C().slug(src.name);
      return !moved.some((ex) => ex.key === key);
    }).map(buildExercise);
    const exercises = moved.concat(extras);
    const delts = buildWorkout({
      id: deltsSrc.id || "delts",
      name: deltsSrc.name || "Delts",
      minutes: deltsSrc.minutes || 60,
      exercises: [],
    });
    delts.exercises = exercises;
    applySuggestions(delts);
    return delts;
  }

  function setDaysPerWeek(days, { rebuild } = {}) {
    const s = get();
    const next = Number(days) === 5 ? 5 : 4;
    if (rebuild) {
      const keptHistory = s.history;
      const keptNotes = s.notes;
      const keptLast = s.lastLogged;
      const week = 1;
      const rest = s.restSeconds;
      state = seedState();
      state.history = keptHistory;
      state.notes = keptNotes;
      state.lastLogged = keptLast;
      state.restSeconds = rest;
      state.week = week;
      state.daysPerWeek = next;
      if (next === 5) applyFiveDaySplit(state);
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
      return state;
    }
    if (s.daysPerWeek === next) {
      saveNow();
      return s;
    }
    if (next === 5) applyFiveDaySplit(s);
    else applyFourDayMerge(s);
    s.daysPerWeek = next;
    saveNow();
    notify();
    return s;
  }

  function applyFiveDaySplit(s) {
    const { armsName5 } = armsAndDeltsTemplates();
    const list = s.workouts || [];
    let arms = list.find((w) => w.id === "arms");
    if (!arms) return;
    if (list.some((w) => w.id === "delts")) {
      arms.name = armsName5;
      return;
    }
    const kept = (arms.exercises || []).filter((ex) => !isShoulderExercise(ex));
    const delts = buildDeltsFromArms(arms);
    arms.exercises = kept;
    arms.name = armsName5;
    const idx = list.indexOf(arms);
    list.splice(idx + 1, 0, delts);
  }

  function applyFourDayMerge(s) {
    const { armsName4 } = armsAndDeltsTemplates();
    const list = s.workouts || [];
    const arms = list.find((w) => w.id === "arms");
    const dIdx = list.findIndex((w) => w.id === "delts");
    if (dIdx < 0) {
      if (arms) arms.name = armsName4;
      return;
    }
    const delts = list[dIdx];
    if (arms) {
      const have = new Set((arms.exercises || []).map((ex) => ex.key));
      (delts.exercises || []).forEach((ex) => {
        if (!have.has(ex.key)) {
          arms.exercises.push(ex);
          have.add(ex.key);
        }
      });
      arms.name = armsName4;
    } else {
      delts.id = "arms";
      delts.name = armsName4;
      return;
    }
    list.splice(dIdx, 1);
  }

  function resetCycle(days) {
    const s = get();
    flushLoggedSessions();
    if (days) setDaysPerWeek(days);
    s.week = 1;
    s.activeWorkoutId = null;
    s.workouts.forEach(resetWorkoutSession);
    saveNow();
    notify();
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
      if (state.cycleWeeks == null) state.cycleWeeks = (PROGRAM().cycleWeeks || 5);
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

  function resetToProgram(days) {
    const chosen = days || (state && state.daysPerWeek) || 4;
    setDaysPerWeek(chosen, { rebuild: true });
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
    flushLoggedSessions();
    s.week = (s.week || 1) + 1;
    s.activeWorkoutId = null;
    s.workouts.forEach(resetWorkoutSession);
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
      alt: alt != null ? alt : "",
      tempo: tempo || (catalog && catalog.tempo) || [3, 0, 1, 1],
      sets: sets || (prev.sets && prev.sets.length) || 3,
      reps: reps != null ? reps : (catalog && catalog.defaultReps) || 10,
      weight: weight !== undefined ? weight : (catalog ? catalog.defaultWeight : null),
      thumb: thumb || (catalog && catalog.thumb) || "generic",
    };
    const next = buildExercise(src);
    next.id = prev.id;
    w.exercises[exIndex] = next;
    saveNow();
    notify();
    return next;
  }

  function addExercise(workoutId, { name, alt, tempo, thumb, sets, reps, weight } = {}) {
    const w = workoutById(workoutId);
    if (!w) return null;
    const catalog = name ? C().findExercise(name) : null;
    const src = {
      name: name || "Exercise",
      alt: alt || "",
      tempo: tempo || (catalog && catalog.tempo) || [3, 0, 1, 1],
      sets: sets || 3,
      reps: reps != null ? reps : 10,
      weight: weight !== undefined ? weight : (catalog ? catalog.defaultWeight : null),
      thumb: thumb || (catalog && catalog.thumb) || "generic",
    };
    const ex = buildExercise(src);
    w.exercises.push(ex);
    saveNow();
    notify();
    return ex;
  }

  function removeExercise(workoutId, exIndex) {
    const w = workoutById(workoutId);
    if (!w || !w.exercises[exIndex]) return null;
    const removed = { workoutId, index: exIndex, exercise: w.exercises[exIndex] };
    w.exercises.splice(exIndex, 1);
    saveNow();
    notify();
    return removed;
  }

  function restoreExercise(workoutId, exercise, index) {
    const w = workoutById(workoutId);
    if (!w || !exercise) return;
    const i = Math.max(0, Math.min(index == null ? w.exercises.length : index, w.exercises.length));
    w.exercises.splice(i, 0, exercise);
    saveNow();
    notify();
  }

  function moveExercise(workoutId, from, to) {
    const w = workoutById(workoutId);
    if (!w) return;
    const list = w.exercises;
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
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
  function kgEqual(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.005;
  }

  function compareSet(current, previous) {
    if (!current || !previous) return null;
    if (previous.weight == null && previous.reps == null) return null;
    const cw = current.weight, pw = previous.weight;
    const cr = current.reps, pr = previous.reps;
    if (cw != null && pw != null) {
      if (!kgEqual(cw, pw) && cw > pw) return "up";
      if (!kgEqual(cw, pw) && cw < pw) return "down";
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

  /* Logged volume only: untracked / suggested values are not counted.
     Bodyweight (no kg) contributes a reps total instead of a misleading 0Kg. */
  function setsVolume(sets) {
    let kg = 0;
    let repsOnly = 0;
    (sets || []).forEach((st) => {
      if (!st || (st.done === false)) return;
      /* History rows have no `done` flag; treat a row as logged if it has reps or weight. */
      const logged = st.done === true || (st.done == null && (st.reps != null || st.weight != null));
      if (!logged) return;
      const r = st.reps == null ? 0 : Number(st.reps);
      if (!Number.isFinite(r) || r <= 0) return;
      if (st.weight != null && Number(st.weight) > 0) kg += r * Number(st.weight);
      else repsOnly += r;
    });
    return { kg, repsOnly };
  }

  function addVolumes(a, b) {
    return { kg: (a && a.kg || 0) + (b && b.kg || 0), repsOnly: (a && a.repsOnly || 0) + (b && b.repsOnly || 0) };
  }

  function formatVolumeParts(vol) {
    const kg = vol && vol.kg ? vol.kg : 0;
    const reps = vol && vol.repsOnly ? vol.repsOnly : 0;
    const kgLabel = kg ? `${Math.round(kg)}Kg` : "";
    const repLabel = reps ? `${Math.round(reps)} reps` : "";
    if (kgLabel && repLabel) return `${kgLabel} + ${repLabel}`;
    if (kgLabel) return kgLabel;
    if (repLabel) return repLabel;
    return "0Kg";
  }

  function formatVolumeKg(value) {
    if (value && typeof value === "object") return formatVolumeParts(value);
    return `${Math.round(Number(value) || 0)}Kg`;
  }

  function volumeCompare(current, previous) {
    if (!previous) return null;
    const ck = current && current.kg || 0;
    const pk = previous.kg || 0;
    const cr = current && current.repsOnly || 0;
    const pr = previous.repsOnly || 0;
    if (!pk && !pr) return null;
    if (pk || ck) {
      if (!kgEqual(ck, pk) && ck > pk) return { sign: "up", text: `↑ +${Math.round(ck - pk)}Kg vs last`, delta: ck - pk };
      if (!kgEqual(ck, pk) && ck < pk) return { sign: "down", text: `↓ ${Math.round(ck - pk)}Kg vs last`, delta: ck - pk };
      if (cr > pr) return { sign: "up", text: `↑ +${Math.round(cr - pr)} reps vs last`, delta: 0 };
      if (cr < pr) return { sign: "down", text: `↓ ${Math.round(cr - pr)} reps vs last`, delta: 0 };
      return { sign: "same", text: "Same volume as last", delta: 0 };
    }
    if (cr > pr) return { sign: "up", text: `↑ +${Math.round(cr - pr)} reps vs last`, delta: 0 };
    if (cr < pr) return { sign: "down", text: `↓ ${Math.round(cr - pr)} reps vs last`, delta: 0 };
    return { sign: "same", text: "Same volume as last", delta: 0 };
  }

  function exerciseVolume(ex) {
    return setsVolume(ex && ex.sets);
  }

  function exerciseVolumeKg(ex) {
    return exerciseVolume(ex).kg;
  }

  function previousExerciseVolume(ex, sessionId) {
    const prev = previousSession(ex && ex.key, sessionId);
    if (!prev) return null;
    return setsVolume(prev.sets);
  }

  function targetVolume(ex) {
    const r = ex.suggestedReps || 0;
    const w = ex.suggestedWeight || 0;
    if (!w) return 0;
    return r * w * (ex.sets && ex.sets.length || 0);
  }

  function workoutVolume(workout) {
    return (workout && workout.exercises || []).reduce((sum, ex) => addVolumes(sum, exerciseVolume(ex)), { kg: 0, repsOnly: 0 });
  }

  function previousWorkoutSession(workout) {
    if (!workout) return null;
    let best = null;
    Object.keys(get().history || {}).forEach((key) => {
      (get().history[key] || []).forEach((h) => {
        if (h.sessionId === workout.sessionId) return;
        if (h.workoutId && h.workoutId !== workout.id) return;
        if (!h.workoutId && h.workout && h.workout !== workout.name) return;
        if (!best || (h.datetime || h.date || "") > (best.datetime || best.date || "")) {
          best = { sessionId: h.sessionId, datetime: h.datetime || h.date };
        }
      });
    });
    return best;
  }

  function previousWorkoutVolume(workout) {
    const prev = previousWorkoutSession(workout);
    if (!prev) return null;
    let total = { kg: 0, repsOnly: 0 };
    Object.keys(get().history || {}).forEach((key) => {
      (get().history[key] || []).forEach((h) => {
        if (h.sessionId === prev.sessionId) total = addVolumes(total, setsVolume(h.sets));
      });
    });
    return total;
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
    resetCycle,
    setDaysPerWeek,
    isCycleEnd,
    weekLabel,
    programName,
    cycleWeeks,
    isShoulderExercise,
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
    addExercise,
    removeExercise,
    restoreExercise,
    moveExercise,
    setNotes,
    getHistory,
    exerciseVolume,
    exerciseVolumeKg,
    previousExerciseVolume,
    targetVolume,
    workoutVolume,
    previousWorkoutVolume,
    volumeCompare,
    setsVolume,
    formatVolumeParts,
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
