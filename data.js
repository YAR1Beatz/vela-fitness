/* localStorage persistence. Debounced saves — never block typing. */
(function (global) {
  const STORAGE_KEY = "vela-fitness-v1";
  const SAVE_DELAY = 280;
  const C = () => global.VELA_CATALOG;
  const PROGRAMS = () => global.VELA_PROGRAMS || { [((global.VELA_PROGRAM || {}).id || "bro-split")]: global.VELA_PROGRAM };
  function baseProgramId(id) {
    if (!id) return "bro-split";
    if (id === "bro-split-4" || id === "bro-split-5") return "bro-split";
    return id;
  }

  const PROGRAM = () => {
    const all = PROGRAMS();
    const raw = (state && (state.activeProgramId || state.programId)) || "bro-split";
    const id = baseProgramId(raw);
    return all[id] || all["bro-split"] || global.VELA_PROGRAM;
  };

  function listPrograms() {
    const all = PROGRAMS();
    return Object.keys(all).map((id) => ({ id, name: all[id].name, author: all[id].author || "", cycleWeeks: all[id].cycleWeeks, defaultDays: all[id].defaultDays, restSeconds: all[id].restSeconds }));
  }

  function programFields(p) {
    return {
      week: p.week || 1,
      cycleWeeks: p.cycleWeeks,
      daysPerWeek: p.daysPerWeek,
      restSeconds: p.restSeconds,
      activeWorkoutId: p.activeWorkoutId || null,
      workouts: p.workouts,
      recoveryWeek: !!p.recoveryWeek,
      cycleStartedAt: p.cycleStartedAt || null,
    };
  }

  function seedProgramFields(id) {
    const all = PROGRAMS();
    const program = all[baseProgramId(id)] || all[id];
    if (!program) return null;
    /* buildExercise reads lastLogged from state — keep current shared history. */
    let days = program.defaultDays != null ? program.defaultDays : (baseProgramId(id) === "bro-split" ? 4 : program.workouts.length);
    if (id === "bro-split-5") days = 5;
    if (id === "bro-split-4") days = 4;
    const workouts = program.workouts.map(buildWorkout);
    const fields = {
      week: 1,
      cycleWeeks: program.cycleWeeks || 8,
      daysPerWeek: days,
      restSeconds: program.restSeconds || 90,
      activeWorkoutId: null,
      workouts,
      recoveryWeek: false,
      cycleStartedAt: new Date().toISOString(),
    };
    if (baseProgramId(id) === "bro-split" && days === 5) applyFiveDaySplit(fields);
    return fields;
  }

  function syncUp(s) {
    if (!s || !s.programs || !s.activeProgramId) return;
    const p = s.programs[s.activeProgramId] || (s.programs[s.activeProgramId] = {});
    p.week = s.week;
    p.cycleWeeks = s.cycleWeeks;
    p.daysPerWeek = s.daysPerWeek;
    p.restSeconds = s.restSeconds;
    p.activeWorkoutId = s.activeWorkoutId;
    p.workouts = s.workouts;
    p.recoveryWeek = !!s.recoveryWeek;
    if (s.cycleStartedAt) p.cycleStartedAt = s.cycleStartedAt;
    else if (p.cycleStartedAt) s.cycleStartedAt = p.cycleStartedAt;
  }

  function syncDown(s) {
    const p = s.programs && s.programs[s.activeProgramId];
    if (!p) return;
    s.week = p.week || 1;
    s.cycleWeeks = p.cycleWeeks;
    s.daysPerWeek = p.daysPerWeek;
    s.restSeconds = p.restSeconds;
    s.activeWorkoutId = p.activeWorkoutId || null;
    s.workouts = p.workouts;
    s.recoveryWeek = !!p.recoveryWeek;
    s.programId = s.activeProgramId;
    if (p.cycleStartedAt) s.cycleStartedAt = p.cycleStartedAt;
  }

  function resolveProgramId(id) {
    if (!id) return "bro-split-4";
    if (id === "bro-split") {
      const s = state;
      return (s && s.lastBroSplitId) || (s && s.programs && s.programs["bro-split-5"] && !s.programs["bro-split-4"] ? "bro-split-5" : "bro-split-4");
    }
    return id;
  }

  function switchProgram(id) {
    const s = get();
    const all = PROGRAMS();
    const target = resolveProgramId(id);
    if (!all[baseProgramId(target)]) return s;
    if ((s.activeProgramId || s.programId) === target) return s;
    syncUp(s);
    if (!s.programs[target]) s.programs[target] = seedProgramFields(target);
    s.activeProgramId = target;
    s.programId = target;
    if (baseProgramId(target) === "bro-split") s.lastBroSplitId = target;
    syncDown(s);
    saveNow();
    notify();
    return s;
  }

  function listProgramChoices() {
    return [
      { id: "bro-split-4", baseId: "bro-split", days: 4, name: "Bro Split – 4 Day", testid: "program-option-bro-split", meta: "5-week cycle · 4 days" },
      { id: "bro-split-5", baseId: "bro-split", days: 5, name: "Bro Split – 5 Day", testid: "program-option-bro-split-5", meta: "5-week cycle · 5 days · Delts day" },
      { id: "max-ot", baseId: "max-ot", days: 5, name: "Max-OT", testid: "program-option-max-ot", meta: "Jeff Willet · 8 weeks + recovery · 5 days · 3 min rest" },
    ];
  }

  function programTitle(id, days) {
    const s = get();
    const pid = id || activeProgramId();
    const base = baseProgramId(pid);
    const n = days != null ? days : (s.daysPerWeek || (pid === "bro-split-5" ? 5 : 4));
    if (base === "max-ot") return "Max-OT";
    return n === 5 ? "Bro Split – 5 Day" : "Bro Split – 4 Day";
  }

  function programHeroName(id) {
    return baseProgramId(id || activeProgramId()) === "max-ot"
      ? "Seated Dumbbell Shoulder Press"
      : "Barbell Bench Press";
  }

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
      repsRange: src.repsRange || "",
      sets: makeSets(src.sets || 3, suggested.reps, suggested.weight),
    };
  }

  function buildWorkout(src) {
    return {
      id: src.id || uid("wo"),
      name: src.name,
      dayLabel: src.dayLabel || "",
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
    if (state.version < 5) {
      const id = state.activeProgramId || state.programId || "bro-split";
      state.activeProgramId = id;
      state.programId = id;
      if (!state.programs) state.programs = {};
      if (!state.programs[id]) {
        state.programs[id] = {
          week: state.week || 1,
          cycleWeeks: state.cycleWeeks,
          daysPerWeek: state.daysPerWeek,
          restSeconds: state.restSeconds,
          activeWorkoutId: state.activeWorkoutId || null,
          workouts: state.workouts,
          recoveryWeek: false,
        };
      }
      if (!state.sessions) state.sessions = [];
      if (!state.checkIns) state.checkIns = [];
      state.version = 5;
    }
    if (!state.sessions) state.sessions = [];
    if (!state.checkIns) state.checkIns = [];
    if (!state.programs) state.programs = {};
    if (!state.activeProgramId) state.activeProgramId = state.programId || "bro-split";
    /* Keep the active program object pointing at the same workouts array. */
    if (state.programs[state.activeProgramId]) {
      if (!state.programs[state.activeProgramId].workouts) {
        state.programs[state.activeProgramId].workouts = state.workouts;
      }
    }
    normalizeProgramSlots(state);
    (state.workouts || []).forEach(ensureWorkoutFields);
    return state;
  }

  function stampCycleStart(s, when) {
    const iso = when || new Date().toISOString();
    if (!s) return iso;
    s.cycleStartedAt = iso;
    if (s.programs && s.activeProgramId) {
      const p = s.programs[s.activeProgramId] || (s.programs[s.activeProgramId] = {});
      p.cycleStartedAt = iso;
    }
    return iso;
  }

  function normalizeProgramSlots(s) {
    if (!s) return s;
    if (!s.programs) s.programs = {};
    if (!s.uiTab) s.uiTab = "home";
    const raw = s.activeProgramId || s.programId || "bro-split";
    if (raw === "bro-split" && s.daysPerWeek != null) {
      const key = s.daysPerWeek === 5 ? "bro-split-5" : "bro-split-4";
      if (!s.programs[key]) s.programs[key] = s.programs["bro-split"] || programFields(s);
      s.activeProgramId = key;
      s.programId = key;
      s.lastBroSplitId = key;
    } else if (raw === "bro-split-4" || raw === "bro-split-5") {
      s.lastBroSplitId = raw;
    }
    const p = s.programs[s.activeProgramId];
    if (p && !p.cycleStartedAt && !s.cycleStartedAt) {
      /* Existing installs: count prior sessions toward the current cycle. */
      stampCycleStart(s, "1970-01-01T00:00:00.000Z");
    } else if (p && p.cycleStartedAt && !s.cycleStartedAt) {
      s.cycleStartedAt = p.cycleStartedAt;
    } else if (s.cycleStartedAt && p && !p.cycleStartedAt) {
      p.cycleStartedAt = s.cycleStartedAt;
    }
    return s;
  }

  function seedState() {
    const program = PROGRAMS()["bro-split"] || PROGRAM();
    const workouts = program.workouts.map(buildWorkout);
    const fields = {
      week: 1,
      cycleWeeks: program.cycleWeeks || 5,
      daysPerWeek: null,
      restSeconds: program.restSeconds || 90,
      activeWorkoutId: null,
      workouts,
      recoveryWeek: false,
    };
    return {
      version: 5,
      programId: "bro-split",
      activeProgramId: "bro-split",
      ...fields,
      programs: { "bro-split": fields },
      history: {},
      notes: {},
      lastLogged: {},
      sessions: [],
      checkIns: [],
    };
  }

  function cycleWeeks() {
    return get().cycleWeeks || PROGRAM().cycleWeeks || 5;
  }

  function isCycleEnd(week) {
    const s = get();
    if (s.recoveryWeek) return false;
    const w = week == null ? (s.week || 1) : week;
    const n = cycleWeeks();
    return n > 0 && w > 0 && w % n === 0;
  }

  function weekLabel(week) {
    const s = get();
    if (s.recoveryWeek) return "Recovery week";
    const w = week == null ? (s.week || 1) : week;
    const n = cycleWeeks();
    if (w <= n) return `Week ${w} of ${n}`;
    return `Week ${w}`;
  }

  function programName() {
    return (PROGRAM() && PROGRAM().name) || "Bro Split";
  }

  function activeProgramId() {
    return get().activeProgramId || get().programId || "bro-split";
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
      normalizeProgramSlots(state);
      stampCycleStart(state);
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
    if ((s.activeProgramId || s.programId) === "bro-split") normalizeProgramSlots(s);
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
    stampCycleStart(s);
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
      syncUp(state);
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
        programId: activeProgramId(),
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
    recordSession(w);
  }

  function recordSession(w) {
    if (!w) return;
    const logged = (w.exercises || []).some((ex) => (ex.sets || []).some((st) => st.done));
    if (!logged && !w.completedAt) return;
    const stamp = w.completedAt || new Date().toISOString();
    const vol = workoutVolume(w);
    const entry = {
      programId: activeProgramId(),
      workoutId: w.id,
      workoutName: w.name,
      week: get().week,
      sessionId: w.sessionId,
      date: stamp.slice(0, 10),
      datetime: stamp,
      durationMs: timerMs(w) || 0,
      volumeKg: vol && vol.kg || 0,
      completed: !!w.completedAt || logged,
    };
    if (!state.sessions) state.sessions = [];
    const i = state.sessions.findIndex((s) => s.sessionId === w.sessionId);
    if (i >= 0) state.sessions[i] = Object.assign({}, state.sessions[i], entry);
    else state.sessions.unshift(entry);
  }

  function startRecoveryWeek() {
    const s = get();
    flushLoggedSessions();
    s.recoveryWeek = true;
    s.activeWorkoutId = null;
    s.workouts.forEach(resetWorkoutSession);
    saveNow();
    notify();
  }

  function advanceWeek() {
    const s = get();
    flushLoggedSessions();
    if (s.recoveryWeek) {
      s.recoveryWeek = false;
      s.week = 1;
    } else if (isCycleEnd(s.week) && PROGRAM().recoveryWeek) {
      /* Max-OT: after the last training week, caller may send us here via Continue
         (new cycle) or startRecoveryWeek(). Continue skips the rest week. */
      s.week = 1;
    } else {
      s.week = (s.week || 1) + 1;
    }
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

  function historySetLogged(s) {
    return !!(s && (s.reps != null || s.weight != null));
  }

  function historyEntryLogged(h) {
    return !!(h && (h.sets || []).some(historySetLogged));
  }

  function previousSession(exerciseKey, exceptSessionId) {
    const list = get().history[exerciseKey] || [];
    return list.find((h) => (!exceptSessionId || h.sessionId !== exceptSessionId) && historyEntryLogged(h)) || null;
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

  function formatAim(weight, repsRange, reps) {
    const parts = [];
    if (repsRange === "to failure") parts.push("to failure");
    else if (repsRange) parts.push(`${String(repsRange).replace("-", "–")} reps`);
    if (weight != null && weight !== "") {
      const n = Number(weight);
      if (!Number.isNaN(n)) parts.push(`${Number.isInteger(n) ? String(n) : String(n)}kg`);
    }
    if (!parts.length) return "";
    return `Aim for ${parts.join(" · ")}`;
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
    return (get().history[exerciseKey] || []).filter(historyEntryLogged);
  }

  function cloneJSON(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function captureHistoryUndo() {
    const s = get();
    syncUp(s);
    return {
      history: cloneJSON(s.history || {}),
      sessions: cloneJSON(s.sessions || []),
      lastLogged: cloneJSON(s.lastLogged || {}),
      programs: cloneJSON(s.programs || {}),
      workouts: cloneJSON(s.workouts || []),
      activeProgramId: s.activeProgramId,
    };
  }

  function restoreHistoryUndo(snap) {
    const s = get();
    if (!snap) return;
    s.history = cloneJSON(snap.history || {});
    s.sessions = cloneJSON(snap.sessions || []);
    s.lastLogged = cloneJSON(snap.lastLogged || {});
    if (snap.programs) s.programs = cloneJSON(snap.programs);
    if (snap.workouts && !(snap.programs && snap.programs[s.activeProgramId])) {
      s.workouts = cloneJSON(snap.workouts);
    }
    if (s.programs && s.programs[s.activeProgramId] && s.programs[s.activeProgramId].workouts) {
      s.workouts = s.programs[s.activeProgramId].workouts;
      s.activeWorkoutId = s.programs[s.activeProgramId].activeWorkoutId;
    }
    saveNow();
    notify();
  }

  function findHistoryEntry(exerciseKey, sessionId) {
    return (get().history[exerciseKey] || []).find((h) => h.sessionId === sessionId) || null;
  }

  function allWorkouts() {
    const s = get();
    const list = [];
    const seen = new Set();
    const add = (w) => {
      if (!w || seen.has(w)) return;
      seen.add(w);
      list.push(w);
    };
    (s.workouts || []).forEach(add);
    Object.keys(s.programs || {}).forEach((id) => {
      (s.programs[id].workouts || []).forEach(add);
    });
    return list;
  }

  function recomputeLastLogged(exerciseKey) {
    const list = get().history[exerciseKey] || [];
    for (let i = 0; i < list.length; i += 1) {
      const last = [...(list[i].sets || [])].reverse().find(historySetLogged);
      if (last) {
        state.lastLogged[exerciseKey] = { reps: last.reps, weight: last.weight };
        return;
      }
    }
    if (state.lastLogged) delete state.lastLogged[exerciseKey];
  }

  function rebuildSessionRecord(sessionId) {
    const s = get();
    let vol = 0;
    let any = false;
    let meta = null;
    Object.keys(s.history || {}).forEach((key) => {
      (s.history[key] || []).forEach((h) => {
        if (h.sessionId !== sessionId) return;
        const v = setsVolume(h.sets);
        vol += v.kg || 0;
        if (historyEntryLogged(h)) {
          any = true;
          meta = h;
        }
      });
    });
    if (!s.sessions) s.sessions = [];
    const i = s.sessions.findIndex((x) => x.sessionId === sessionId);
    if (!any) {
      if (i >= 0) s.sessions.splice(i, 1);
      return;
    }
    if (i >= 0) s.sessions[i].volumeKg = vol;
    else if (meta) {
      s.sessions.unshift({
        programId: meta.programId,
        workoutId: meta.workoutId,
        workoutName: meta.workout,
        week: meta.week,
        sessionId,
        date: meta.date,
        datetime: meta.datetime,
        durationMs: 0,
        volumeKg: vol,
        completed: true,
      });
    }
  }

  function applyHistoryToCurrent(sessionId, exerciseKey) {
    allWorkouts().forEach((w) => {
      if (!w || w.sessionId !== sessionId) return;
      let anyDone = false;
      w.exercises.forEach((ex) => {
        if (exerciseKey && ex.key !== exerciseKey) {
          if (ex.sets.some((st) => st.done)) anyDone = true;
          return;
        }
        const entry = findHistoryEntry(ex.key, sessionId);
        ex.sets.forEach((st, i) => {
          const hs = entry && entry.sets && entry.sets[i];
          if (!historySetLogged(hs)) {
            st.done = false;
            st.reps = null;
            st.weight = null;
            st.repsText = "";
            st.weightText = "";
          } else {
            st.done = true;
            st.reps = hs.reps;
            st.weight = hs.weight;
            st.repsText = hs.reps == null ? "" : String(hs.reps).replace(".", ",");
            st.weightText = hs.weight == null ? "" : String(hs.weight).replace(".", ",");
            anyDone = true;
          }
        });
      });
      if (!anyDone) w.completedAt = null;
    });
  }

  function pruneEmptyHistoryEntry(exerciseKey, sessionId) {
    const list = get().history[exerciseKey] || [];
    const i = list.findIndex((h) => h.sessionId === sessionId);
    if (i < 0) return;
    if (!historyEntryLogged(list[i])) list.splice(i, 1);
  }

  function deleteHistorySet(exerciseKey, sessionId, setIndex) {
    const snap = captureHistoryUndo();
    const entry = findHistoryEntry(exerciseKey, sessionId);
    if (!entry || !entry.sets || !entry.sets[setIndex]) return null;
    entry.sets[setIndex] = { reps: null, weight: null };
    pruneEmptyHistoryEntry(exerciseKey, sessionId);
    applyHistoryToCurrent(sessionId, exerciseKey);
    recomputeLastLogged(exerciseKey);
    rebuildSessionRecord(sessionId);
    saveNow();
    notify();
    return snap;
  }

  function deleteHistoryExercise(exerciseKey, sessionId) {
    const snap = captureHistoryUndo();
    const list = get().history[exerciseKey] || [];
    const i = list.findIndex((h) => h.sessionId === sessionId);
    if (i < 0) return null;
    list.splice(i, 1);
    applyHistoryToCurrent(sessionId, exerciseKey);
    recomputeLastLogged(exerciseKey);
    rebuildSessionRecord(sessionId);
    saveNow();
    notify();
    return snap;
  }

  function deleteHistorySession(sessionId) {
    const snap = captureHistoryUndo();
    const s = get();
    const keys = [];
    Object.keys(s.history || {}).forEach((key) => {
      const before = (s.history[key] || []).length;
      s.history[key] = (s.history[key] || []).filter((h) => h.sessionId !== sessionId);
      if ((s.history[key] || []).length !== before) keys.push(key);
    });
    applyHistoryToCurrent(sessionId, null);
    keys.forEach(recomputeLastLogged);
    rebuildSessionRecord(sessionId);
    saveNow();
    notify();
    return snap;
  }

  function updateHistorySet(exerciseKey, sessionId, setIndex, { reps, weight } = {}) {
    const snap = captureHistoryUndo();
    const entry = findHistoryEntry(exerciseKey, sessionId);
    if (!entry || !entry.sets || !entry.sets[setIndex]) return null;
    if (reps !== undefined) entry.sets[setIndex].reps = reps;
    if (weight !== undefined) entry.sets[setIndex].weight = weight;
    if (!historySetLogged(entry.sets[setIndex])) entry.sets[setIndex] = { reps: null, weight: null };
    pruneEmptyHistoryEntry(exerciseKey, sessionId);
    applyHistoryToCurrent(sessionId, exerciseKey);
    recomputeLastLogged(exerciseKey);
    rebuildSessionRecord(sessionId);
    saveNow();
    notify();
    return snap;
  }

  function getSessionHistory(sessionId) {
    const s = get();
    const rows = [];
    Object.keys(s.history || {}).forEach((key) => {
      (s.history[key] || []).forEach((h) => {
        if (h.sessionId === sessionId && historyEntryLogged(h)) {
          rows.push({ key, entry: h });
        }
      });
    });
    rows.sort((a, b) => (a.entry.workout || "").localeCompare(b.entry.workout || "") || a.key.localeCompare(b.key));
    return rows;
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


  /* --- Calendar week (Monday start) in Europe/Copenhagen --- */
  function copenhagenYMD(date) {
    const d = date ? new Date(date) : new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(d); /* YYYY-MM-DD */
  }

  function addDaysYMD(ymd, days) {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${mm}-${dd}`;
  }

  function calendarWeekStart(ymd) {
    const [y, m, d] = (ymd || copenhagenYMD()).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    const offset = dow === 0 ? 6 : dow - 1;
    return addDaysYMD(ymd || copenhagenYMD(), -offset);
  }

  function inCalendarWeek(dateStr, start) {
    if (!dateStr) return false;
    const day = String(dateStr).slice(0, 10);
    return day >= start && day < addDaysYMD(start, 7);
  }

  function plannedWorkouts() {
    const s = get();
    if (s.daysPerWeek) return s.daysPerWeek;
    const n = (s.workouts || []).length;
    return n || (PROGRAM().defaultDays || 4);
  }

  function sessionDate(ses) {
    return (ses.date || (ses.datetime || "").slice(0, 10) || "");
  }

  function derivedSessions() {
    const s = get();
    const byId = {};
    (s.sessions || []).forEach((ses) => {
      if (ses && ses.sessionId) byId[ses.sessionId] = Object.assign({}, ses);
    });
    Object.keys(s.history || {}).forEach((key) => {
      (s.history[key] || []).forEach((h) => {
        if (!h || !h.sessionId) return;
        const existing = byId[h.sessionId];
        const vol = setsVolume(h.sets || []);
        if (!existing) {
          byId[h.sessionId] = {
            programId: h.programId || "bro-split",
            workoutId: h.workoutId,
            workoutName: h.workout,
            week: h.week,
            sessionId: h.sessionId,
            date: h.date || (h.datetime || "").slice(0, 10),
            datetime: h.datetime || h.date,
            durationMs: 0,
            volumeKg: vol.kg || 0,
            completed: true,
          };
        } else {
          existing.volumeKg = (existing.volumeKg || 0) + (vol.kg || 0) > existing.volumeKg
            ? existing.volumeKg /* already the workout total if recorded */
            : existing.volumeKg;
          if (!existing.programId) existing.programId = h.programId || "bro-split";
        }
      });
    });
    /* Current in-progress / finished workouts this week not yet flushed. */
    (s.workouts || []).forEach((w) => {
      if (!w.sessionId) return;
      const logged = (w.exercises || []).some((ex) => (ex.sets || []).some((st) => st.done));
      if (!logged && !w.completedAt) return;
      const vol = workoutVolume(w);
      const stamp = w.completedAt || new Date().toISOString();
      const prev = byId[w.sessionId];
      byId[w.sessionId] = Object.assign({}, prev, {
        programId: activeProgramId(),
        workoutId: w.id,
        workoutName: w.name,
        week: s.week,
        sessionId: w.sessionId,
        date: stamp.slice(0, 10),
        datetime: stamp,
        durationMs: (prev && prev.durationMs) || timerMs(w) || 0,
        volumeKg: vol.kg || 0,
        completed: !!w.completedAt || logged,
      });
    });
    return Object.values(byId);
  }

  function sessionsInWeek(start, programId) {
    return derivedSessions().filter((ses) => {
      if (programId && !sessionProgramMatches(ses, programId)) return false;
      return inCalendarWeek(sessionDate(ses), start) && ses.completed;
    });
  }

  function uniqueWorkouts(sessions) {
    const seen = new Set();
    sessions.forEach((ses) => {
      const key = ses.sessionId || `${ses.workoutId}-${ses.date}`;
      seen.add(key);
    });
    return seen.size;
  }

  function weekHasQuota(start, planned, programId) {
    return uniqueWorkouts(sessionsInWeek(start, programId)) >= planned;
  }

  /* Heaviest logged weight ever for an exercise (bodyweight / null ignored). */
  function personalBestWeight(exerciseKey) {
    let best = null;
    (get().history[exerciseKey] || []).forEach((h) => {
      (h.sets || []).forEach((st) => {
        if (st && st.weight != null && Number(st.weight) > 0) {
          const w = Number(st.weight);
          if (best == null || w > best) best = w;
        }
      });
    });
    (get().workouts || []).forEach((wo) => {
      (wo.exercises || []).forEach((ex) => {
        if (ex.key !== exerciseKey) return;
        (ex.sets || []).forEach((st) => {
          if (st.done && st.weight != null && Number(st.weight) > 0) {
            const w = Number(st.weight);
            if (best == null || w > best) best = w;
          }
        });
      });
    });
    return best;
  }

  function personalBestsThisWeek(start, programId) {
    /* A PB is a logged set this week whose weight is the exercise's all-time heaviest
       and is strictly heavier than any set logged before this week. */
    const s = get();
    const keys = new Set();
    const beforeMax = {};
    const weekMax = {};
    Object.keys(s.history || {}).forEach((key) => {
      (s.history[key] || []).forEach((h) => {
        if (programId && !sessionProgramMatches(h, programId)) return;
        const inWeek = inCalendarWeek(h.date || (h.datetime || "").slice(0, 10), start);
        (h.sets || []).forEach((st) => {
          if (st == null || st.weight == null || !(Number(st.weight) > 0)) return;
          const w = Number(st.weight);
          if (inWeek) weekMax[key] = Math.max(weekMax[key] || 0, w);
          else beforeMax[key] = Math.max(beforeMax[key] || 0, w);
        });
      });
    });
    (s.workouts || []).forEach((wo) => {
      (wo.exercises || []).forEach((ex) => {
        (ex.sets || []).forEach((st) => {
          if (!st.done || st.weight == null || !(Number(st.weight) > 0)) return;
          weekMax[ex.key] = Math.max(weekMax[ex.key] || 0, Number(st.weight));
        });
      });
    });
    const list = [];
    Object.keys(weekMax).forEach((key) => {
      const prev = beforeMax[key] || 0;
      if (weekMax[key] > prev) {
        keys.add(key);
        list.push({ key, name: key, weight: weekMax[key], previous: prev || null });
      }
    });
    return list;
  }

  function thisWeekVolume(start, programId) {
    /* Prefer per-exercise history (accurate kg) plus current unflushed sets. */
    let kg = 0;
    let repsOnly = 0;
    const s = get();
    const counted = new Set();
    Object.keys(s.history || {}).forEach((key) => {
      (s.history[key] || []).forEach((h) => {
        if (programId && !sessionProgramMatches(h, programId)) return;
        if (!inCalendarWeek(h.date || (h.datetime || "").slice(0, 10), start)) return;
        const id = `${h.sessionId}:${key}`;
        if (counted.has(id)) return;
        counted.add(id);
        const v = setsVolume(h.sets || []);
        kg += v.kg;
        repsOnly += v.repsOnly;
      });
    });
    (s.workouts || []).forEach((wo) => {
      const already = (wo.exercises || []).some((ex) =>
        (s.history[ex.key] || []).some((h) => h.sessionId === wo.sessionId)
      );
      if (already) return;
      const v = workoutVolume(wo);
      kg += v.kg;
      repsOnly += v.repsOnly;
    });
    return { kg, repsOnly };
  }

  function formatHoursSpent(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 60000));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  function weekStats(now) {
    const s = get();
    const programId = activeProgramId();
    const start = calendarWeekStart(copenhagenYMD(now));
    const planned = plannedWorkouts();
    const sessions = sessionsInWeek(start, programId);
    const completed = uniqueWorkouts(sessions);
    const remaining = Math.max(0, planned - completed);
    const vol = thisWeekVolume(start, programId);
    const pbs = personalBestsThisWeek(start, programId);
    const hoursMs = sessions.reduce((sum, ses) => sum + (ses.durationMs || 0), 0);
    /* Current in-progress timer counts toward hours if the workout has logged work. */
    (s.workouts || []).forEach((w) => {
      if (w.completedAt) return;
      const logged = (w.exercises || []).some((ex) => (ex.sets || []).some((st) => st.done));
      if (!logged && !w.timerStartedAt && !w.timerAccumMs) return;
      if (sessions.some((ses) => ses.sessionId === w.sessionId && ses.durationMs)) return;
      if (logged) hoursMs; /* already in derived sessions */
    });

    /* Streak: consecutive calendar weeks (before this one) that hit the quota.
       This week, if still in progress, does not break it. If this week already
       hit the quota, it is included. */
    let streak = 0;
    const thisHit = completed >= planned && planned > 0;
    let cursor = thisHit ? start : addDaysYMD(start, -7);
    /* If this week hasn't hit yet, start from last week. */
    if (!thisHit) {
      /* don't start counting from a future/empty last week with no data? still check */
    }
    for (let i = 0; i < 104; i += 1) {
      if (weekHasQuota(cursor, planned, programId)) streak += 1;
      else break;
      cursor = addDaysYMD(cursor, -7);
    }

    let subtitle;
    if (!planned) subtitle = "No workouts planned this week";
    else if (remaining === 0) subtitle = "Week complete";
    else if (remaining === 1) subtitle = "Complete 1 more workout this week";
    else subtitle = `Complete ${remaining} more workouts this week`;

    return {
      scope: "this week",
      scopeLabel: "This week",
      weekStart: start,
      programId,
      planned,
      completed,
      remaining,
      filled: Math.min(planned, completed),
      streak,
      subtitle,
      volumeKg: vol.kg,
      volumeLabel: formatVolumeParts(vol),
      personalBests: pbs.length,
      pbList: pbs,
      pbRule: "heaviest weight",
      workoutsCompleted: completed,
      hoursMs,
      hoursLabel: formatHoursSpent(hoursMs),
    };
  }

  function checkInDue(now) {
    const month = copenhagenYMD(now).slice(0, 7);
    return !(get().checkIns || []).some((c) => (c.date || "").slice(0, 7) === month);
  }

  function listCheckIns() {
    return (get().checkIns || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function saveCheckIn(entry) {
    const s = get();
    if (!s.checkIns) s.checkIns = [];
    const date = entry.date || copenhagenYMD();
    const next = {
      id: entry.id || uid("cin"),
      date,
      weight: entry.weight != null ? Number(entry.weight) : null,
      waist: entry.waist != null && entry.waist !== "" ? Number(entry.waist) : null,
      chest: entry.chest != null && entry.chest !== "" ? Number(entry.chest) : null,
      arms: entry.arms != null && entry.arms !== "" ? Number(entry.arms) : null,
      thighs: entry.thighs != null && entry.thighs !== "" ? Number(entry.thighs) : null,
      note: entry.note || "",
      photo: entry.photo || null,
    };
    const i = s.checkIns.findIndex((c) => c.date === date || c.id === next.id);
    if (i >= 0) s.checkIns[i] = Object.assign({}, s.checkIns[i], next, { id: s.checkIns[i].id });
    else s.checkIns.unshift(next);
    saveNow();
    notify();
    return next;
  }

  function deleteCheckIn(id) {
    const s = get();
    s.checkIns = (s.checkIns || []).filter((c) => c.id !== id);
    saveNow();
    notify();
  }

  function exerciseNameFromKey(key) {
    const list = (C().EXERCISES || []);
    const found = list.find((e) => C().slug(e.name) === key);
    if (found) return found.name;
    return String(key || "").replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  function cycleStartMs(s) {
    const st = s || get();
    const p = st.programs && st.programs[st.activeProgramId];
    const raw = (p && p.cycleStartedAt) || st.cycleStartedAt;
    const t = raw ? Date.parse(raw) : 0;
    return Number.isFinite(t) ? t : 0;
  }

  function sessionProgramMatches(ses, programId) {
    const pid = programId || activeProgramId();
    const sid = ses && ses.programId;
    if (!sid) return baseProgramId(pid) === "bro-split";
    if (sid === pid) return true;
    /* Pre-v9 sessions were stored as "bro-split". Count them for the Bro Split slot. */
    if (sid === "bro-split" && baseProgramId(pid) === "bro-split") return true;
    return false;
  }

  function sessionsInCycle(programId) {
    const s = get();
    const pid = programId || activeProgramId();
    const start = cycleStartMs(s);
    return (s.sessions || []).filter((ses) => {
      if (!sessionProgramMatches(ses, pid)) return false;
      const when = Date.parse(ses.datetime || ses.date || 0);
      if (start && Number.isFinite(when) && when < start) return false;
      return true;
    });
  }

  function uniqueWorkoutCount(list) {
    const seen = new Set();
    (list || []).forEach((ses) => {
      if (!ses) return;
      const key = ses.sessionId || `${ses.workoutId}-${ses.date}`;
      seen.add(key);
    });
    return seen.size;
  }

  function weekSessionsInCycle(week, programId) {
    return sessionsInCycle(programId).filter((ses) => Number(ses.week) === Number(week));
  }

  function cycleProgress() {
    const s = get();
    const plannedDays = plannedWorkouts() || s.daysPerWeek || (s.workouts || []).length || 4;
    const weeks = cycleWeeks();
    const current = s.recoveryWeek ? weeks : (s.week || 1);
    const totalWeeks = Math.max(weeks, current);
    const total = weeks * plannedDays;
    const sessions = sessionsInCycle();
    /* Current in-progress completions that may not be in sessions yet. */
    const extra = [];
    if (!s.recoveryWeek) {
      (s.workouts || []).forEach((w) => {
        if (!w.completedAt) return;
        if (sessions.some((ses) => ses.sessionId === w.sessionId)) return;
        extra.push({ sessionId: w.sessionId, workoutId: w.id, week: s.week, durationMs: timerMs(w) || 0, completed: true });
      });
    }
    const all = sessions.concat(extra);
    const done = uniqueWorkoutCount(all.filter((ses) => ses.completed !== false));
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const timeMs = all.reduce((sum, ses) => sum + (ses.durationMs || 0), 0);
    const weekCards = [];
    for (let w = 1; w <= totalWeeks; w += 1) {
      weekCards.push(weekProgress(w, plannedDays, sessions, extra));
    }
    return {
      done,
      total,
      pct,
      timeMs,
      timeLabel: formatHoursSpent(timeMs),
      plannedDays,
      cycleWeeks: weeks,
      currentWeek: s.week || 1,
      recoveryWeek: !!s.recoveryWeek,
      weeks: weekCards,
    };
  }

  function weekProgress(week, plannedDays, cycleSessions, extra) {
    const s = get();
    const planned = plannedDays || plannedWorkouts() || (s.workouts || []).length || 4;
    const list = (cycleSessions || sessionsInCycle()).filter((ses) => Number(ses.week) === Number(week));
    const more = (extra || []).filter((ses) => Number(ses.week) === Number(week));
    const done = uniqueWorkoutCount(list.concat(more));
    const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
    const isCurrent = !s.recoveryWeek && Number(s.week) === Number(week);
    return {
      week,
      planned,
      done,
      pct,
      complete: planned > 0 && done >= planned,
      current: isCurrent,
      sessions: list.concat(more),
    };
  }

  function allTimePersonalBests() {
    const s = get();
    const keys = new Set(Object.keys(s.history || {}));
    (s.workouts || []).forEach((w) => (w.exercises || []).forEach((ex) => { if (ex.key) keys.add(ex.key); }));
    const list = [];
    keys.forEach((key) => {
      const weight = personalBestWeight(key);
      if (weight == null) return;
      list.push({ key, name: exerciseNameFromKey(key), weight });
    });
    list.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
    return list;
  }

  function volumeTrend(exerciseKey, limit) {
    const cap = limit || 8;
    const hist = (getHistory(exerciseKey) || []).slice();
    const points = hist.slice(0, cap).reverse().map((h) => {
      const v = setsVolume(h.sets || []);
      return { date: h.date, sessionId: h.sessionId, kg: v.kg, repsOnly: v.repsOnly };
    });
    return points;
  }

  function exercisesWithHistory() {
    const s = get();
    const keys = new Set(Object.keys(s.history || {}).filter((k) => (getHistory(k) || []).length));
    const list = [];
    keys.forEach((key) => {
      const hist = getHistory(key) || [];
      const last = hist[0];
      const trend = volumeTrend(key, 8);
      list.push({
        key,
        name: exerciseNameFromKey(key),
        pb: personalBestWeight(key),
        sessions: hist.length,
        lastDate: last && last.date,
        lastWorkout: last && last.workout,
        trend,
      });
    });
    list.sort((a, b) => String(b.lastDate || "").localeCompare(String(a.lastDate || "")) || a.name.localeCompare(b.name));
    return list;
  }

  function workoutFromSession(sessionId) {
    const s = get();
    const ses = (s.sessions || []).find((row) => row.sessionId === sessionId) || null;
    const rows = getSessionHistory(sessionId);
    const exercises = rows.map((r) => ({
      id: r.key,
      key: r.key,
      name: exerciseNameFromKey(r.key),
      alt: "",
      tempo: [3, 0, 1, 1],
      notes: (s.notes && s.notes[r.key]) || "",
      suggestedReps: null,
      suggestedWeight: null,
      sets: (r.entry.sets || []).map((st) => {
        const logged = st && (st.reps != null || st.weight != null);
        return {
          reps: logged ? st.reps : null,
          weight: logged ? st.weight : null,
          repsText: "",
          weightText: "",
          done: !!logged,
        };
      }),
    }));
    return {
      id: (ses && ses.workoutId) || (rows[0] && rows[0].entry.workoutId) || sessionId,
      name: (ses && ses.workoutName) || (rows[0] && rows[0].entry.workout) || "Workout",
      dayLabel: "",
      minutes: 60,
      completedAt: (ses && (ses.datetime || ses.date)) || (rows[0] && rows[0].entry.datetime) || null,
      sessionId,
      timerStartedAt: null,
      timerAccumMs: (ses && ses.durationMs) || 0,
      timerPaused: true,
      timerElapsedFinal: (ses && ses.durationMs) || 0,
      review: true,
      exercises,
    };
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
    activeProgramId,
    cycleWeeks,
    isShoulderExercise,
    listPrograms,
    listProgramChoices,
    switchProgram,
    programTitle,
    programHeroName,
    baseProgramId,
    cycleProgress,
    weekProgress,
    weekSessionsInCycle,
    sessionsInCycle,
    allTimePersonalBests,
    volumeTrend,
    exercisesWithHistory,
    workoutFromSession,
    exerciseNameFromKey,
    stampCycleStart,
    startRecoveryWeek,
    weekStats,
    personalBestWeight,
    checkInDue,
    listCheckIns,
    saveCheckIn,
    deleteCheckIn,
    formatHoursSpent,
    copenhagenYMD,
    calendarWeekStart,
    plannedWorkouts,
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
    getSessionHistory,
    findHistoryEntry,
    captureHistoryUndo,
    restoreHistoryUndo,
    deleteHistorySet,
    deleteHistoryExercise,
    deleteHistorySession,
    updateHistorySet,
    historySetLogged,
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
