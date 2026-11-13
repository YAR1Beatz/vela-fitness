/* VELA phone app. Full re-renders only on navigation / structural changes.
   Typing updates the focused input and patches chips/volume in place. */
(function () {
  const D = () => window.VELA_DATA;
  const C = () => window.VELA_CATALOG;

  let view = "home";
  let activeWorkoutId = null;
  let editing = null;
  let restTimer = null;
  let undoTimer = null;
  let undoPayload = null;

  const headerEl = () => document.getElementById("header");
  const contentEl = () => document.getElementById("content");
  const footerEl = () => document.getElementById("footer");
  const overlaysEl = () => document.getElementById("overlays");
  const toastEl = () => document.getElementById("toast");

  const ICONS = {
    logo: `<svg class="logo-mark" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 12.5c2.1-4.6 4.4-7.2 6-8.5 1.6 1.3 3.9 3.9 6 8.5" stroke="#1EE0C8" stroke-width="1.7" stroke-linecap="round"/><path d="M5.2 12.5c1.4-3 2.9-4.7 3.8-5.6 1 0.9 2.4 2.6 3.8 5.6" stroke="#1EE0C8" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/></svg>`,
    back: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M13.5 5.5 7.5 11l6 5.5" stroke="#E7F2FA" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    gear: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path stroke="#E7F2FA" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" d="M9.7 3.85c.1-.55.57-.95 1.13-.95h2.34c.56 0 1.03.4 1.13.95l.2 1.18c.5.14.97.36 1.39.64l1.1-.45c.53-.22 1.14 0 1.44.5l1.17 2.02c.3.52.2 1.18-.24 1.57l-.92.8c.1.48.16.98.16 1.5s-.06 1.02-.16 1.5l.92.8c.44.39.54 1.05.24 1.57l-1.17 2.02c-.3.5-.91.72-1.44.5l-1.1-.45c-.42.28-.89.5-1.39.64l-.2 1.18c-.1.55-.57.95-1.13.95h-2.34c-.56 0-1.03-.4-1.13-.95l-.2-1.18a6.4 6.4 0 0 1-1.39-.64l-1.1.45c-.53.22-1.14 0-1.44-.5L4.12 15.6c-.3-.52-.2-1.18.24-1.57l.92-.8A6.1 6.1 0 0 1 5.12 12c0-.52.06-1.02.16-1.5l-.92-.8c-.44-.39-.54-1.05-.24-1.57l1.17-2.02c.3-.5.91-.72 1.44-.5l1.1.45c.42-.28.89-.5 1.39-.64l.2-1.18z"/><circle cx="12" cy="12" r="2.55" stroke="#E7F2FA" stroke-width="1.6"/></svg>`,
    plus: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="#1EE0C8" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.2" stroke="#1EE0C8" stroke-width="1.4"/><path d="M8 7.2V11.2" stroke="#1EE0C8" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="5.2" r="0.8" fill="#1EE0C8"/></svg>`,
    chev: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4.5 12 9l-5 4.5" stroke="#7E93AB" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    checkFill: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="#1EE0C8"/><path d="M7.8 13.2 11.2 16.5 18.4 9.2" fill="none" stroke="#04261F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    checkEmpty: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="11" stroke="#1EE0C8" stroke-width="1.6" opacity="0.55"/></svg>`,
    history: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.2a4.8 4.8 0 1 1-4.4 3" stroke="#7E93AB" stroke-width="1.4" stroke-linecap="round"/><path d="M3 3.4v2.6h2.6M8 5.5V8l1.8 1.2" stroke="#7E93AB" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    notes: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4.2 2.8h5.2L12 5.4v7.8H4.2V2.8z" stroke="#7E93AB" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.3 2.8v2.8H12M6 8.2h4.2M6 10.6h3.2" stroke="#7E93AB" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    swap: `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M9.8 6A3.8 3.8 0 1 1 8.2 2.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8.05 1.35 8.3 3.05 6.6 3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clock: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.2a4.8 4.8 0 1 1-4.4 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M3 3.4v2.6h2.6M8 5.5V8l1.8 1.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pause: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><rect x="7" y="5.5" width="3.8" height="15" rx="1.2" fill="currentColor"/><rect x="15.2" y="5.5" width="3.8" height="15" rx="1.2" fill="currentColor"/></svg>`,
    play: `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M9 6.2v13.6L20.2 13 9 6.2z" fill="currentColor"/></svg>`,
    target: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activeWorkout() {
    return activeWorkoutId ? D().workoutById(activeWorkoutId) : null;
  }

  function formatTempo(t) {
    const a = t && t.length ? t : [3, 0, 1, 1];
    const [ecc, pause1, con, pause2] = [a[0], a[1], a[2], a[3]];
    return `<span class="t-lbl">Tempo</span><span class="t-sym">←→</span><b>${esc(ecc)}</b><span class="t-bars">||</span><b>${esc(pause1)}</b><span class="t-sym">→←</span><b>${esc(con)}</b><span class="t-bars">||</span><b>${esc(pause2)}</b>`;
  }

  function suggestionLabel(ex) {
    return C().formatSetLabel(ex.suggestedReps, ex.suggestedWeight);
  }

  function overloadMark(sign) {
    if (sign === "up") return { cls: "up", char: "↑" };
    if (sign === "down") return { cls: "down", char: "↓" };
    if (sign === "same") return { cls: "same", char: "=" };
    return { cls: "check", char: "✓" };
  }

  function chipInner(ex, set, exIndex, setIndex, workout) {
    if (set.done) {
      const sign = D().setOverload(ex, setIndex, workout && workout.sessionId);
      const mark = overloadMark(sign);
      const label = D().formatLogged(set.weight, set.reps);
      return `<span>${esc(label)}</span><span class="badge ${mark.cls}" data-overload="${esc(sign || "none")}">${mark.char}</span>`;
    }
    const reps = ex.suggestedReps != null ? ex.suggestedReps : 8;
    return esc(`${reps} reps`);
  }

  function chipClass(ex, set) {
    return set.done ? "chip logged" : "chip pending";
  }

  function renderHeader() {
    const w = activeWorkout();
    let mid = "";
    let left = `<span class="icon-btn" aria-hidden="true"></span>`;
    let extra = "";
    if (view === "workout" && w) {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div></div>`;
      left = `<button class="icon-btn" type="button" data-action="back" aria-label="Back to overview">${ICONS.back}</button>`;
      const running = !w.completedAt && !w.timerPaused && w.timerStartedAt;
      const icon = running ? ICONS.pause : ICONS.play;
      const label = running ? "Pause workout timer" : "Resume workout timer";
      extra = `<div class="workout-bar">
        <h1>${esc(w.name)}</h1>
        <button type="button" class="timer-btn${running ? "" : " paused"}" data-action="toggle-timer" data-testid="workout-timer" aria-label="${label}">
          ${icon}<span data-timer-clock>${esc(D().formatTimer(D().timerMs(w)))}</span>
        </button>
      </div>`;
    } else {
      const week = D().get().week || 1;
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub">Week ${week}</div></div>`;
    }
    headerEl().innerHTML = `<div class="header-row">${left}${mid}<button class="icon-btn" type="button" data-action="settings" aria-label="Settings">${ICONS.gear}</button></div>${extra}`;
  }

  function renderHome() {
    const s = D().get();
    contentEl().classList.add("has-footer");
    const tiles = s.workouts.map((w) => {
      const n = w.exercises.length;
      const done = !!w.completedAt;
      const mark = done
        ? `<div class="mark" aria-label="Done">${ICONS.checkFill}</div>`
        : `<div class="mark chev">${ICONS.chev}</div>`;
      return `<div class="swipe-row" data-swipe="workout" data-id="${esc(w.id)}">
        <button type="button" class="swipe-actions" data-action="delete-workout" data-id="${esc(w.id)}">Delete</button>
        <div class="swipe-front">
          <button type="button" class="tile${done ? " done" : ""}" data-action="open-workout" data-id="${esc(w.id)}" data-testid="workout-tile-${esc(w.id)}">
            <div class="meta"><h2>${esc(w.name)}</h2><p>${n} exercise${n === 1 ? "" : "s"} · ${esc(w.minutes)} mins</p></div>
            ${mark}
          </button>
        </div>
      </div>`;
    }).join("");
    contentEl().innerHTML = `
      <div class="section">
        <h1>This Week's Plan</h1>
        <button class="add" type="button" data-action="add-workout">${ICONS.plus} Add workout</button>
      </div>
      <div class="info">${ICONS.info}<span>Swipe left on the workout tile to delete</span></div>
      <div class="tiles" data-testid="week-plan">${tiles || `<div class="empty">No workouts this week. Tap Add workout to start.</div>`}</div>`;
    footerEl().classList.remove("hidden");
    footerEl().innerHTML = `<button class="program" type="button" data-action="next-week" data-testid="next-program">Get your next program</button>`;
  }

  function exerciseCard(ex, exIndex, workout) {
    const allDone = ex.sets.length && ex.sets.every((s) => s.done);
    const vol = D().exerciseVolume(ex);
    const target = D().targetVolume(ex);
    const pct = target > 0 ? Math.min(100, (vol / target) * 100) : (vol > 0 ? 100 : 0);
    const volLabel = D().formatVolumeKg(vol);
    const aim = D().formatAim(ex.suggestedWeight) || (ex.suggestedReps != null ? `Aim for ${ex.suggestedReps} reps` : "");
    const chips = ex.sets.map((set, i) =>
      `<button type="button" class="${chipClass(ex, set)}" data-action="chip" data-ex="${exIndex}" data-set="${i}" data-testid="set-chip-${exIndex}-${i}">${chipInner(ex, set, exIndex, i, workout)}</button>`
    ).join("");
    const summary = D().exerciseOverloadSummary(ex, workout && workout.sessionId);
    const summaryHtml = summary
      ? `<div class="overload-line ${summary.sign}" data-testid="overload-summary-${exIndex}">${esc((summary.sign === "up" ? "↑ " : summary.sign === "down" ? "↓ " : "= ") + summary.text)}</div>`
      : "";
    const altName = ex.alt || "Alternative";
    const alt = `<button type="button" class="alt" data-action="alt" data-ex="${exIndex}" aria-label="Swap for ${esc(altName)}"><span>${esc(altName)}</span><span class="alt-icons">${ICONS.clock}${ICONS.swap}</span></button>`;
    return `<div class="block" data-ex-block="${exIndex}" data-testid="exercise-card-${esc(ex.key)}">
      ${alt}
      <div class="card">
        <div class="top">
          <div class="thumb">${C().thumbMarkup(ex.thumb)}<div class="play">${C().playMarkup()}</div></div>
          <div class="body">
            <div class="name-row">
              <h3>${esc(ex.name)}</h3>
              <span class="check" data-ex-check="${exIndex}">${allDone ? ICONS.checkFill : ICONS.checkEmpty}</span>
            </div>
            <div class="tempo-arrows">${formatTempo(ex.tempo)}</div>
            <div class="actions-ref">
              <button type="button" class="ib" data-action="history" data-ex="${exIndex}">${ICONS.history} History</button>
              <button type="button" class="ib" data-action="notes" data-ex="${exIndex}">${ICONS.notes} Notes</button>
            </div>
          </div>
        </div>
        <div class="set-head"><div class="sh">Set Tracking</div></div>
        <div class="track-row">
          <div class="aim">${esc(aim)}</div>
          <div class="chips row" data-chips="${exIndex}">${chips}</div>
        </div>
        ${summaryHtml}
        <div class="vol">
          <div class="vl">Volume</div>
          <div class="track"><i data-volbar="${exIndex}" style="width:${pct}%"></i></div>
          <div class="amt" data-volamt="${exIndex}">${esc(volLabel)}</div>
          <span class="target" title="Target ${esc(D().formatVolumeKg(target))}" aria-label="Target ${esc(D().formatVolumeKg(target))}">${ICONS.target}</span>
        </div>
        <div class="set-tools">
          <button type="button" data-action="add-set" data-ex="${exIndex}">+ Add set</button>
          <button type="button" class="muted" data-action="remove-set" data-ex="${exIndex}">Remove set</button>
        </div>
      </div>
    </div>`;
  }

  function renderWorkout() {
    const w = activeWorkout();
    if (!w) {
      view = "home";
      render();
      return;
    }
    contentEl().classList.add("has-footer");
    const cards = w.exercises.map((ex, i) => exerciseCard(ex, i, w)).join("");
    contentEl().innerHTML = `
      <h1 class="ex-heading">Exercises</h1>
      <div class="info">${ICONS.info}<span>Swipe left on the exercise tile to pick an alternative</span></div>
      <div class="stack" data-testid="exercise-stack">${cards}</div>`;
    footerEl().classList.remove("hidden");
    footerEl().innerHTML = `<button class="cta" type="button" data-action="finish" data-testid="finish-workout">Finish workout</button>`;
    bindSwipeExercises();
  }

  function render() {
    const ae = document.activeElement;
    const typing = ae && ae.matches && ae.matches("input[data-field], textarea[data-notes]");
    if (typing) return;
    renderHeader();
    if (view === "workout") renderWorkout();
    else {
      contentEl().classList.add("has-footer");
      renderHome();
      bindSwipeWorkouts();
    }
  }

  function patchChip(exIndex, setIndex) {
    const w = activeWorkout();
    if (!w) return;
    const ex = w.exercises[exIndex];
    if (!ex) return;
    const set = ex.sets[setIndex];
    const el = contentEl().querySelector(`[data-testid="set-chip-${exIndex}-${setIndex}"]`);
    if (!el) return;
    el.innerHTML = chipInner(ex, set, exIndex, setIndex, w);
    el.className = chipClass(ex, set);
  }

  function patchVolume(exIndex) {
    const w = activeWorkout();
    if (!w) return;
    const ex = w.exercises[exIndex];
    if (!ex) return;
    const vol = D().exerciseVolume(ex);
    const target = D().targetVolume(ex);
    const pct = target > 0 ? Math.min(100, (vol / target) * 100) : (vol > 0 ? 100 : 0);
    const bar = contentEl().querySelector(`[data-volbar="${exIndex}"]`);
    const amt = contentEl().querySelector(`[data-volamt="${exIndex}"]`);
    if (bar) bar.style.width = `${pct}%`;
    if (amt) amt.textContent = D().formatVolumeKg(vol);
    const allDone = ex.sets.length && ex.sets.every((s) => s.done);
    const check = contentEl().querySelector(`[data-ex-check="${exIndex}"]`);
    if (check) check.innerHTML = allDone ? ICONS.checkFill : ICONS.checkEmpty;
  }

  function patchTimer() {
    const clock = headerEl().querySelector("[data-timer-clock]");
    const w = activeWorkout();
    if (!clock || !w) return;
    clock.textContent = D().formatTimer(D().timerMs(w));
  }

  function openTrackingSheet(exIndex, setIndex) {
    const w = activeWorkout();
    if (!w) return;
    const ex = w.exercises[exIndex];
    if (!ex) return;
    editing = { exIndex, setIndex, selected: { [setIndex]: true }, focus: "reps" };
    const repsPh = ex.suggestedReps == null ? "" : String(ex.suggestedReps);
    const wtPh = ex.suggestedWeight == null ? "" : String(ex.suggestedWeight);
    const pills = ex.sets.map((set, i) =>
      `<button type="button" class="set-pick${i === setIndex ? " on" : ""}" data-action="toggle-track-set" data-set="${i}" data-testid="track-set-pill-${i}">Set ${i + 1}</button>`
    ).join("");
    showSheet(`<div class="sheet tracking" data-testid="sets-tracking">
      <div class="handle"></div>
      <h2>Sets Tracking</h2>
      <div class="sheet-section">Select the sets to track</div>
      <div class="set-picks">
        ${pills}
        <button type="button" class="select-all" data-action="select-all-sets" data-testid="select-all-sets">Select All</button>
      </div>
      <div class="sheet-section">Enter weights and reps</div>
      <div class="fields">
        <label class="field on">
          <em>Reps</em>
          <input data-testid="reps-input" data-field="reps" data-ex="${exIndex}"
            inputmode="numeric" enterkeyhint="next" autocomplete="off" spellcheck="false"
            value="" placeholder="${esc(repsPh)}" />
        </label>
        <label class="field">
          <em>Weight (kg)</em>
          <input data-testid="weight-input" data-field="weight" data-ex="${exIndex}"
            inputmode="decimal" enterkeyhint="done" autocomplete="off" spellcheck="false"
            value="" placeholder="${esc(wtPh)}" />
        </label>
      </div>
      <button type="button" class="track-cta" data-action="track-reps" data-testid="track-reps">Track Reps</button>
    </div>`);
    const repsInput = overlaysEl().querySelector('[data-testid="reps-input"]');
    if (repsInput) repsInput.focus({ preventScroll: true });
  }

  function selectedSetIndexes() {
    if (editing && editing.selected) {
      return Object.keys(editing.selected).map(Number).filter((i) => editing.selected[i]).sort((a, b) => a - b);
    }
    return [];
  }

  function toggleTrackSet(setIndex) {
    if (!editing) return;
    if (!editing.selected) editing.selected = {};
    if (editing.selected[setIndex]) delete editing.selected[setIndex];
    else editing.selected[setIndex] = true;
    overlaysEl().querySelectorAll("[data-action=toggle-track-set]").forEach((btn) => {
      const i = Number(btn.dataset.set);
      btn.classList.toggle("on", !!editing.selected[i]);
    });
  }

  function selectAllSets() {
    const w = activeWorkout();
    if (!w || !editing) return;
    const ex = w.exercises[editing.exIndex];
    if (!ex) return;
    const allOn = ex.sets.every((_, i) => editing.selected && editing.selected[i]);
    editing.selected = {};
    if (!allOn) ex.sets.forEach((_, i) => { editing.selected[i] = true; });
    overlaysEl().querySelectorAll("[data-action=toggle-track-set]").forEach((btn) => {
      const i = Number(btn.dataset.set);
      btn.classList.toggle("on", !!editing.selected[i]);
    });
  }

  function commitTrackedSets() {
    const w = activeWorkout();
    if (!w || !editing) return;
    const ex = w.exercises[editing.exIndex];
    if (!ex) return;
    const indexes = selectedSetIndexes();
    if (!indexes.length) return;
    const repsEl = overlaysEl().querySelector('[data-testid="reps-input"]');
    const wtEl = overlaysEl().querySelector('[data-testid="weight-input"]');
    const reps = C().parseNum(repsEl && repsEl.value) ?? ex.suggestedReps;
    const weight = C().parseNum(wtEl && wtEl.value) ?? ex.suggestedWeight;
    if (reps == null && weight == null) return;
    const exIndex = editing.exIndex;
    D().trackSets(w.id, exIndex, indexes, reps, weight);
    editing = null;
    closeSheet();
    renderWorkout();
    renderHeader();
    const last = indexes[indexes.length - 1];
    const isLastOfLast = exIndex === w.exercises.length - 1 && last === ex.sets.length - 1;
    if (!isLastOfLast) startRest(exIndex, last);
  }

  function startRest(exIndex, setIndex) {
    stopRest(false);
    const total = D().get().restSeconds || 90;
    const w = activeWorkout();
    const next = nextSetHint(exIndex, setIndex);
    restTimer = { remaining: total, total, next, interval: null };
    showRestSheet();
    restTimer.interval = setInterval(() => {
      if (!restTimer) return;
      restTimer.remaining -= 1;
      if (restTimer.remaining <= 0) {
        stopRest(true);
        return;
      }
      patchRest();
    }, 1000);
  }

  function nextSetHint(exIndex, setIndex) {
    const w = activeWorkout();
    if (!w) return "";
    let ei = exIndex;
    let si = setIndex + 1;
    if (si >= w.exercises[ei].sets.length) {
      ei += 1;
      si = 0;
    }
    if (ei >= w.exercises.length) return "";
    const ex = w.exercises[ei];
    const setNo = si + 1;
    return `Next · Set ${setNo} · ${suggestionLabel(ex)}`;
  }

  function formatClock(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function ringSvg(remaining, total) {
    const r = 70;
    const c = 2 * Math.PI * r;
    const t = total || 1;
    const frac = Math.max(0, Math.min(1, remaining / t));
    const dash = `${c * frac} ${c}`;
    return `<svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true">
      <circle cx="84" cy="84" r="${r}" fill="none" stroke="#1A3048" stroke-width="10"/>
      <circle cx="84" cy="84" r="${r}" fill="none" stroke="#1EE0C8" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="0"
        transform="rotate(-90 84 84)"></circle>
    </svg>`;
  }

  function showRestSheet() {
    ensureOverlayHost();
    const host = overlaysEl().querySelector("[data-rest-host]");
    const t = restTimer;
    host.innerHTML = `<div class="overlay" data-overlay="rest" data-testid="rest-timer">
      <div class="sheet rest-sheet">
        <div class="handle"></div>
        <h2 class="rest-lbl">Rest</h2>
        <div class="ring-wrap">
          <div data-ring>${ringSvg(t.remaining, t.total)}</div>
          <div class="mid"><b data-rest-clock>${formatClock(t.remaining)}</b><em data-rest-of>of ${formatClock(t.total)}</em></div>
        </div>
        <div class="rest-acts">
          <button type="button" class="ghost" data-action="skip-rest">Skip rest</button>
          <button type="button" class="pri" data-action="add-rest">+15 seconds</button>
        </div>
        <div class="next-set">${t.next ? esc(t.next).replace(" · ", " · <b>") + "</b>" : ""}</div>
      </div>
    </div>`;
  }

  function patchRest() {
    if (!restTimer) return;
    const clock = overlaysEl().querySelector("[data-rest-clock]");
    const ring = overlaysEl().querySelector("[data-ring]");
    const of = overlaysEl().querySelector("[data-rest-of]");
    if (clock) clock.textContent = formatClock(restTimer.remaining);
    if (of) of.textContent = `of ${formatClock(restTimer.total)}`;
    if (ring) ring.innerHTML = ringSvg(restTimer.remaining, restTimer.total);
  }

  function stopRest(close) {
    if (restTimer && restTimer.interval) clearInterval(restTimer.interval);
    restTimer = null;
    if (close !== false) {
      const host = overlaysEl().querySelector("[data-rest-host]");
      if (host) host.innerHTML = "";
    }
  }

  function ensureOverlayHost() {
    if (!overlaysEl().querySelector("[data-rest-host]")) {
      overlaysEl().insertAdjacentHTML("beforeend", `<div data-rest-host></div><div data-sheet-host></div>`);
    }
  }

  function closeSheet() {
    const host = overlaysEl().querySelector("[data-sheet-host]");
    if (host) host.innerHTML = "";
  }

  function showSheet(html) {
    ensureOverlayHost();
    overlaysEl().querySelector("[data-sheet-host]").innerHTML = `<div class="overlay" data-overlay="sheet">${html}</div>`;
  }

  function showConfirm({ title, body, confirm, danger, onConfirm }) {
    showSheet(`<div class="dialog" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
        <button type="button" class="btn ${danger ? "danger" : "pri"}" data-confirm="ok">${esc(confirm)}</button>
      </div>
    </div>`);
    const btn = overlaysEl().querySelector("[data-confirm=ok]");
    btn.addEventListener("click", () => {
      closeSheet();
      onConfirm();
    }, { once: true });
  }

  function showToast(message, actionLabel, onAction) {
    const el = toastEl();
    el.classList.remove("hidden");
    el.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button type="button" data-toast-action>${esc(actionLabel)}</button>` : ""}`;
    const btn = el.querySelector("[data-toast-action]");
    if (undoTimer) clearTimeout(undoTimer);
    if (btn && onAction) {
      btn.addEventListener("click", () => {
        el.classList.add("hidden");
        if (undoTimer) clearTimeout(undoTimer);
        onAction();
      }, { once: true });
    }
    undoTimer = setTimeout(() => el.classList.add("hidden"), 5000);
  }

  function openSettings() {
    const rest = D().get().restSeconds || 90;
    showSheet(`<div class="sheet">
      <div class="handle"></div>
      <h2>Settings</h2>
      <div class="sheet-body">
        <div class="settings-row">
          <span>Rest timer</span>
          <div class="stepper">
            <button type="button" data-action="rest-dec" aria-label="Shorter rest">−</button>
            <b data-rest-value>${rest}s</b>
            <button type="button" data-action="rest-inc" aria-label="Longer rest">+</button>
          </div>
        </div>
        <div class="settings-row">
          <span>Default program</span>
          <button type="button" class="add" data-action="reset-program">Reset</button>
        </div>
        <p class="empty" style="text-align:left;padding:16px 0 0">VELA keeps everything on this phone. Edit program.js to change the default workouts.</p>
      </div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
    </div>`);
  }

  function bumpRest(delta) {
    const cur = D().get().restSeconds || 90;
    const next = Math.max(15, Math.min(300, cur + delta));
    D().setRestSeconds(next);
    D().saveNow();
    const el = overlaysEl().querySelector("[data-rest-value]");
    if (el) el.textContent = `${next}s`;
  }

  function openAddWorkout() {
    const items = C().EXERCISES.map((ex, i) =>
      `<label class="pick-item"><input type="checkbox" data-pick="${i}" hidden>
       <span class="mini-thumb">${C().thumbMarkup(ex.thumb)}</span><span>${esc(ex.name)}</span></label>`
    ).join("");
    showSheet(`<div class="sheet">
      <div class="handle"></div>
      <h2>Add workout</h2>
      <div class="sheet-body">
        <label class="field-label">Name</label>
        <input class="text-input" data-new-name placeholder="e.g. Push" maxlength="48" />
        <label class="field-label">Exercises</label>
        <input class="search-input" data-filter placeholder="Search or type a custom name" />
        <div class="pick-list" data-pick-list>${items}</div>
        <button type="button" class="add" data-action="add-custom-ex">+ Add custom exercise</button>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
        <button type="button" class="btn pri" data-action="create-workout">Add workout</button>
      </div>
    </div>`);
    const filter = overlaysEl().querySelector("[data-filter]");
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      overlaysEl().querySelectorAll("[data-pick-list] .pick-item").forEach((row) => {
        const name = row.textContent.toLowerCase();
        row.style.display = !q || name.includes(q) ? "" : "none";
      });
    });
    overlaysEl().querySelector("[data-pick-list]").addEventListener("click", (e) => {
      const row = e.target.closest(".pick-item");
      if (!row) return;
      const box = row.querySelector("input");
      box.checked = !box.checked;
      row.classList.toggle("on", box.checked);
    });
  }

  function createWorkoutFromSheet() {
    const name = (overlaysEl().querySelector("[data-new-name]").value || "").trim() || "Workout";
    const chosen = [];
    overlaysEl().querySelectorAll("[data-pick]:checked").forEach((box) => {
      const ex = C().EXERCISES[Number(box.dataset.pick)];
      if (ex) {
        chosen.push({
          name: ex.name,
          alt: "",
          tempo: ex.tempo,
          sets: 3,
          reps: ex.defaultReps,
          weight: ex.defaultWeight,
          thumb: ex.thumb,
        });
      }
    });
    overlaysEl().querySelectorAll("[data-custom-ex]").forEach((row) => {
      const n = (row.querySelector("input") && row.querySelector("input").value || "").trim();
      if (n) chosen.push({ name: n, alt: "", tempo: [3, 0, 1, 1], sets: 3, reps: 8, weight: null, thumb: "generic" });
    });
    if (!chosen.length) {
      showToast("Pick at least one exercise");
      return;
    }
    closeSheet();
    D().addWorkout({ name, minutes: 60, exercises: chosen });
    render();
  }

  function addCustomExerciseRow() {
    const list = overlaysEl().querySelector("[data-pick-list]");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "pick-item on";
    row.setAttribute("data-custom-ex", "1");
    row.innerHTML = `<span class="mini-thumb">${C().thumbMarkup("generic")}</span><input class="text-input" placeholder="Custom exercise name" style="border:0;background:transparent;padding:0" />`;
    list.appendChild(row);
    const input = row.querySelector("input");
    input.focus();
  }

  function openAlt(exIndex) {
    const w = activeWorkout();
    const ex = w.exercises[exIndex];
    const items = C().EXERCISES.map((item, i) =>
      `<button type="button" class="pick-item${C().slug(item.name) === ex.key ? " on" : ""}" data-action="pick-alt" data-ex="${exIndex}" data-pick="${i}">
        <span class="mini-thumb">${C().thumbMarkup(item.thumb)}</span><span>${esc(item.name)}</span>
      </button>`
    ).join("");
    const sug = ex.alt
      ? `<button type="button" class="pick-item on" data-action="use-suggested-alt" data-ex="${exIndex}">
          <span class="mini-thumb">${C().thumbMarkup((C().findExercise(ex.alt) || {}).thumb || "generic")}</span>
          <span>Use ${esc(ex.alt)}</span>
        </button>`
      : "";
    showSheet(`<div class="sheet">
      <div class="handle"></div>
      <h2>Alternative exercise</h2>
      <div class="sheet-body">
        ${sug}
        <input class="search-input" data-filter placeholder="Search or type a custom name" style="margin-top:10px" />
        <div class="pick-list" data-pick-list>${items}</div>
        <label class="field-label">Custom</label>
        <input class="text-input" data-custom-alt placeholder="Type an exercise name" />
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
        <button type="button" class="btn pri" data-action="apply-custom-alt" data-ex="${exIndex}">Use custom</button>
      </div>
    </div>`);
    const filter = overlaysEl().querySelector("[data-filter]");
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      overlaysEl().querySelectorAll("[data-pick-list] .pick-item").forEach((row) => {
        const name = row.textContent.toLowerCase();
        row.style.display = !q || name.includes(q) ? "" : "none";
      });
    });
  }

  function applyAlt(exIndex, name) {
    const catalog = C().findExercise(name);
    D().swapExercise(activeWorkoutId, exIndex, {
      name,
      alt: "",
      tempo: catalog && catalog.tempo,
      thumb: catalog && catalog.thumb,
      reps: catalog && catalog.defaultReps,
      weight: catalog && catalog.defaultWeight,
    });
    closeSheet();
    editing = null;
    render();
  }

  function openHistory(exIndex) {
    const w = activeWorkout();
    const ex = w.exercises[exIndex];
    const hist = D().getHistory(ex.key);
    const rows = hist.map((h, idx) => {
      const older = hist[idx + 1] || null;
      const signs = D().sessionSetOverload(h, older);
      const sets = (h.sets || []).map((s, i) => {
        if (s.reps == null && s.weight == null) return "";
        const sign = signs[i];
        const mark = sign ? overloadMark(sign) : null;
        const badge = mark ? `<span class="badge ${mark.cls}">${mark.char}</span>` : "";
        return `<div class="set-line">Set ${i + 1} · ${esc(D().formatLogged(s.weight, s.reps))} ${badge}</div>`;
      }).join("");
      const when = h.date ? new Date(h.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
      const week = h.week ? ` · Week ${esc(h.week)}` : "";
      return `<div class="hist-item" data-testid="history-entry"><div class="when">${esc(when)}${h.workout ? " · " + esc(h.workout) : ""}${week}</div><div class="sets signs">${sets}</div></div>`;
    }).join("");
    showSheet(`<div class="sheet" data-testid="history-sheet">
      <div class="handle"></div>
      <h2>${esc(ex.name)}</h2>
      <div class="sheet-body">${rows || `<div class="empty">No history yet. Track a set or finish a workout to log it.</div>`}</div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
    </div>`);
  }

  function openNotes(exIndex) {
    const w = activeWorkout();
    const ex = w.exercises[exIndex];
    showSheet(`<div class="sheet">
      <div class="handle"></div>
      <h2>Notes</h2>
      <div class="sheet-body">
        <p class="hint" style="margin:0 0 8px">${esc(ex.name)}</p>
        <textarea data-notes data-key="${esc(ex.key)}" placeholder="Cues, setup, how it felt…">${esc(ex.notes || "")}</textarea>
      </div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
    </div>`);
    const ta = overlaysEl().querySelector("[data-notes]");
    ta.addEventListener("input", () => {
      D().setNotes(ex.key, ta.value);
    });
  }

  function requestDeleteWorkout(id) {
    const w = D().workoutById(id);
    if (!w) return;
    showConfirm({
      title: `Delete ${w.name}?`,
      body: "This removes the workout from this week. You can undo for a few seconds after.",
      confirm: "Delete",
      danger: true,
      onConfirm: () => {
        const removed = D().deleteWorkout(id);
        render();
        if (!removed) return;
        showToast(`${removed.workout.name} deleted`, "Undo", () => {
          D().restoreWorkout(removed.workout, removed.index);
          render();
        });
      },
    });
  }

  function requestNextWeek() {
    const next = (D().get().week || 1) + 1;
    showConfirm({
      title: `Start week ${next}?`,
      body: "Your workout list stays the same. Completion resets, and last logged weights become the new suggestions.",
      confirm: `Start week ${next}`,
      danger: false,
      onConfirm: () => {
        D().advanceWeek();
        view = "home";
        activeWorkoutId = null;
        editing = null;
        stopRest(true);
        render();
      },
    });
  }

  function requestReset() {
    showConfirm({
      title: "Reset to default program?",
      body: "This week’s plan is replaced with the default VELA program. History and last logged weights are kept.",
      confirm: "Reset",
      danger: true,
      onConfirm: () => {
        D().resetToProgram();
        view = "home";
        activeWorkoutId = null;
        editing = null;
        stopRest(true);
        closeSheet();
        render();
      },
    });
  }

  function requestFinish() {
    const w = activeWorkout();
    if (!w) return;
    showConfirm({
      title: "Finish workout?",
      body: "This marks the workout done on this week’s plan and saves completed sets to History.",
      confirm: "Finish",
      danger: false,
      onConfirm: () => {
        D().finishWorkout(w.id);
        view = "home";
        activeWorkoutId = null;
        editing = null;
        stopRest(true);
        render();
      },
    });
  }

  /* Swipe helpers */
  function bindSwipe(selector, onOpen) {
    contentEl().querySelectorAll(selector).forEach((row) => {
      let startX = 0, startY = 0, dx = 0, tracking = false, decided = false, horizontal = false;
      const front = row.querySelector(".swipe-front") || row;
      row.addEventListener("pointerdown", (e) => {
        if (e.button && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        dx = 0;
        tracking = true;
        decided = false;
        horizontal = false;
        front.style.transition = "none";
      });
      row.addEventListener("pointermove", (e) => {
        if (!tracking) return;
        const x = e.clientX - startX;
        const y = e.clientY - startY;
        if (!decided) {
          if (Math.abs(x) + Math.abs(y) < 8) return;
          decided = true;
          horizontal = Math.abs(x) > Math.abs(y) && Math.abs(x) > 6;
          if (horizontal) {
            try { row.setPointerCapture(e.pointerId); } catch (err) {}
          } else {
            tracking = false;
            front.style.transition = "";
            return;
          }
        }
        if (!horizontal) return;
        dx = Math.min(0, x);
        if (dx < -120) dx = -120;
        front.style.transform = `translateX(${dx}px)`;
        e.preventDefault();
      });
      function end() {
        if (!tracking && !decided) return;
        tracking = false;
        front.style.transition = "";
        if (horizontal && dx < -56) {
          if (onOpen) onOpen(row);
          else row.classList.add("open");
          front.style.transform = "";
        } else {
          row.classList.remove("open");
          front.style.transform = "";
        }
      }
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
    });
  }

  function bindSwipeWorkouts() {
    bindSwipe(".swipe-row[data-swipe=workout]");
    contentEl().addEventListener("click", (e) => {
      if (e.target.closest(".swipe-actions")) return;
      if (!e.target.closest(".swipe-row.open")) {
        contentEl().querySelectorAll(".swipe-row.open").forEach((r) => r.classList.remove("open"));
      }
    }, { once: true });
  }

  function bindSwipeExercises() {
    contentEl().querySelectorAll("[data-ex-block]").forEach((block) => {
      let startX = 0, startY = 0, tracking = false, decided = false, horizontal = false, dx = 0;
      const card = block.querySelector(".card");
      block.addEventListener("pointerdown", (e) => {
        if (e.target.closest("input, textarea, button, a")) return;
        startX = e.clientX;
        startY = e.clientY;
        dx = 0;
        tracking = true;
        decided = false;
        horizontal = false;
        if (card) card.style.transition = "none";
      });
      block.addEventListener("pointermove", (e) => {
        if (!tracking) return;
        const x = e.clientX - startX;
        const y = e.clientY - startY;
        if (!decided) {
          if (Math.abs(x) + Math.abs(y) < 10) return;
          decided = true;
          horizontal = Math.abs(x) > Math.abs(y);
          if (!horizontal) { tracking = false; if (card) card.style.transition = ""; return; }
          try { block.setPointerCapture(e.pointerId); } catch (err) {}
        }
        dx = Math.min(0, x);
        if (card) card.style.transform = `translateX(${Math.max(dx, -80)}px)`;
      });
      function end() {
        if (!tracking && !decided) return;
        tracking = false;
        if (card) {
          card.style.transition = "";
          card.style.transform = "";
        }
        if (horizontal && dx < -56) {
          const exIndex = Number(block.getAttribute("data-ex-block"));
          openAlt(exIndex);
        }
      }
      block.addEventListener("pointerup", end);
      block.addEventListener("pointercancel", end);
    });
  }

  function onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) {
      if (e.target.closest(".overlay") && !e.target.closest(".sheet, .dialog, .rest-sheet")) {
        if (e.target.closest("[data-overlay=rest]")) return;
        closeSheet();
      }
      return;
    }
    const action = btn.dataset.action;
    const exIndex = btn.dataset.ex != null ? Number(btn.dataset.ex) : null;
    const setIndex = btn.dataset.set != null ? Number(btn.dataset.set) : null;

    if (action === "back") {
      editing = null;
      view = "home";
      D().get().activeWorkoutId = null;
      D().saveNow();
      activeWorkoutId = null;
      stopRest(true);
      render();
      return;
    }
    if (action === "settings") { openSettings(); return; }
    if (action === "close-sheet") { closeSheet(); D().saveNow(); return; }
    if (action === "open-workout") {
      activeWorkoutId = btn.dataset.id;
      D().get().activeWorkoutId = activeWorkoutId;
      D().startTimer(activeWorkoutId);
      D().saveNow();
      view = "workout";
      editing = null;
      render();
      return;
    }
    if (action === "toggle-timer") {
      if (activeWorkoutId) D().toggleTimer(activeWorkoutId);
      renderHeader();
      return;
    }
    if (action === "add-workout") { openAddWorkout(); return; }
    if (action === "create-workout") { createWorkoutFromSheet(); return; }
    if (action === "add-custom-ex") { addCustomExerciseRow(); return; }
    if (action === "delete-workout") { requestDeleteWorkout(btn.dataset.id); return; }
    if (action === "next-week") { requestNextWeek(); return; }
    if (action === "reset-program") { requestReset(); return; }
    if (action === "rest-inc") { bumpRest(15); return; }
    if (action === "rest-dec") { bumpRest(-15); return; }
    if (action === "finish") { requestFinish(); return; }
    if (action === "chip") { openTrackingSheet(exIndex, setIndex); return; }
    if (action === "toggle-track-set") { toggleTrackSet(setIndex); return; }
    if (action === "select-all-sets") { selectAllSets(); return; }
    if (action === "track-reps") { commitTrackedSets(); return; }
    if (action === "add-set") {
      D().addSet(activeWorkoutId, exIndex);
      render();
      return;
    }
    if (action === "remove-set") {
      const w = activeWorkout();
      const ex = w && w.exercises[exIndex];
      if (!ex || ex.sets.length <= 1) return;
      D().removeSet(activeWorkoutId, exIndex);
      if (editing && editing.exIndex === exIndex && editing.setIndex >= ex.sets.length - 1) {
        editing = null;
      }
      render();
      return;
    }
    if (action === "history") { openHistory(exIndex); return; }
    if (action === "notes") { openNotes(exIndex); return; }
    if (action === "alt") { openAlt(exIndex); return; }
    if (action === "use-suggested-alt") {
      const w = activeWorkout();
      const ex = w.exercises[exIndex];
      if (ex && ex.alt) applyAlt(exIndex, ex.alt);
      return;
    }
    if (action === "pick-alt") {
      const item = C().EXERCISES[Number(btn.dataset.pick)];
      if (item) applyAlt(exIndex, item.name);
      return;
    }
    if (action === "apply-custom-alt") {
      const name = (overlaysEl().querySelector("[data-custom-alt]") || {}).value;
      if (name && name.trim()) applyAlt(exIndex, name.trim());
      return;
    }
    if (action === "skip-rest") { stopRest(true); return; }
    if (action === "add-rest") {
      if (restTimer) {
        restTimer.remaining += 15;
        restTimer.total += 15;
        patchRest();
      }
      return;
    }
  }

  function onInput(e) {
    const input = e.target;
    if (!input.dataset || !input.dataset.field) return;
    /* Values stay in the input until Track Reps. Do not re-render or replace the field. */
    const field = input.dataset.field;
    if (editing) editing.focus = field;
    const fields = input.closest(".fields");
    if (fields) {
      fields.querySelectorAll(".field").forEach((f) => f.classList.toggle("on", f.contains(input)));
    }
  }

  function onFocusIn(e) {
    const input = e.target;
    if (!input.dataset || !input.dataset.field) return;
    if (editing) editing.focus = input.dataset.field;
    const fields = input.closest(".fields");
    if (fields) {
      fields.querySelectorAll(".field").forEach((f) => f.classList.toggle("on", f.contains(input)));
    }
  }

  function onKeydown(e) {
    const input = e.target;
    if (!input.dataset || !input.dataset.field) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.dataset.field === "reps") {
        const next = overlaysEl().querySelector('input[data-field="weight"]') || contentEl().querySelector('input[data-field="weight"]');
        if (next) next.focus({ preventScroll: true });
      } else {
        commitTrackedSets();
      }
    }
  }

  function init() {
    D().load();
    const s = D().get();
    if (s.activeWorkoutId && D().workoutById(s.activeWorkoutId)) {
      activeWorkoutId = s.activeWorkoutId;
      view = "workout";
      const w = D().workoutById(activeWorkoutId);
      if (w && !w.completedAt) D().startTimer(activeWorkoutId);
    }
    setInterval(patchTimer, 1000);
    ensureOverlayHost();
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", () => D().saveNow(), true);
    document.addEventListener("keydown", onKeydown);
    render();
    const flush = () => D().saveNow();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  window.VELA_APP = { render, get view() { return view; } };
  init();
})();
