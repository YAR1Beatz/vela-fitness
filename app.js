/* VELA phone app. Full re-renders only on navigation / structural changes.
   Typing updates the focused input and patches chips/volume in place. */
(function () {
  const D = () => window.VELA_DATA;
  const C = () => window.VELA_CATALOG;
  const VELA_VERSION = "29";
  const VELA_CACHE = "vela-v29";

  let view = "home";
  let tab = "home";
  let activeWorkoutId = null;
  let editing = null;
  let workoutEditMode = false;
  let pickerState = null;
  let daysSetupSource = null;
  let historyExIndex = null;
  let historyEditMode = false;
  let historySessionId = null;
  let historyKey = null;
  let weightHistoryEditMode = false;
  let programWeek = null;
  let reviewWorkout = null;
  let returnView = "home";
  let keyboardOpen = false;
  let restTimer = null;
  let undoTimer = null;
  let undoPayload = null;


  function isStandalonePwa() {
    return window.navigator.standalone === true
      || window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches;
  }

  /* iOS standalone PWAs often give a layout viewport ~100px shorter than the
     screen (Safari chrome still subtracted). position:fixed; bottom:0 then
     sits above a navy band. Prefer visualViewport, then screen.height when
     running as a home-screen app. Playwright is not standalone, so this is
     a no-op there. */
  function syncShellViewport() {
    const vv = window.visualViewport;
    const layoutH = window.innerHeight || 0;
    const visualH = vv ? vv.height : layoutH;
    const visualBottom = vv ? (vv.offsetTop + vv.height) : layoutH;
    let appH = Math.max(layoutH, visualH, visualBottom);
    const portrait = (window.innerWidth || 0) <= (layoutH || window.innerWidth || 0);
    if (!keyboardOpen && portrait && isStandalonePwa() && window.screen) {
      const screenH = window.screen.height || 0;
      const screenW = window.screen.width || 0;
      const vw = window.innerWidth || 0;
      const widthOk = !screenW || Math.abs(screenW - vw) <= 2
        || Math.abs(Math.min(screenW, screenH) - vw) <= 2;
      if (widthOk && screenH > appH + 24) appH = screenH;
    }
    const root = document.documentElement;
    root.style.setProperty("--app-height", `${Math.round(appH)}px`);
    const shift = Math.min(0, Math.round(layoutH - appH));
    root.style.setProperty("--viewport-bottom-shift", `${shift}px`);
  }

  const headerEl = () => document.getElementById("header");
  const contentEl = () => document.getElementById("content");
  const footerEl = () => document.getElementById("footer");
  const tabbarEl = () => document.getElementById("tabbar");
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
    reset: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.2 10a5.8 5.8 0 1 0 1.9-4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5.6 2.6v3.6h3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    close: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M6 6l10 10M16 6 6 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    more: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="5.5" cy="11" r="1.55" fill="currentColor"/><circle cx="11" cy="11" r="1.55" fill="currentColor"/><circle cx="16.5" cy="11" r="1.55" fill="currentColor"/></svg>`,
    drag: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3.5 6h11M3.5 9h11M3.5 12h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    trash: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 4.2h9.6M6.2 4.2V3h3.6v1.2M4.4 4.2 5 13h6l.6-8.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    flame: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.8s1.4 2.2 1.4 4.2c0 1.2-.6 2.2-1.4 2.2S10.6 8.2 10.6 7c0-1.4.6-2.8 1.4-4.2z" fill="currentColor" opacity=".9"/><path d="M12 22c-3.7 0-6.2-2.8-6.2-6.3 0-2.6 1.5-4.6 2.8-6.2.4 1.8 1.5 3 2.8 3.2-1-2.6.2-4.8 2.1-6.7 2.3 1.6 4.7 3.8 4.7 7.2C18.2 19.2 15.7 22 12 22z" fill="currentColor"/></svg>`,
    tape: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8.5h16v3.2H4V8.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.2 8.5v3.2M9.1 8.5v3.2M12 8.5v3.2M14.9 8.5v3.2M17.8 8.5v3.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 11.7 7 19.2h10L16 11.7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    tabHome: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 10.5 12 4.2l7.5 6.3V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.2h-3.6V20.5H6A1.5 1.5 0 0 1 4.5 19v-8.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    tabProgram: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.2 8.2h9.6M7.2 15.8h9.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.2 8.2c-1.8 0-3.2 1-3.2 2.3s1.4 2.3 3.2 2.3 3.2-1 3.2-2.3S9 8.2 7.2 8.2zM16.8 15.8c1.8 0 3.2-1 3.2-2.3s-1.4-2.3-3.2-2.3-3.2 1-3.2 2.3 1.4 2.3 3.2 2.3z" stroke="currentColor" stroke-width="1.7"/><path d="M10.4 10.5h3.2M10.4 13.5h3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    tabProgress: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 18.5V5.5M4.5 18.5h15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.8 14.2 11.2 10l3 2.6 4.4-5.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    tabCheckin: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.1" stroke="currentColor" stroke-width="1.7"/><path d="M5.8 19.2c.8-3.2 3.1-5 6.2-5s5.4 1.8 6.2 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    tabSettings: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" d="M9.7 3.85c.1-.55.57-.95 1.13-.95h2.34c.56 0 1.03.4 1.13.95l.2 1.18c.5.14.97.36 1.39.64l1.1-.45c.53-.22 1.14 0 1.44.5l1.17 2.02c.3.52.2 1.18-.24 1.57l-.92.8c.1.48.16.98.16 1.5s-.06 1.02-.16 1.5l.92.8c.44.39.54 1.05.24 1.57l-1.17 2.02c-.3.5-.91.72-1.44.5l-1.1-.45c-.42.28-.89.5-1.39.64l-.2 1.18c-.1.55-.57.95-1.13.95h-2.34c-.56 0-1.03-.4-1.13-.95l-.2-1.18a6.4 6.4 0 0 1-1.39-.64l-1.1.45c-.53.22-1.14 0-1.44-.5L4.12 15.6c-.3-.52-.2-1.18.24-1.57l.92-.8A6.1 6.1 0 0 1 5.12 12c0-.52.06-1.02.16-1.5l-.92-.8c-.44-.39-.54-1.05-.24-1.57l1.17-2.02c.3-.5.91-.72 1.44-.5l1.1.45c.42-.28.89-.5 1.39-.64l.2-1.18z"/><circle cx="12" cy="12" r="2.55" stroke="currentColor" stroke-width="1.6"/></svg>`,
    arrowUp: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.5 11 9 6.5l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    arrowDown: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.5 7 9 11.5 13.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    weekCheck: `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#1EE0C8"/><path d="M6.6 11.2 9.4 14 15.6 7.6" fill="none" stroke="#04261F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activeWorkout() {
    if (view === "review" && reviewWorkout) return reviewWorkout;
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
    if (sign === "up") return { cls: "up", char: "↑", label: "Progressed" };
    if (sign === "down") return { cls: "down", char: "↓", label: "Decreased" };
    if (sign === "same") return { cls: "same", char: "=", label: "Maintained" };
    return { cls: "check", char: "✓", label: "Logged" };
  }

  function overloadBadge(sign) {
    if (!sign) return "";
    const mark = overloadMark(sign);
    const icons = {
      up: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10 2.35c.4 0 .77.18 1.02.5l7.15 8.5c.52.62.08 1.55-.77 1.55H13v5.25c0 .66-.54 1.2-1.2 1.2H8.2c-.66 0-1.2-.54-1.2-1.2V12.9H2.6c-.85 0-1.29-.93-.77-1.55l7.15-8.5A1.3 1.3 0 0 1 10 2.35z"/></svg>',
      down: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10 17.65c-.4 0-.77-.18-1.02-.5l-7.15-8.5C1.31 8.03 1.75 7.1 2.6 7.1H7V1.85C7 1.19 7.54.65 8.2.65h3.6c.66 0 1.2.54 1.2 1.2V7.1h4.4c.85 0 1.29.93.77 1.55l-7.15 8.5a1.3 1.3 0 0 1-1.02.5z"/></svg>',
      same: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3.1" y="5.9" width="13.8" height="3" rx="1.3" fill="currentColor"/><rect x="3.1" y="11.1" width="13.8" height="3" rx="1.3" fill="currentColor"/></svg>',
      check: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.7 13.6L3.9 9.8l-1.5 1.5 5.3 5.3 10.2-10.2-1.5-1.5z"/></svg>',
    };
    const icon = icons[sign] || icons.check;
    return `<span class="badge ${mark.cls}" data-overload="${esc(sign)}" title="${esc(mark.label)}" aria-label="${esc(mark.label)}">${icon}</span>`;
  }

  function chipInner(ex, set, exIndex, setIndex, workout) {
    if (set.done) {
      const sign = D().setOverload(ex, setIndex, workout && workout.sessionId);
      const label = D().formatLogged(set.weight, set.reps);
      const badge = overloadBadge(sign || "check");
      return `<span class="chip-label">${esc(label)}</span>${badge}`;
    }
    const reps = ex.suggestedReps != null ? ex.suggestedReps : 8;
    return esc(`${reps} reps`);
  }

  function chipClass(ex, set) {
    return set.done ? "chip logged" : "chip pending";
  }

  function isProgramRoot() {
    return view === "program";
  }

  function renderHeader() {
    const w = activeWorkout() || reviewWorkout;
    if (isProgramRoot()) {
      headerEl().classList.add("hidden");
      headerEl().innerHTML = "";
      return;
    }
    headerEl().classList.remove("hidden");
    let mid = "";
    let left = `<span class="icon-btn" aria-hidden="true"></span>`;
    let extra = "";
    if ((view === "workout" || view === "review") && w) {
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
        ${view === "workout" && !w.completedAt ? `<button type="button" class="timer-reset" data-action="reset-timer" data-testid="reset-timer" aria-label="Reset workout timer">${ICONS.reset}</button>` : ""}
      </div>`;
    } else if (view === "days-setup") {
      mid = `<div class="brand"><div class="word logo-only">${ICONS.logo}</div></div>`;
    } else if (view === "program-week") {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub">Week ${esc(programWeek)}</div></div>`;
      left = `<button class="icon-btn" type="button" data-action="program-back" aria-label="Back to program">${ICONS.back}</button>`;
    } else if (view === "food") {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub">Food</div></div>`;
      left = `<button class="icon-btn" type="button" data-action="food-back" aria-label="Back to Home" data-testid="food-back">${ICONS.back}</button>`;
    } else if (view === "progress") {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub">Progress</div></div>`;
    } else if (view === "checkin") {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub">Check-in</div></div>`;
    } else if (view === "settings") {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub">Settings</div></div>`;
    } else {
      mid = `<div class="brand"><div class="word">${ICONS.logo}VELA</div><div class="sub" data-testid="week-label">${esc(D().weekLabel())}</div></div>`;
    }
    const right = view === "days-setup"
      ? `<span class="icon-btn" aria-hidden="true"></span>`
      : `<button class="icon-btn" type="button" data-action="settings" aria-label="Settings">${ICONS.gear}</button>`;
    if (view === "days-setup") {
      const canBack = daysSetupSource && daysSetupSource !== "first";
      left = canBack
        ? `<button class="icon-btn" type="button" data-action="setup-back" aria-label="Back">${ICONS.back}</button>`
        : `<span class="icon-btn" aria-hidden="true"></span>`;
      extra = `<div class="setup-progress" data-testid="days-setup-progress"><i></i></div>`;
    }
    headerEl().innerHTML = `<div class="header-row">${left}${mid}${right}</div>${extra}`;
  }

  function hideFooter() {
    footerEl().classList.add("hidden");
    footerEl().innerHTML = "";
  }

  function formatDeltaKg(delta) {
    if (delta == null || !Number.isFinite(Number(delta))) return "";
    const n = Number(delta);
    const abs = C().formatNumber(Math.abs(n));
    if (Math.abs(n) < 0.005) return "Same";
    return `${n > 0 ? "+" : "−"}${abs} kg`;
  }

  function deltaClass(delta) {
    if (delta == null || !Number.isFinite(Number(delta))) return "flat";
    const n = Number(delta);
    if (Math.abs(n) < 0.005) return "flat";
    /* Lower body weight is shown in green, higher in red. */
    return n < 0 ? "down" : "up";
  }

  function formatChartDate(ymd) {
    if (!ymd) return "";
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  }

  function smoothLinePath(pts) {
    if (!pts.length) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  function weightChartSvg(points) {
    if (!points || points.length < 2) return "";
    const W = 320, H = 148;
    const padL = 8, padR = 36, padT = 14, padB = 24;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const t0 = Date.parse(points[0].date + "T12:00:00");
    const t1 = Date.parse(points[points.length - 1].date + "T12:00:00");
    const span = Math.max(1, t1 - t0);
    const ys = points.map((p) => p.weight);
    let minY = Math.min.apply(null, ys);
    let maxY = Math.max.apply(null, ys);
    if (maxY === minY) {
      minY -= 0.75;
      maxY += 0.75;
    }
    const pad = Math.max(0.3, (maxY - minY) * 0.16);
    minY -= pad;
    maxY += pad;
    const ySpan = maxY - minY || 1;
    const mapped = points.map((p) => {
      const t = Date.parse(p.date + "T12:00:00");
      const x = padL + ((t - t0) / span) * innerW;
      const y = padT + (1 - (p.weight - minY) / ySpan) * innerH;
      return { x: +x.toFixed(2), y: +y.toFixed(2), p };
    });
    const line = smoothLinePath(mapped);
    const last = mapped[mapped.length - 1];
    const first = mapped[0];
    const area = `${line} L ${last.x} ${padT + innerH} L ${first.x} ${padT + innerH} Z`;
    const dots = mapped.map((pt, i) => {
      const r = i === mapped.length - 1 ? 4.2 : 2.6;
      const cls = i === mapped.length - 1 ? "last" : "";
      return `<circle class="${cls}" cx="${pt.x}" cy="${pt.y}" r="${r}" data-date="${esc(pt.p.date)}" data-kg="${esc(String(pt.p.weight))}"></circle>`;
    }).join("");
    const yTop = C().formatNumber(maxY - pad > 0 ? points.reduce((m, p) => Math.max(m, p.weight), -Infinity) : maxY);
    const yBot = C().formatNumber(points.reduce((m, p) => Math.min(m, p.weight), Infinity));
    const midI = Math.floor(mapped.length / 2);
    const xLabels = [
      { x: first.x, text: formatChartDate(points[0].date) },
      mapped.length >= 3 ? { x: mapped[midI].x, text: formatChartDate(points[midI].date) } : null,
      { x: last.x, text: formatChartDate(points[points.length - 1].date) },
    ].filter(Boolean);
    const xLabelEl = xLabels.map((l) => `<text class="x" x="${l.x}" y="${H - 6}" text-anchor="middle">${esc(l.text)}</text>`).join("");
    return `<svg class="weight-svg" viewBox="0 0 ${W} ${H}" width="100%" height="148" role="img" aria-label="Body weight over time" data-testid="weight-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="vela-weight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1EE0C8" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#1EE0C8" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <line class="grid" x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" />
      <line class="grid" x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" />
      <text class="y" x="${W - padR + 4}" y="${padT + 4}">${esc(yTop)}</text>
      <text class="y" x="${W - padR + 4}" y="${padT + innerH + 4}">${esc(yBot)}</text>
      <path class="area" d="${area}" fill="url(#vela-weight-fill)"></path>
      <path class="line" d="${line}" fill="none"></path>
      ${dots}
      ${xLabelEl}
    </svg>`;
  }

  function weightCardHtml() {
    const series = D().bodyWeightSeries();
    const range = series.range;
    const ranges = ["1M", "3M", "All"].map((r) =>
      `<button type="button" class="wrange${r === range ? " on" : ""}" data-action="weight-range" data-range="${r}" data-testid="weight-range-${r}">${r}</button>`
    ).join("");
    const logBtn = `<button type="button" class="weight-log" data-action="log-weight" data-testid="log-weight">${ICONS.plus} Log weight</button>`;
    const histBtn = (series.all && series.all.length)
      ? `<button type="button" class="weight-hist-btn" data-action="weight-history" data-testid="weight-history">History</button>`
      : "";
    const headActions = `<div class="weight-head-actions">${histBtn}${logBtn}</div>`;
    if (!series.all || series.all.length < 2) {
      const current = series.current
        ? `<div class="weight-now" data-testid="weight-current">${esc(C().formatNumber(series.current.weight))} <span>kg</span></div>
           <p class="weight-empty-copy">Log one more weigh-in to see your trend.</p>`
        : `<p class="weight-empty-copy" data-testid="weight-empty">Log at least two weigh-ins to see your trend. You can also add weight in Monthly Check-in.</p>`;
      const one = series.current ? "" : `<div class="weight-now muted" data-testid="weight-current">— <span>kg</span></div>`;
      return `<section class="dash-card weight-card" data-testid="weight-card">
        <div class="weight-head">
          <h2>Body weight</h2>
          ${headActions}
        </div>
        ${series.current ? current : one + current}
        <div class="weight-ranges" data-testid="weight-ranges">${ranges}</div>
      </section>`;
    }
    const cur = C().formatNumber(series.current.weight);
    const bits = [];
    if (series.vsPrev != null) {
      bits.push(`<span class="wdelta ${deltaClass(series.vsPrev)}" data-testid="weight-delta-prev">${esc(formatDeltaKg(series.vsPrev))} vs last</span>`);
    }
    if (series.vsFirst != null && series.firstInRange && series.current && series.firstInRange.date !== series.current.date) {
      bits.push(`<span class="wdelta ${deltaClass(series.vsFirst)}" data-testid="weight-delta-start">${esc(formatDeltaKg(series.vsFirst))} vs start</span>`);
    }
    const chart = weightChartSvg(series.points);
    const sparse = series.points.length < 2
      ? `<p class="weight-empty-copy" data-testid="weight-range-empty">Not enough weigh-ins in this period.</p>`
      : chart;
    return `<section class="dash-card weight-card" data-testid="weight-card">
      <div class="weight-head">
        <h2>Body weight</h2>
        ${headActions}
      </div>
      <div class="weight-now" data-testid="weight-current">${esc(cur)} <span>kg</span></div>
      <div class="weight-deltas" data-testid="weight-delta">${bits.join("<span class='wd-dot'>·</span>")}</div>
      <div class="weight-ranges" data-testid="weight-ranges">${ranges}</div>
      <div class="weight-chart-wrap">${sparse}</div>
    </section>`;
  }

  function refreshWeightCard() {
    const next = weightCardHtml();
    const root = contentEl();
    const card = root && root.querySelector('[data-testid="weight-card"]');
    if (!card) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = next.trim();
    const fresh = wrap.firstElementChild;
    if (fresh) card.replaceWith(fresh);
  }

  function formatWeightDate(ymd) {
    if (!ymd) return "";
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
  }

  function openLogWeight(existing) {
    const series = D().bodyWeightSeries();
    const today = D().copenhagenYMD();
    const min = "2015-01-01";
    const isEdit = !!(existing && existing.id);
    const dateVal = (existing && existing.date) || today;
    const weightVal = existing && existing.weight != null
      ? C().formatNumber(existing.weight)
      : "";
    const title = isEdit ? "Edit weigh-in" : "Log weight";
    showSheet(`<div class="sheet kb-safe" data-testid="log-weight-sheet">
      <div class="tracking-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="tracking-close" data-action="${isEdit ? "weight-history" : "close-sheet"}" data-testid="close-log-weight">Cancel</button>
      </div>
      <p class="weight-log-hint">Pick today or an earlier date to add a past weigh-in.</p>
      <label class="field-label" for="log-weight-date">Date</label>
      <input class="text-input date-input" id="log-weight-date" type="date" data-log-weight-date data-testid="log-weight-date" value="${esc(dateVal)}" min="${min}" max="${esc(today)}"${isEdit ? ` data-edit-id="${esc(existing.id)}"` : ""} />
      <label class="field-label" for="log-weight-input">Body weight (kg)</label>
      <input class="text-input" id="log-weight-input" data-log-weight-input data-testid="log-weight-input" inputmode="decimal" enterkeyhint="done" placeholder="e.g. 82,5" value="${esc(weightVal)}" />
      <div class="sheet-actions">
        <button type="button" class="btn pri" data-action="save-log-weight" data-testid="save-log-weight">${isEdit ? "Save" : "Save"}</button>
      </div>
    </div>`, { top: true });
    startViewportPin();
    /* Don't auto-focus the kg field — on iPhone the keyboard would cover the date picker. */
  }

  function readLogWeightForm() {
    const root = overlaysEl();
    const input = root && root.querySelector("[data-log-weight-input]");
    const dateEl = root && root.querySelector("[data-log-weight-date]");
    const weight = C().parseNum(input && input.value);
    const today = D().copenhagenYMD();
    let date = (dateEl && dateEl.value) || today;
    const editId = (dateEl && dateEl.getAttribute("data-edit-id")) || "";
    return { weight, date, today, editId };
  }

  function afterWeightSave(message, reopenHistory) {
    closeSheet();
    if (view === "home" && tab === "home") refreshWeightCard();
    else render();
    if (reopenHistory) openWeightHistory();
    showToast(message || "Weight saved");
  }

  function commitLogWeight() {
    const form = readLogWeightForm();
    if (form.weight == null) {
      showToast("Add a body weight to save");
      return;
    }
    if (!form.date || form.date > form.today) {
      showToast("Pick today or a past date");
      return;
    }
    const existing = D().bodyWeightOnDate(form.date, form.editId || null);
    const save = () => {
      const result = form.editId
        ? D().updateBodyWeight(form.editId, { weight: form.weight, date: form.date })
        : D().logBodyWeight(form.weight, form.date);
      if (result && result.future) {
        showToast("Pick today or a past date");
        return;
      }
      afterWeightSave(existing || form.editId ? "Weight updated" : "Weight saved", !!form.editId);
    };
    if (existing) {
      const when = formatWeightDate(existing.date);
      const prev = C().formatNumber(existing.weight);
      const next = C().formatNumber(form.weight);
      showConfirm({
        title: "Replace weigh-in?",
        body: `There's already a weigh-in on ${when} (${prev} kg). Replace it with ${next} kg?`,
        confirm: "Replace",
        onConfirm: save,
      });
      return;
    }
    save();
  }

  function openWeightHistory() {
    weightHistoryEditMode = false;
    paintWeightHistory();
  }

  function paintWeightHistory() {
    const entries = D().bodyWeightEntries().slice().reverse();
    const rows = entries.map((e) => {
      const acts = weightHistoryEditMode
        ? `<span class="hist-set-acts">
             <button type="button" class="hist-edit-set" data-action="edit-weight-entry" data-id="${esc(e.id)}" data-testid="edit-weight-${esc(e.id)}">Edit</button>
             <button type="button" class="hist-del" data-action="delete-weight-entry" data-id="${esc(e.id)}" data-testid="delete-weight-${esc(e.id)}">Delete</button>
           </span>`
        : "";
      const swipe = weightHistoryEditMode
        ? `<button type="button" class="swipe-actions" data-action="delete-weight-entry" data-id="${esc(e.id)}" aria-hidden="true" tabindex="-1">Delete</button>`
        : "";
      return `<div class="hist-swipe" data-swipe="weight-entry" data-id="${esc(e.id)}">
        ${swipe}
        <div class="swipe-front">
          <div class="set-line weight-hist-row" data-testid="weight-hist-row-${esc(e.id)}">
            <span class="set-n">${esc(formatWeightDate(e.date))}</span>
            <span class="set-val" data-testid="weight-hist-kg-${esc(e.id)}">${esc(C().formatNumber(e.weight))} kg</span>
            ${acts}
          </div>
        </div>
      </div>`;
    }).join("");
    showSheet(`<div class="sheet" data-testid="weight-history-sheet">
      <div class="handle"></div>
      <div class="hist-head">
        <span class="hist-head-space"></span>
        <h2>Weight history</h2>
        <button type="button" class="btn-edit${weightHistoryEditMode ? " on" : ""}" data-action="toggle-weight-history-edit" data-testid="weight-history-edit">${weightHistoryEditMode ? "Done" : "Edit"}</button>
      </div>
      <div class="sheet-body">${rows || `<div class="empty" data-testid="weight-history-empty">No weigh-ins yet.</div>`}</div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="log-weight" data-testid="history-log-weight">Log weight</button>
        <button type="button" class="btn pri" data-action="close-sheet" data-testid="weight-history-done">Done</button>
      </div>
    </div>`);
    bindWeightHistorySwipes();
  }

  function bindWeightHistorySwipes() {
    if (!weightHistoryEditMode) return;
    overlaysEl().querySelectorAll('[data-swipe="weight-entry"]').forEach((row) => {
      const front = row.querySelector(".swipe-front") || row;
      let startX = 0, startY = 0, dx = 0, tracking = false, decided = false, horizontal = false;
      row.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        startX = e.clientX;
        startY = e.clientY;
        dx = 0;
        tracking = true;
        decided = false;
        horizontal = false;
        front.style.transition = "none";
      });
      row.addEventListener("pointermove", (e) => {
        if (homeDrag) { tracking = false; decided = false; return; }
        if (!tracking) return;
        const x = e.clientX - startX;
        const y = e.clientY - startY;
        if (!decided) {
          if (Math.abs(x) + Math.abs(y) < 8) return;
          decided = true;
          horizontal = Math.abs(x) > Math.abs(y) && Math.abs(x) > 6;
          if (horizontal) {
            row.classList.add("dragging");
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
        const shouldDelete = horizontal && dx < -56;
        tracking = false;
        row.classList.remove("dragging");
        front.style.transition = "";
        front.style.transform = "";
        if (shouldDelete) requestDeleteWeight(row.dataset.id);
      }
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
    });
  }

  function refreshAfterWeightChange() {
    if (view === "home" && tab === "home") refreshWeightCard();
    else if (view === "home") render();
    const histOpen = overlaysEl().querySelector('[data-testid="weight-history-sheet"]');
    if (histOpen) paintWeightHistory();
  }

  function requestDeleteWeight(id) {
    const entry = D().bodyWeightEntries().find((e) => e.id === id);
    if (!entry) return;
    const snap = D().captureWeightUndo();
    const label = `${formatWeightDate(entry.date)} · ${C().formatNumber(entry.weight)} kg`;
    showConfirm({
      title: "Delete weigh-in?",
      body: `Remove ${label} from your history?`,
      confirm: "Delete",
      danger: true,
      onConfirm: () => {
        D().deleteBodyWeight(id);
        const keepEdit = weightHistoryEditMode;
        refreshAfterWeightChange();
        if (!overlaysEl().querySelector('[data-testid="weight-history-sheet"]')) {
          weightHistoryEditMode = keepEdit;
          paintWeightHistory();
        }
        showToast("Weigh-in deleted", "Undo", () => {
          D().restoreWeightUndo(snap);
          refreshAfterWeightChange();
          if (!overlaysEl().querySelector('[data-testid="weight-history-sheet"]')) {
            openWeightHistory();
          }
        });
      },
    });
  }

  function openEditWeight(id) {
    const entry = D().bodyWeightEntries().find((e) => e.id === id);
    if (!entry) return;
    openLogWeight(entry);
  }

  const HOME_LAYOUT_KEY = "vela-home-layout-v1";
  const HOME_DEFAULT = ["stats", "weight", "food", "plan"];
  function homeOrder() {
    let saved = [];
    try { saved = (JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) || "{}").order) || []; } catch (e) { saved = []; }
    const out = saved.filter((id, i) => HOME_DEFAULT.includes(id) && saved.indexOf(id) === i);
    HOME_DEFAULT.forEach((id) => { if (!out.includes(id)) out.push(id); }); /* new cards are appended */
    return out;
  }
  function saveHomeOrder(order) {
    try { localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify({ order, updatedAt: Date.now() })); } catch (e) { /* full */ }
  }
  function moveHomeBlock(id, dir) {
    const order = homeOrder();
    const i = order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveHomeOrder(order);
    haptic();
    const y = contentEl().scrollTop;
    renderHome();
    bindSwipeWorkouts();
    contentEl().scrollTop = y;
    const moved = contentEl().querySelector(`[data-home-block="${id}"]`);
    if (moved && moved.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      moved.animate([{ transform: `translateY(${dir * -40}px)` }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    }
  }
  /* v27: press and hold a Home card (~450 ms), then drag — like rearranging iOS apps.
     The hold is cancelled if the finger moves more than 10px first, so scrolling is untouched. */
  const HOLD_MS = 450;
  const HOLD_SLOP = 10;
  let homeDrag = null;
  function bindHomeLongPress() {
    const root = contentEl();
    if (root.dataset.homeLp) return;
    root.dataset.homeLp = "1";
    let hold = null;
    const cancelHold = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
    const point = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    const start = (e, kind) => {
      if (view !== "home" || homeDrag) return;
      if (kind === "mouse" && e.button !== 0) return;
      const block = e.target.closest && e.target.closest(".home-block");
      if (!block || !root.contains(block)) return;
      if (e.target.closest("input, textarea, select")) return;
      const p = point(e);
      cancelHold();
      hold = { block, x: p.clientX, y: p.clientY, kind, timer: setTimeout(() => beginHomeDrag(hold), HOLD_MS) };
    };
    const move = (e) => {
      const p = point(e);
      if (homeDrag) {
        if (e.cancelable) e.preventDefault(); /* no page scroll while dragging */
        homeDrag.lastY = p.clientY;
        layoutHomeDrag();
        return;
      }
      if (hold && (Math.abs(p.clientX - hold.x) > HOLD_SLOP || Math.abs(p.clientY - hold.y) > HOLD_SLOP)) cancelHold();
    };
    const end = () => {
      cancelHold();
      if (homeDrag) dropHomeDrag();
    };
    root.addEventListener("touchstart", (e) => { if (e.touches.length === 1) start(e, "touch"); else cancelHold(); }, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    root.addEventListener("mousedown", (e) => start(e, "mouse"));
    document.addEventListener("mousemove", (e) => { if (hold && hold.kind === "mouse" || homeDrag && homeDrag.kind === "mouse") move(e); });
    document.addEventListener("mouseup", (e) => { if (hold && hold.kind === "mouse" || homeDrag && homeDrag.kind === "mouse") end(e); });
    root.addEventListener("scroll", () => { if (hold) cancelHold(); }, { passive: true });
    /* No iOS callout / context menu on a held card. */
    root.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".home-block")) e.preventDefault(); });
    /* Swallow the click that follows a drop so the card under the finger doesn't open. */
    document.addEventListener("click", (e) => {
      if (root.dataset.swallowClick) {
        delete root.dataset.swallowClick;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }
  function beginHomeDrag(h) {
    if (!h || view !== "home") return;
    const root = contentEl();
    const blocks = [...root.querySelectorAll(".home-block")];
    const startIndex = blocks.indexOf(h.block);
    if (startIndex < 0) return;
    const scroll0 = root.scrollTop;
    homeDrag = {
      kind: h.kind, block: h.block, blocks, startIndex, target: startIndex,
      y0: h.y, lastY: h.y, scroll0,
      rects: blocks.map((b) => { const r = b.getBoundingClientRect(); return { top: r.top + scroll0, height: r.height }; }),
      raf: 0,
    };
    root.classList.add("home-dragging");
    h.block.classList.add("lifted");
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* */ } }
    haptic();
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
    root.querySelectorAll(".swipe-row.open, .swipe-row.dragging").forEach((r) => r.classList.remove("open", "dragging"));
    layoutHomeDrag();
    const tick = () => {
      if (!homeDrag) return;
      const box = root.getBoundingClientRect();
      const edge = 80;
      const y = homeDrag.lastY;
      let v = 0;
      const bottomEdge = box.bottom - (parseFloat(getComputedStyle(root).paddingBottom) || 0) + 30;
      if (y < box.top + edge) v = -Math.ceil((box.top + edge - y) / 4);
      else if (y > bottomEdge - edge) v = Math.ceil((y - (bottomEdge - edge)) / 4);
      if (v) {
        const before = root.scrollTop;
        root.scrollTop = before + Math.max(-18, Math.min(18, v));
        if (root.scrollTop !== before) layoutHomeDrag();
      }
      homeDrag.raf = requestAnimationFrame(tick);
    };
    homeDrag.raf = requestAnimationFrame(tick);
  }
  function layoutHomeDrag() {
    const d = homeDrag;
    if (!d) return;
    const root = contentEl();
    const scrollDelta = root.scrollTop - d.scroll0;
    const dy = d.lastY - d.y0 + scrollDelta;
    d.block.style.transform = `translateY(${dy}px) scale(1.03)`;
    const r0 = d.rects[d.startIndex];
    /* Like iOS: the lifted card's leading edge passing a neighbour's middle swaps them. */
    const topEdge = r0.top + dy;
    const bottomEdge = r0.top + r0.height + dy;
    let target = d.startIndex;
    d.rects.forEach((r, k) => {
      if (k < d.startIndex && topEdge < r.top + r.height / 2) target = Math.min(target, k);
      if (k > d.startIndex && bottomEdge > r.top + r.height / 2) target = Math.max(target, k);
    });
    if (target !== d.target && navigator.vibrate) { try { navigator.vibrate(6); } catch (err) { /* */ } }
    d.target = target;
    const gap = d.rects.length > 1 ? Math.max(0, (d.rects[1].top - (d.rects[0].top + d.rects[0].height))) : 0;
    const shiftBy = r0.height + gap;
    d.blocks.forEach((b, k) => {
      if (b === d.block) return;
      let shift = 0;
      if (d.startIndex < target && k > d.startIndex && k <= target) shift = -shiftBy;
      if (d.startIndex > target && k < d.startIndex && k >= target) shift = shiftBy;
      b.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }
  function dropHomeDrag() {
    const d = homeDrag;
    if (!d) return;
    homeDrag = null;
    cancelAnimationFrame(d.raf);
    const root = contentEl();
    root.dataset.swallowClick = "1";
    setTimeout(() => { delete root.dataset.swallowClick; }, 300);
    root.classList.remove("home-dragging");
    if (d.target !== d.startIndex) {
      const visible = d.blocks.map((b) => b.dataset.homeBlock);
      const id = visible.splice(d.startIndex, 1)[0];
      visible.splice(d.target, 0, id);
      const rest = homeOrder().filter((x) => !visible.includes(x));
      saveHomeOrder(visible.concat(rest));
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* */ } }
    }
    const y = root.scrollTop;
    renderHome();
    bindSwipeWorkouts();
    root.scrollTop = y;
    const dropped = root.querySelector(`[data-home-block="${d.block.dataset.homeBlock}"]`);
    if (dropped && dropped.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dropped.animate([{ transform: "scale(1.03)" }, { transform: "none" }], { duration: 180, easing: "ease-out" });
    }
  }

  function renderHome() {
    const s = D().get();
    contentEl().classList.remove("has-footer");
    const stats = D().weekStats();
    const due = D().checkInDue();
    const segs = Array.from({ length: stats.planned }, (_, i) =>
      `<i class="${i < stats.filled ? "on" : ""}"></i>`
    ).join("");
    const dash = `<section class="dash-card" data-testid="stats-card">
      <div class="streak-row">
        <div class="streak-flame" data-testid="streak-weeks">
          ${ICONS.flame}
          <b>${esc(stats.streak)}</b>
          <span>weeks</span>
        </div>
        <div class="streak-copy">
          <h2>Consistency streak</h2>
          <p data-testid="streak-subtitle">${esc(stats.subtitle)}</p>
          <div class="seg-bar" data-testid="streak-bar" style="--segs:${Math.max(1, stats.planned)}">${segs || "<i></i>"}</div>
        </div>
      </div>
      <p class="dash-scope">${esc(stats.scopeLabel)}</p>
      <div class="dash-tiles">
        <div class="dash-tile" data-testid="tile-volume">
          <b>${esc(Math.round(stats.volumeKg))}</b><span>Volume kg</span>
        </div>
        <button type="button" class="dash-tile" data-action="open-pbs" data-testid="tile-pbs">
          <b>${esc(stats.personalBests)}</b><span>Personal bests</span>
        </button>
        <div class="dash-tile" data-testid="tile-workouts">
          <b>${esc(stats.workoutsCompleted)}</b><span>Workouts completed</span>
        </div>
        <div class="dash-tile" data-testid="tile-hours">
          <b>${esc(stats.hoursLabel)}</b><span>Hours spent</span>
        </div>
      </div>
      <div class="checkin-row" data-testid="checkin-row">
        <span class="checkin-ico">${ICONS.tape}</span>
        <span class="checkin-lbl">Monthly Check-in</span>
        <button type="button" class="checkin-btn${due ? " due" : ""}" data-action="open-checkin" data-testid="checkin-button">${due ? "Check-in" : "View"}</button>
      </div>
    </section>`;
    const tiles = (s.recoveryWeek ? "" : s.workouts.map((w) => {
      const n = w.exercises.length;
      const done = !!w.completedAt;
      const mark = done
        ? `<div class="mark" aria-label="Done">${ICONS.checkFill}</div>`
        : `<div class="mark chev">${ICONS.chev}</div>`;
      const sub = w.dayLabel ? `${esc(w.dayLabel)} · ` : "";
      return `<div class="swipe-row" data-swipe="workout" data-id="${esc(w.id)}">
        <button type="button" class="swipe-actions" data-action="delete-workout" data-id="${esc(w.id)}">Delete</button>
        <div class="swipe-front">
          <button type="button" class="tile${done ? " done" : ""}" data-action="open-workout" data-id="${esc(w.id)}" data-testid="workout-tile-${esc(w.id)}">
            <div class="meta"><h2>${esc(w.name)}</h2><p>${sub}${n} exercise${n === 1 ? "" : "s"} · ${esc(w.minutes)} mins</p></div>
            ${mark}
          </button>
        </div>
      </div>`;
    }).join(""));
    const recovery = s.recoveryWeek
      ? `<div class="recovery-card" data-testid="recovery-week">${ICONS.info}<div><b>Recovery week</b><p>Max-OT prescribes a week off after 8 weeks of heavy training. History and last weights are kept. Start your next cycle when you’re ready.</p></div></div>`
      : "";
    const continued = !s.recoveryWeek && s.week > D().cycleWeeks() ? " · continued" : "";
    const planHtml = `
      <div class="section">
        <div class="plan-titles">
          <button type="button" class="program-name" data-action="choose-program" data-testid="program-name">${esc(D().programName())}</button>
          <h1>This Week's Plan</h1>
          <p class="week-kicker" data-testid="week-plan-label">${esc(D().weekLabel())}${continued}</p>
        </div>
        ${s.recoveryWeek ? "" : `<button class="add" type="button" data-action="add-workout" data-testid="home-add-workout">${ICONS.plus} Add workout</button>`}
      </div>
      ${recovery}
      ${s.recoveryWeek ? "" : `<div class="info">${ICONS.info}<span>Swipe left on the workout tile to delete</span></div>
      <div class="tiles" data-testid="week-plan">${tiles || `<div class="empty">No workouts this week. Tap Add workout to start.</div>`}</div>`}
      ${s.recoveryWeek ? `<div class="tiles" data-testid="week-plan" hidden></div>` : ""}`;
    /* v27: Home cards can be rearranged; order lives in its own localStorage key. */
    const blocks = {
      stats: { label: "Streak & stats", html: dash },
      weight: { label: "Body weight", html: weightCardHtml() },
      food: { label: "Today’s food", html: window.VELA_FOOD ? window.VELA_FOOD.homeCardHtml() : "" },
      plan: { label: "This week’s plan", html: planHtml },
    };
    const order = homeOrder().filter((id) => blocks[id] && blocks[id].html);
    const n = order.length;
    const blockHtml = order.map((id, idx) => `<div class="home-block" data-home-block="${id}" data-testid="home-block-${id}">
        <div class="block-tools sr-only">
          <button type="button" data-action="home-move" data-id="${id}" data-dir="-1" aria-label="Move ${esc(blocks[id].label)} up" data-testid="move-up-${id}"${idx === 0 ? " disabled" : ""}>Move up</button>
          <button type="button" data-action="home-move" data-id="${id}" data-dir="1" aria-label="Move ${esc(blocks[id].label)} down" data-testid="move-down-${id}"${idx === n - 1 ? " disabled" : ""}>Move down</button>
        </div>
        <div class="block-body">${blocks[id].html}</div>
      </div>`).join("");
    contentEl().innerHTML = `<div class="home-blocks" data-testid="home-blocks">${blockHtml}</div>`;
    bindHomeLongPress();
    const footerLbl = s.recoveryWeek ? "Start next cycle" : "Get your next program";
    contentEl().insertAdjacentHTML("beforeend", `<div class="home-next"><button class="program" type="button" data-action="next-week" data-testid="next-program">${footerLbl}</button></div>`);
    hideFooter();
  }

  function volumeBarPct(vol, targetKg, prev) {
    const kg = vol && typeof vol === "object" ? (vol.kg || 0) : Number(vol) || 0;
    const reps = vol && typeof vol === "object" ? (vol.repsOnly || 0) : 0;
    if (targetKg > 0) return Math.min(100, (kg / targetKg) * 100);
    if (prev && prev.kg > 0) return Math.min(100, (kg / prev.kg) * 100);
    if (prev && prev.repsOnly > 0 && reps) return Math.min(100, (reps / prev.repsOnly) * 100);
    return (kg > 0 || reps > 0) ? 100 : 0;
  }

  function volumeCompareHtml(cmp, testid) {
    if (!cmp) return `<div class="vol-cmp first" data-testid="${esc(testid)}">First session</div>`;
    const text = String(cmp.text || "").replace(/^[↑↓=]\s*/, "");
    return `<div class="vol-cmp ${esc(cmp.sign)}" data-testid="${esc(testid)}">${overloadBadge(cmp.sign)}<span>${esc(text)}</span></div>`;
  }

  function exerciseCard(ex, exIndex, workout) {
    const allDone = ex.sets.length && ex.sets.every((s) => s.done);
    const vol = D().exerciseVolume(ex);
    const target = D().targetVolume(ex);
    const prevVol = D().previousExerciseVolume(ex, workout && workout.sessionId);
    const pct = volumeBarPct(vol, target, prevVol);
    const volLabel = D().formatVolumeKg(vol);
    const cmp = D().volumeCompare(vol, prevVol);
    const aim = D().formatAim(ex.suggestedWeight, ex.repsRange, ex.suggestedReps) || (ex.suggestedReps != null ? `Aim for ${ex.suggestedReps} reps` : "");
    const chips = ex.sets.map((set, i) =>
      `<button type="button" class="${chipClass(ex, set)}" data-action="chip" data-ex="${exIndex}" data-set="${i}" data-testid="set-chip-${exIndex}-${i}">${chipInner(ex, set, exIndex, i, workout)}</button>`
    ).join("");
    const summary = D().exerciseOverloadSummary(ex, workout && workout.sessionId);
    const summaryHtml = summary
      ? `<div class="overload-line ${summary.sign}" data-testid="overload-summary-${exIndex}">${overloadBadge(summary.sign)}<span>${esc(summary.text)}</span></div>`
      : "";
    const altName = ex.alt || "Alternative";
    const alt = `<button type="button" class="alt" data-action="alt" data-ex="${exIndex}" aria-label="Swap for ${esc(altName)}"><span>${esc(altName)}</span><span class="alt-icons">${ICONS.clock}${ICONS.swap}</span></button>`;
    const editTools = (!workout.review && workoutEditMode)
      ? `<div class="ex-edit-tools">
           <button type="button" class="drag-handle" data-drag-handle data-ex="${exIndex}" data-testid="drag-handle-${exIndex}" aria-label="Reorder ${esc(ex.name)}">${ICONS.drag}</button>
           <button type="button" class="remove-ex" data-action="remove-exercise" data-ex="${exIndex}" data-testid="remove-exercise-${exIndex}">${ICONS.trash} Remove</button>
         </div>`
      : "";
    const more = `<button type="button" class="more-btn" data-action="ex-menu" data-ex="${exIndex}" data-testid="ex-menu-${exIndex}" aria-label="Exercise options">${ICONS.more}</button>`;
    return `<div class="block${workoutEditMode ? " edit-mode" : ""}${workout && workout.review ? " review" : ""}" data-ex-block="${exIndex}" data-testid="exercise-card-${esc(ex.key)}">
      ${alt}
      ${editTools}
      <div class="card">
        <div class="top">
          <button type="button" class="thumb" data-action="demo" data-ex="${exIndex}" data-testid="ex-demo-${exIndex}" aria-label="Show ${esc(ex.name)} demo">${C().photoMarkup(ex.name)}${C().photoFor(ex.name) ? `<div class="play">${C().playMarkup()}</div>` : ""}</button>
          <div class="body">
            <div class="name-row">
              <h3>${esc(ex.name)}</h3>
              ${more}
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
          <div class="amt" data-volamt="${exIndex}" data-testid="volume-amt-${exIndex}">${esc(volLabel)}</div>
          <span class="target" title="Target ${esc(D().formatVolumeKg(target))}" aria-label="Target ${esc(D().formatVolumeKg(target))}">${ICONS.target}</span>
        </div>
        <div class="vol-cmp-slot" data-volcmp="${exIndex}">${volumeCompareHtml(cmp, "volume-vs-last-" + exIndex)}</div>
        <div class="set-tools">
          <button type="button" data-action="add-set" data-ex="${exIndex}">+ Add set</button>
          <button type="button" class="muted" data-action="remove-set" data-ex="${exIndex}">Remove set</button>
        </div>
      </div>
    </div>`;
  }

  function workoutVolumeBlock(w) {
    const wVol = D().workoutVolume(w);
    const prevW = D().previousWorkoutVolume(w);
    const wCmp = D().volumeCompare(wVol, prevW);
    const wPct = volumeBarPct(wVol, 0, prevW);
    return `<div class="workout-vol" data-testid="workout-volume">
      <div class="wv-row">
        <div class="vl">Workout volume</div>
        <div class="amt" data-testid="workout-volume-amt">${esc(D().formatVolumeKg(wVol))}</div>
      </div>
      <div class="track"><i data-workout-volbar style="width:${wPct}%"></i></div>
      ${volumeCompareHtml(wCmp, "workout-volume-vs")}
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
    const hint = workoutEditMode ? "Drag to reorder, or remove an exercise" : "Swipe left on the exercise tile to pick an alternative";
    contentEl().innerHTML = `
      <div class="ex-head-row">
        <h1 class="ex-heading">Exercises</h1>
        <button type="button" class="btn-edit${workoutEditMode ? " on" : ""}" data-action="toggle-edit" data-testid="edit-workout">${workoutEditMode ? "Done" : "Edit"}</button>
      </div>
      <div class="info">${ICONS.info}<span>${hint}</span></div>
      ${workoutVolumeBlock(w)}
      <div class="stack" data-testid="exercise-stack">${cards}</div>
      <button type="button" class="add-ex-btn" data-action="add-exercise" data-testid="add-exercise">${ICONS.plus} Add exercise</button>`;
    footerEl().classList.remove("hidden");
    footerEl().innerHTML = `<button class="cta" type="button" data-action="finish" data-testid="finish-workout">Finish workout</button>`;
    bindSwipeExercises();
    bindExerciseReorder();
  }

  function haptic() {
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
  }

  function persistTab() {
    const s = D().get();
    s.uiTab = tab;
    D().saveNow();
  }

  function switchTab(next) {
    if (!next) return;
    haptic();
    tab = next;
    view = next;
    programWeek = null;
    reviewWorkout = null;
    activeWorkoutId = null;
    editing = null;
    workoutEditMode = false;
    persistTab();
    closeSheet();
    render();
    contentEl().scrollTop = 0;
  }

  function trackingOpen() {
    return !!(overlaysEl() && overlaysEl().querySelector(".sheet.tracking, [data-testid='sets-tracking']"));
  }

  function shouldHideTabBar() {
    if (view === "days-setup") return true;
    if (keyboardOpen) return true;
    if (trackingOpen()) return true;
    return false;
  }

  function syncChrome() {
    const app = document.getElementById("app");
    const hide = shouldHideTabBar();
    if (app) {
      app.classList.toggle("kb-open", !!keyboardOpen);
      app.classList.toggle("tracking-open", trackingOpen());
      app.classList.toggle("setup-open", view === "days-setup");
    }
    const bar = tabbarEl();
    if (bar) bar.classList.toggle("hidden", hide);
    const space = hide ? "0px" : "var(--tabbar-reserve)";
    document.documentElement.style.setProperty("--tabbar-space", space);
  }

  function updateKeyboard() {
    const vv = window.visualViewport;
    const focused = document.activeElement && document.activeElement.matches && document.activeElement.matches("input, textarea, select");
    let open = false;
    if (vv) {
      const gap = window.innerHeight - vv.height - (vv.offsetTop || 0);
      open = gap > 80 && !!focused;
    } else {
      open = !!focused;
    }
    if (open === keyboardOpen) {
      syncShellViewport();
      syncChrome();
      return;
    }
    keyboardOpen = open;
    syncShellViewport();
    syncChrome();
  }

  function renderTabBar() {
    const bar = tabbarEl();
    if (!bar) return;
    const items = [
      { id: "home", label: "Home", icon: ICONS.tabHome },
      { id: "program", label: "Program", icon: ICONS.tabProgram },
      { id: "progress", label: "Progress", icon: ICONS.tabProgress },
      { id: "checkin", label: "Check-in", icon: ICONS.tabCheckin },
      { id: "settings", label: "Settings", icon: ICONS.tabSettings },
    ];
    const current = (view === "food") ? "home" : (view === "program-week") ? "program" : (view === "review" ? (returnView === "program-week" || returnView === "program" ? "program" : tab) : (view === "workout" ? tab : view));
    const idx = items.findIndex((it) => it.id === current);
    /* v25: the active bubble slides from the previous tab to the new one. */
    const prev = typeof bar.__tabIndex === "number" ? bar.__tabIndex : idx;
    bar.style.setProperty("--tab-count", String(items.length));
    bar.innerHTML = `<span class="tab-indicator${idx < 0 ? " none" : ""}" aria-hidden="true" data-testid="tab-indicator"></span>` + items.map((it) => {
      const on = current === it.id ? " on" : "";
      return `<button type="button" class="tab-btn${on}" data-action="switch-tab" data-tab="${it.id}" data-testid="tab-${it.id}" aria-label="${esc(it.label)}" aria-current="${current === it.id ? "page" : "false"}">${it.icon}<span>${esc(it.label)}</span></button>`;
    }).join("");
    const ind = bar.querySelector(".tab-indicator");
    if (ind && idx >= 0) {
      if (prev >= 0 && prev !== idx) {
        ind.style.transition = "none";
        ind.style.setProperty("--tab-index", String(prev));
        void ind.offsetWidth;
        ind.style.transition = "";
      }
      ind.style.setProperty("--tab-index", String(idx));
    }
    if (idx >= 0) bar.__tabIndex = idx;
    bar.setAttribute("data-testid", "tab-bar");
    syncChrome();
  }

  function sparkline(points) {
    const vals = (points || []).map((p) => Number(p.kg) || Number(p.repsOnly) || 0);
    if (vals.length < 2) return `<span class="spark empty" aria-hidden="true"></span>`;
    const w = 72, h = 28, pad = 2;
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max - min || 1;
    const coords = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${coords}" fill="none" stroke="#1EE0C8" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function renderProgram() {
    hideFooter();
    contentEl().classList.add("flush");
    const s = D().get();
    const cycle = D().cycleProgress();
    const title = D().programTitle();
    const heroName = D().programHeroName();
    const photo = C().photoFor(heroName);
    const src = photo && photo.frames && photo.frames[0] ? photo.frames[0] : "";
    const weeks = (cycle.weeks || []).map((w) => {
      const mark = w.complete ? ICONS.weekCheck : ICONS.chev;
      const current = w.current ? " current" : "";
      const done = w.complete ? " done" : "";
      return `<button type="button" class="week-card${current}${done}" data-action="open-week" data-week="${w.week}" data-testid="week-card-${w.week}">
        <div class="week-copy">
          <h3>Week ${esc(w.week)}</h3>
          <p data-testid="week-pct-${w.week}">${esc(w.pct)}% completed</p>
        </div>
        <div class="week-bar"><i style="width:${esc(w.pct)}%"></i></div>
        <span class="week-mark">${mark}</span>
      </button>`;
    }).join("");
    const nextLbl = s.recoveryWeek ? "Start next cycle" : "Get your next program";
    contentEl().innerHTML = `
      <section class="program-hero" data-testid="program-tab">
        ${src ? `<img class="program-hero-img" src="${esc(src)}" alt="">` : ""}
        <div class="program-hero-shade"></div>
        <div class="program-hero-top">${ICONS.logo}<span>VELA</span></div>
        <div class="program-hero-body">
          <h1 data-testid="program-title">${esc(title)}</h1>
          <div class="program-pills">
            <button type="button" class="pill prim" data-action="choose-program" data-testid="change-program">Change program</button>
            <button type="button" class="pill" data-action="reset-cycle" data-testid="reset-program">Reset program</button>
          </div>
        </div>
      </section>
      <div class="program-stats" data-testid="program-stats">
        <div class="pstat" data-testid="program-stat-workouts"><b>${esc(cycle.done)}/${esc(cycle.total)}</b><span>Workouts</span></div>
        <div class="pstat" data-testid="program-stat-completed"><b>${esc(cycle.pct)}%</b><span>Completed</span></div>
        <div class="pstat" data-testid="program-stat-time"><b>${esc(cycle.timeLabel)}</b><span>Time hrs</span></div>
      </div>
      <div class="week-list" data-testid="week-list">${weeks}</div>
      <div class="home-next program-next"><button class="program" type="button" data-action="next-week" data-testid="next-program-tab">${esc(nextLbl)}</button></div>`;
  }

  function workoutTile(w, { logged, missed, locked, sessionId, pastWeek, partial } = {}) {
    const n = (w.exercises || []).length;
    /* On a past/upcoming week page only that week's own sessions count as done.
       The plan's completedAt belongs to the current week and must not leak in. */
    const done = pastWeek ? !!logged : !!(w.completedAt || logged);
    const isMissed = !done && !!missed;
    const mark = done
      ? `<div class="mark" aria-label="Done">${ICONS.checkFill}</div>`
      : isMissed
        ? `<div class="mark missed">—</div>`
        : `<div class="mark chev">${ICONS.chev}</div>`;
    const sub = w.dayLabel ? `${esc(w.dayLabel)} · ` : "";
    const status = done && pastWeek
      ? "Logged"
      : partial ? "Started, not finished" : (isMissed ? "Not logged" : (locked ? "Upcoming" : `${n} exercise${n === 1 ? "" : "s"} · ${esc(w.minutes || 60)} mins`));
    const action = locked ? "" : (sessionId ? `data-action="open-review" data-session="${esc(sessionId)}"` : (pastWeek ? "" : `data-action="open-workout" data-id="${esc(w.id)}"`));
    const disabled = locked || (pastWeek && !sessionId) ? " disabled" : "";
    const swipeable = !pastWeek && !locked && !sessionId;
    /* Delete only exists on swipeable rows and stays hidden until the row is swiped. */
    const del = swipeable ? `<button type="button" class="swipe-actions" data-action="delete-workout" data-id="${esc(w.id)}" tabindex="-1" aria-hidden="true">Delete</button>` : "";
    return `<div class="swipe-row" data-swipe="${swipeable ? "workout" : "none"}" data-id="${esc(w.id)}" data-week-state="${done ? "logged" : (partial ? "partial" : (isMissed ? "missed" : (locked ? "upcoming" : "open")))}">
      ${del}
      <div class="swipe-front">
        <button type="button" class="tile${done ? " done" : ""}${isMissed ? " missed" : ""}${locked ? " locked" : ""}"${action}${disabled} data-testid="workout-tile-${esc(w.id)}">
          <div class="meta"><h2>${esc(w.name)}</h2><p>${sub}${esc(status)}</p></div>
          ${mark}
        </button>
      </div>
    </div>`;
  }

  function renderProgramWeek() {
    hideFooter();
    contentEl().classList.remove("flush");
    const s = D().get();
    const week = Number(programWeek) || s.week || 1;
    const wr = D().weekRows(week);
    const info = D().weekProgress(week);
    const current = wr.current;
    const future = wr.future;
    const tiles = wr.rows.map((r) => {
      if (current) return workoutTile(r.workout, { logged: r.done });
      if (r.session) return workoutTile(r.workout, { logged: r.done, partial: !r.done, sessionId: r.session.sessionId, pastWeek: true });
      return workoutTile(r.workout, { missed: !future, locked: !!future, pastWeek: true });
    }).join("");
    contentEl().innerHTML = `
      <div class="section">
        <div class="plan-titles">
          <p class="week-kicker" data-testid="week-detail-pct">Week ${esc(week)} · ${esc(info.pct)}% completed</p>
          <h1>${current ? "This week's plan" : (future ? "Upcoming week" : "Logged workouts")}</h1>
        </div>
        ${current ? `<button class="add" type="button" data-action="add-workout" data-testid="week-add-workout">${ICONS.plus} Add workout</button>` : ""}
      </div>
      <div class="tiles" data-testid="week-plan">${tiles || `<div class="empty">No workouts this week.</div>`}</div>`;
    if (current) bindSwipeWorkouts();
  }

  function renderProgress() {
    hideFooter();
    contentEl().classList.remove("flush");
    const pbs = D().allTimePersonalBests();
    const rows = D().exercisesWithHistory();
    const pbHtml = pbs.slice(0, 8).map((pb) =>
      `<button type="button" class="prog-row" data-action="open-progress-ex" data-key="${esc(pb.key)}" data-testid="pb-row-${esc(pb.key)}">
        <span class="prog-name">${esc(pb.name)}</span>
        <span class="prog-pb">${esc(pb.weight)}kg</span>
        ${ICONS.chev}
      </button>`
    ).join("") || `<p class="empty">No personal bests yet. Log a weighted set to start the list.</p>`;
    const histHtml = rows.map((row) =>
      `<button type="button" class="prog-row ex" data-action="open-progress-ex" data-key="${esc(row.key)}" data-testid="progress-ex-${esc(row.key)}">
        <span class="prog-main">
          <span class="prog-name">${esc(row.name)}</span>
          <span class="prog-meta">${row.pb != null ? esc(row.pb) + "kg PB" : "Bodyweight"} · ${esc(row.sessions)} session${row.sessions === 1 ? "" : "s"}</span>
        </span>
        ${sparkline(row.trend)}
        ${ICONS.chev}
      </button>`
    ).join("") || `<p class="empty">History shows up here after you log a set. You can edit or delete a wrong entry.</p>`;
    contentEl().innerHTML = `
      <div class="progress-page" data-testid="progress-tab">
        ${window.VELA_FOOD ? window.VELA_FOOD.progressHtml() : ""}
        <section class="prog-card">
          <h2>Personal bests</h2>
          <p class="prog-note">Heaviest weight you’ve logged for each exercise.</p>
          <div class="prog-list" data-testid="pb-list">${pbHtml}</div>
        </section>
        <section class="prog-card">
          <h2>History</h2>
          <p class="prog-note">Volume trend per exercise. Open one to review history.</p>
          <div class="prog-list" data-testid="history-list">${histHtml}</div>
        </section>
      </div>`;
  }

  function renderCheckInPage() {
    hideFooter();
    contentEl().classList.remove("flush");
    const list = D().listCheckIns();
    const today = D().copenhagenYMD();
    const latest = list[0];
    const due = D().checkInDue();
    const history = list.map((c) => {
      const bits = [`${c.weight != null ? c.weight + " kg" : "—"}`];
      if (c.waist) bits.push(`waist ${c.waist}`);
      if (c.chest) bits.push(`chest ${c.chest}`);
      if (c.arms) bits.push(`arms ${c.arms}`);
      if (c.thighs) bits.push(`thighs ${c.thighs}`);
      const photo = c.photo ? `<img class="checkin-thumb" src="${c.photo}" alt="">` : "";
      return `<div class="hist-item" data-testid="checkin-entry">
        <div class="when">${esc(c.date)}${photo}</div>
        <div class="sets">${esc(bits.join(" · "))}${c.note ? " · " + esc(c.note) : ""}</div>
      </div>`;
    }).join("") || `<p class="empty">No check-ins yet.</p>`;
    contentEl().innerHTML = `<div class="checkin-page" data-testid="checkin-sheet">
      <p class="prog-note">${due ? "Log this month’s measurements when you’re ready." : "This month’s check-in is in. You can update it or look back."}</p>
      <label class="field-label">Date</label>
      <input class="text-input" type="date" data-cin-date value="${esc(today)}" />
      <label class="field-label">Body weight (kg)</label>
      <input class="text-input" data-cin-weight inputmode="decimal" placeholder="e.g. 82,5" value="${latest && latest.weight != null ? esc(String(latest.weight).replace(".", ",")) : ""}" />
      <div class="measure-grid">
        <label>Waist (cm)<input class="text-input" data-cin-waist inputmode="decimal" placeholder="Optional" /></label>
        <label>Chest (cm)<input class="text-input" data-cin-chest inputmode="decimal" placeholder="Optional" /></label>
        <label>Arms (cm)<input class="text-input" data-cin-arms inputmode="decimal" placeholder="Optional" /></label>
        <label>Thighs (cm)<input class="text-input" data-cin-thighs inputmode="decimal" placeholder="Optional" /></label>
      </div>
      <label class="field-label">Note</label>
      <textarea class="text-input" data-cin-note rows="3" placeholder="How the month felt"></textarea>
      <label class="field-label">Progress photo (saved on this phone)</label>
      <input class="text-input" type="file" accept="image/*" data-cin-photo />
      <div class="checkin-preview" data-cin-preview></div>
      <div class="sheet-actions" style="margin:16px 0 8px;padding:0;display:flex;gap:8px">
        <button type="button" class="btn ghost" data-action="close-sheet">Close</button>
        <button type="button" class="btn pri save-checkin-btn" data-action="save-checkin" data-testid="save-checkin" style="margin:0">Save check-in</button>
      </div>
      <h3 class="checkin-hist-title">History</h3>
      ${history}
    </div>`;
    bindCheckInPhoto(contentEl());
  }

  function bindCheckInPhoto(root) {
    const file = root.querySelector("[data-cin-photo]");
    if (!file) return;
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      resizeCheckInPhoto(f, (url) => {
        file.dataset.ready = url || "";
        const prev = root.querySelector("[data-cin-preview]");
        if (prev) prev.innerHTML = url ? `<img class="checkin-preview-img" src="${url}" alt="Preview">` : "";
      });
    });
  }

  function renderSettingsPage() {
    hideFooter();
    contentEl().classList.remove("flush");
    const rest = D().get().restSeconds || 90;
    const days = D().get().daysPerWeek || 4;
    const pid = D().activeProgramId();
    contentEl().innerHTML = `<div class="settings-page" data-testid="settings-tab">
      <div class="settings-row">
        <span>Rest timer</span>
        <div class="stepper">
          <button type="button" data-action="rest-dec" aria-label="Shorter rest">−</button>
          <b data-rest-value>${rest}s</b>
          <button type="button" data-action="rest-inc" aria-label="Longer rest">+</button>
        </div>
      </div>
      <div class="settings-row">
        <span>Program</span>
        <button type="button" class="add" data-action="choose-program" data-testid="settings-program">${esc(D().programTitle())}</button>
      </div>
      ${pid === "max-ot"
        ? `<div class="settings-row"><span>Training days</span><b>5x/week · Mon–Fri</b></div>`
        : `<div class="settings-row">
        <span>Training days</span>
        <button type="button" class="add" data-action="change-days" data-testid="change-days">${esc(days + "x/week")}</button>
      </div>`}
      <div class="settings-row">
        <span>Default program</span>
        <button type="button" class="add" data-action="reset-program">Reset</button>
      </div>
      <p class="empty" style="text-align:left;padding:16px 0 0">VELA keeps everything on this phone. Bro Split 4-day, Bro Split 5-day and Max-OT each keep their own week and plan. History and last weights are shared, so overload still works if you switch.</p>
      ${window.VELA_FOOD ? window.VELA_FOOD.settingsHtml() : ""}
      <div class="settings-version" data-testid="app-version">
        <span>Version</span>
        <b>${VELA_VERSION}</b>
      </div>
      <p class="settings-build">VELA ${VELA_VERSION} · ${VELA_CACHE}</p>
      <p class="credits" data-testid="photo-credits">Exercise photos are freely licensed stills: videos by Goulart on wger.de (CC BY-SA 4.0) and photographs by George Stepanek, Aliva Sahoo, Tyler Read, Nenad Stojkovic, Shixart1985 and PTPioneer (CC BY / CC BY-SA), stills from a Colossus Fitness video (CC BY 3.0); Cable Push Down (Straight Bar) and Cable Rope Tricep Extension have their own photos (George Stepanek, CC BY-SA 3.0; Shixart1985, CC BY 2.0), and U.S. Navy / U.S. Marine Corps photos (public domain). Incline Dumbbell Tricep Extension uses an Everkinetic line illustration (CC BY-SA 3.0) restyled for VELA — no freely licensed photo was found. Flat Barbell Bench Press and Cable Push Down (Straight Bar) also have looping demos generated with ChatGPT. Food data comes from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL); the barcode scanner uses ZXing (Apache 2.0). Dumbbell Pullover, Straight-Arm Pulldown, Reverse Hyper, Cable Lateral Raise, Calf Raises on Leg Press, Low Cable Fly, Cable Crunch and Pallof Press have no freely licensed photo of the right equipment yet, so they show an icon. We did not use free-exercise-db images — those were scraped and are not free to reuse.</p>
    </div>`;
  }

  function render() {
    const ae = document.activeElement;
    const typing = ae && ae.matches && ae.matches("input[data-field], textarea[data-notes], [data-cin-weight], [data-cin-note], [data-cin-waist], [data-cin-chest], [data-cin-arms], [data-cin-thighs]");
    if (typing) return;
    contentEl().classList.remove("flush");
    if (view !== "workout") contentEl().classList.remove("has-footer");
    renderHeader();
    renderTabBar();
    if (view === "days-setup") renderDaysSetup();
    else if (view === "workout") renderWorkout();
    else if (view === "review") renderReviewWorkout();
    else if (view === "program-week") renderProgramWeek();
    else if (view === "program") renderProgram();
    else if (view === "progress") renderProgress();
    else if (view === "checkin") renderCheckInPage();
    else if (view === "settings") renderSettingsPage();
    else if (view === "food" && window.VELA_FOOD) { hideFooter(); window.VELA_FOOD.renderPage(contentEl()); }
    else {
      contentEl().classList.remove("has-footer");
      renderHome();
      bindSwipeWorkouts();
    }
    syncChrome();
  }

  function renderReviewWorkout() {
    const w = reviewWorkout;
    if (!w) {
      view = returnView || "program";
      render();
      return;
    }
    hideFooter();
    const cards = (w.exercises || []).map((ex, i) => exerciseCard(ex, i, w)).join("");
    contentEl().innerHTML = `
      <p class="week-kicker">Logged ${esc((w.completedAt || "").slice(0, 10) || "")}</p>
      <h1 class="ex-heading">${esc(w.name)}</h1>
      ${workoutVolumeBlock(w)}
      <div class="stack" data-testid="exercise-stack">${cards || `<p class="empty">Nothing was logged in this session.</p>`}</div>`;
  }

  function openDaysSetup(source) {
    daysSetupSource = source || "settings";
    view = "days-setup";
    editing = null;
    workoutEditMode = false;
    render();
  }

  function renderDaysSetup() {
    contentEl().classList.remove("has-footer");
    footerEl().classList.add("hidden");
    footerEl().innerHTML = "";
    const current = D().get().daysPerWeek;
    const opt = (n, label) =>
      `<button type="button" class="days-card${current === n ? " on" : ""}" data-action="choose-days" data-days="${n}" data-testid="days-option-${n}">${esc(label)}</button>`;
    contentEl().innerHTML = `
      <div class="days-setup" data-testid="days-setup">
        <h1>How often do you want to train?</h1>
        <div class="days-options">
          ${opt(4, "4x/week")}
          ${opt(5, "5x/week")}
        </div>
      </div>`;
  }

  function chooseDays(days) {
    const src = daysSetupSource || "settings";
    const n = Number(days) === 5 ? 5 : 4;
    if (src === "reset-cycle") {
      D().resetCycle(n);
      activeWorkoutId = null;
      editing = null;
      workoutEditMode = false;
      stopRest(true);
    } else if (src === "reset-program") {
      D().resetToProgram(n);
      activeWorkoutId = null;
      editing = null;
      workoutEditMode = false;
      stopRest(true);
    } else {
      D().setDaysPerWeek(n);
    }
    daysSetupSource = null;
    view = "home";
    render();
  }

  function cancelDaysSetup() {
    daysSetupSource = null;
    view = "home";
    render();
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
    const prevVol = D().previousExerciseVolume(ex, w.sessionId);
    const pct = volumeBarPct(vol, target, prevVol);
    const bar = contentEl().querySelector(`[data-volbar="${exIndex}"]`);
    const amt = contentEl().querySelector(`[data-volamt="${exIndex}"]`);
    if (bar) bar.style.width = `${pct}%`;
    if (amt) amt.textContent = D().formatVolumeKg(vol);
    const slot = contentEl().querySelector(`[data-volcmp="${exIndex}"]`);
    if (slot) slot.innerHTML = volumeCompareHtml(D().volumeCompare(vol, prevVol), "volume-vs-last-" + exIndex);
    const allDone = ex.sets.length && ex.sets.every((s) => s.done);
    const check = contentEl().querySelector(`[data-ex-check="${exIndex}"]`);
    if (check) check.innerHTML = allDone ? ICONS.checkFill : ICONS.checkEmpty;
    const host = contentEl().querySelector('[data-testid="workout-volume"]');
    if (host) host.outerHTML = workoutVolumeBlock(w);
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
      <div class="tracking-head">
        <h2>Sets Tracking</h2>
        <button type="button" class="tracking-close" data-action="close-sheet" data-testid="close-tracking" aria-label="Done">Done ${ICONS.close}</button>
      </div>
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
    </div>`, { top: true });
    lockBackgroundScroll();
    startViewportPin();
    const repsInput = overlaysEl().querySelector('[data-testid="reps-input"]');
    /* Focus without letting iOS scroll the page behind the card. */
    if (repsInput) {
      requestAnimationFrame(() => {
        repsInput.focus({ preventScroll: true });
        pinTrackingToViewport();
      });
    }
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

  /* v20: the rest timer is timestamp-based. iOS pauses JS while the app is in the
     background, so we store when rest ends and work out what's left from the clock. */
  const REST_KEY = "vela-rest-v1";

  function saveRest() {
    try {
      if (restTimer) localStorage.setItem(REST_KEY, JSON.stringify({ endsAt: restTimer.endsAt, total: restTimer.total, next: restTimer.next, workoutId: restTimer.workoutId }));
      else localStorage.removeItem(REST_KEY);
    } catch (e) {}
  }

  function restRemaining() {
    if (!restTimer) return 0;
    return Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000));
  }

  function startRest(exIndex, setIndex) {
    stopRest(false);
    const total = D().get().restSeconds || 90;
    const next = nextSetHint(exIndex, setIndex);
    runRest({ endsAt: Date.now() + total * 1000, total, next, workoutId: activeWorkoutId });
  }

  function runRest(t) {
    restTimer = { endsAt: t.endsAt, total: t.total, next: t.next || "", workoutId: t.workoutId || null, interval: null, remaining: 0 };
    restTimer.remaining = restRemaining();
    saveRest();
    showRestSheet();
    restTimer.interval = setInterval(tickRest, 250);
    tickRest();
  }

  function tickRest() {
    if (!restTimer) return;
    restTimer.remaining = restRemaining();
    if (restTimer.remaining <= 0) { finishRest(); return; }
    patchRest();
  }

  function finishRest() {
    if (!restTimer) return;
    if (restTimer.interval) clearInterval(restTimer.interval);
    restTimer.interval = null;
    restTimer.remaining = 0;
    patchRest();
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
    const sheet = overlaysEl().querySelector('[data-testid="rest-timer"]');
    if (sheet) {
      sheet.classList.add("rest-done");
      const lbl = sheet.querySelector(".rest-lbl");
      if (lbl) lbl.textContent = "Rest done";
    }
    restTimer = null;
    saveRest();
    setTimeout(() => {
      if (restTimer) return; /* a new rest started meanwhile */
      const host = overlaysEl().querySelector("[data-rest-host]");
      const el = host && host.querySelector('.rest-done');
      if (el) host.innerHTML = "";
    }, 1500);
  }

  /* Bring the rest timer up to date after the app was in the background or reloaded. */
  function resumeRest() {
    if (restTimer) { tickRest(); return; }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(REST_KEY) || "null"); } catch (e) {}
    if (!saved || !saved.endsAt) return;
    if (view !== "workout") return;
    if (saved.workoutId && saved.workoutId !== activeWorkoutId) return;
    runRest(saved);
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
    saveRest();
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

  let viewportPin = null;
  let lockedScroll = null;

  function lockBackgroundScroll() {
    const c = contentEl();
    lockedScroll = c.scrollTop;
    c.style.overflow = "hidden";
  }

  function unlockBackgroundScroll() {
    const c = contentEl();
    c.style.overflow = "";
    if (lockedScroll != null) {
      c.scrollTop = lockedScroll;
      lockedScroll = null;
    }
  }

  function applyTrackingViewport(height, offsetTop) {
    const card = overlaysEl().querySelector(".sheet.tracking, .sheet.kb-safe");
    if (!card) return;
    const app = document.getElementById("app");
    const header = document.getElementById("header");
    const appRect = app ? app.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const headerRect = header ? header.getBoundingClientRect() : { bottom: appRect.top };
    const vvTop = offsetTop == null ? 0 : offsetTop;
    const vvHeight = height == null ? window.innerHeight : height;
    const vvBottom = vvTop + vvHeight;
    /* Sit just below the header when there is room; otherwise pin to the visible top. */
    const belowHeader = headerRect.bottom + 8;
    const minCard = 260;
    let viewTop = (vvBottom - belowHeader >= minCard) ? Math.max(vvTop + 8, belowHeader) : vvTop + 8;
    const top = viewTop - appRect.top;
    card.style.top = `${Math.max(8, top)}px`;
    const visibleBottom = vvBottom - appRect.top;
    card.style.maxHeight = `${Math.max(180, visibleBottom - Math.max(8, top) - 8)}px`;
  }

  function pinTrackingToViewport() {
    if (!overlaysEl().querySelector(".sheet.tracking, .sheet.kb-safe")) return;
    const vv = window.visualViewport;
    if (vv) applyTrackingViewport(vv.height, vv.offsetTop);
    else applyTrackingViewport(window.innerHeight, 0);
  }

  function startViewportPin() {
    stopViewportPin();
    const handler = () => pinTrackingToViewport();
    viewportPin = handler;
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", handler);
      vv.addEventListener("scroll", handler);
    }
    window.addEventListener("resize", handler);
    pinTrackingToViewport();
  }

  function stopViewportPin() {
    if (!viewportPin) return;
    const vv = window.visualViewport;
    if (vv) {
      vv.removeEventListener("resize", viewportPin);
      vv.removeEventListener("scroll", viewportPin);
    }
    window.removeEventListener("resize", viewportPin);
    viewportPin = null;
  }

  function closeSheet() {
    if (window.VELA_FOOD) window.VELA_FOOD.stopScan();
    stopViewportPin();
    unlockBackgroundScroll();
    const host = overlaysEl().querySelector("[data-sheet-host]");
    if (host) host.innerHTML = "";
    syncChrome();
  }

  function showSheet(html, opts) {
    ensureOverlayHost();
    const top = opts && opts.top;
    const cls = top ? "overlay overlay-top" : "overlay";
    overlaysEl().querySelector("[data-sheet-host]").innerHTML = `<div class="${cls}" data-overlay="sheet">${html}</div>`;
    syncChrome();
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

  function openDemo(exIndex) {
    const w = activeWorkout();
    const ex = w && w.exercises[exIndex];
    if (!ex) return;
    const photo = C().photoFor(ex.name);
    const credit = photo && photo.video
      ? (photo.videoNote || "Looping demo")
      : photo
        ? `${photo.author || "Unknown"} · ${photo.license || ""}${photo.match === "closest" ? " · closest match" : ""}`
        : "";
    showSheet(`<div class="demo-card" role="dialog" aria-modal="true" aria-label="${esc(ex.name)} demo" data-testid="exercise-demo">
        <button type="button" class="tracking-close" data-action="close-sheet" data-testid="close-demo" aria-label="Close">Done ${ICONS.close}</button>
        <div class="demo-photo">${C().photoMarkup(ex.name, { large: true })}</div>
        <h2>${esc(ex.name)}</h2>
        ${credit ? `<p class="demo-credit">${esc(credit)}</p>` : ""}
      </div>`, { top: true });
  }


  function openProgramPicker() {
    const current = D().activeProgramId();
    const items = D().listProgramChoices().map((p) => {
      const on = p.id === current ? " on" : "";
      return `<button type="button" class="pick-item${on}" data-action="select-program" data-program="${esc(p.id)}" data-testid="${esc(p.testid)}">
        <span class="pick-meta"><strong>${esc(p.name)}</strong><em>${esc(p.meta)}</em></span>
      </button>`;
    }).join("");
    showSheet(`<div class="sheet" data-testid="program-picker">
      <div class="handle"></div>
      <h2>Change program</h2>
      <div class="sheet-body">${items}
        <p class="empty" style="text-align:left;padding:8px 0 0">Bro Split 4-day, Bro Split 5-day and Max-OT each keep their own week and plan. History stays shared, so overload signs still work.</p>
      </div>
      <div class="sheet-actions"><button type="button" class="btn ghost" data-action="close-sheet">Cancel</button></div>
    </div>`);
  }

  function selectProgram(id) {
    if (!id) return;
    D().switchProgram(id);
    activeWorkoutId = null;
    editing = null;
    workoutEditMode = false;
    programWeek = null;
    reviewWorkout = null;
    closeSheet();
    /* Stay on Program if that's where Change program was used; otherwise Home so existing tests still see the plan. */
    if (tab === "program" || view === "program" || view === "settings") {
      tab = view === "settings" ? "settings" : "program";
      view = tab;
    } else {
      tab = "home";
      view = "home";
    }
    persistTab();
    if (id === "bro-split" && D().get().daysPerWeek == null) {
      openDaysSetup("settings");
      return;
    }
    render();
  }

  function openPersonalBests() {
    const stats = D().weekStats();
    const rows = (stats.pbList || []).map((pb) => {
      const name = pb.key.replace(/-/g, " ");
      const prev = pb.previous ? ` (was ${pb.previous}kg)` : " (first heavy set)";
      return `<div class="hist-item"><div class="when">${esc(name)}</div><div class="sets">${esc(pb.weight)}kg${esc(prev)}</div></div>`;
    }).join("") || `<p class="empty">No new heaviest-weight sets this week.</p>`;
    showSheet(`<div class="sheet" data-testid="pb-sheet">
      <div class="handle"></div>
      <h2>Personal bests</h2>
      <div class="sheet-body">
        <p class="empty" style="text-align:left">A personal best is the heaviest weight you’ve logged for an exercise. This list is new PBs this week.</p>
        ${rows}
      </div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
    </div>`);
  }

  function openCheckIn() {
    tab = "checkin";
    view = "checkin";
    persistTab();
    closeSheet();
    render();
    contentEl().scrollTop = 0;
  }

    function resizeCheckInPhoto(file, done) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 800;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          const scale = max / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        done(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => done(null);
      img.src = reader.result;
    };
    reader.onerror = () => done(null);
    reader.readAsDataURL(file);
  }

  function commitCheckIn() {
    const root = (overlaysEl() && overlaysEl().querySelector("[data-cin-weight]")) ? overlaysEl() : contentEl();
    const num = (sel) => {
      const el = root.querySelector(sel);
      const v = C().parseNum(el && el.value);
      return v;
    };
    const dateEl = root.querySelector("[data-cin-date]");
    const noteEl = root.querySelector("[data-cin-note]");
    const photoEl = root.querySelector("[data-cin-photo]");
    const weight = num("[data-cin-weight]");
    if (weight == null) {
      showToast("Add a body weight to save");
      return;
    }
    D().saveCheckIn({
      date: (dateEl && dateEl.value) || D().copenhagenYMD(),
      weight,
      waist: num("[data-cin-waist]"),
      chest: num("[data-cin-chest]"),
      arms: num("[data-cin-arms]"),
      thighs: num("[data-cin-thighs]"),
      note: (noteEl && noteEl.value) || "",
      photo: (photoEl && photoEl.dataset.ready) || null,
    });
    closeSheet();
    tab = "home";
    view = "home";
    persistTab();
    render();
    showToast("Check-in saved");
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
          <span>Program</span>
          <button type="button" class="add" data-action="choose-program" data-testid="settings-program">${esc(D().programName())}</button>
        </div>
        ${D().activeProgramId() === "max-ot"
          ? `<div class="settings-row"><span>Training days</span><b>5x/week · Mon–Fri</b></div>`
          : `<div class="settings-row">
          <span>Training days</span>
          <button type="button" class="add" data-action="change-days" data-testid="change-days">${esc((D().get().daysPerWeek || 4) + "x/week")}</button>
        </div>`}
        <div class="settings-row">
          <span>Default program</span>
          <button type="button" class="add" data-action="reset-program">Reset</button>
        </div>
        <p class="empty" style="text-align:left;padding:16px 0 0">VELA keeps everything on this phone. Each program has its own week and plan. History and last weights are shared, so overload still works if you switch. Edit program.js to change the default workouts.</p>
        <p class="credits" data-testid="photo-credits">Exercise photos are freely licensed stills: videos by Goulart on wger.de (CC BY-SA 4.0) and photographs by George Stepanek, Aliva Sahoo, Tyler Read, Nenad Stojkovic, Shixart1985 and PTPioneer (CC BY / CC BY-SA), stills from a Colossus Fitness video (CC BY 3.0); Cable Push Down (Straight Bar) and Cable Rope Tricep Extension have their own photos (George Stepanek, CC BY-SA 3.0; Shixart1985, CC BY 2.0), and U.S. Navy / U.S. Marine Corps photos (public domain). Incline Dumbbell Tricep Extension uses an Everkinetic line illustration (CC BY-SA 3.0) restyled for VELA — no freely licensed photo was found. Flat Barbell Bench Press and Cable Push Down (Straight Bar) also have looping demos generated with ChatGPT. Food data comes from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL); the barcode scanner uses ZXing (Apache 2.0). Dumbbell Pullover, Straight-Arm Pulldown, Reverse Hyper, Cable Lateral Raise, Calf Raises on Leg Press, Low Cable Fly, Cable Crunch and Pallof Press have no freely licensed photo of the right equipment yet, so they show an icon. We did not use free-exercise-db images — those were scraped and are not free to reuse.</p>
      </div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
    </div>`);
  }

  function bumpRest(delta) {
    const cur = D().get().restSeconds || 90;
    const next = Math.max(15, Math.min(300, cur + delta));
    D().setRestSeconds(next);
    D().saveNow();
    document.querySelectorAll("[data-rest-value]").forEach((el) => { el.textContent = `${next}s`; });
  }

  function openAddWorkout() {
    const items = C().EXERCISES.map((ex, i) =>
      `<label class="pick-item"><input type="checkbox" data-pick="${i}" hidden>
       <span class="mini-thumb">${C().photoMarkup(ex.name, { mini: true })}</span><span>${esc(ex.name)}</span></label>`
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
    openLibraryPicker({ mode: "swap", exIndex });
  }

  function openLibraryPicker({ mode, exIndex }) {
    const w = activeWorkout();
    const ex = mode === "swap" && w ? w.exercises[exIndex] : null;
    pickerState = {
      mode,
      exIndex,
      category: ex ? C().categoryOf(ex.name) : "",
      sub: "",
      equipment: "",
      query: "",
    };
    const title = mode === "add" ? "Add exercise" : "Swap exercise";
    const sug = (mode === "swap" && ex && ex.alt)
      ? `<button type="button" class="pick-item on" data-action="use-suggested-alt" data-ex="${exIndex}" data-testid="suggested-alt">
          <span class="mini-thumb">${C().photoMarkup(ex.alt, { mini: true })}</span>
          <span>Use ${esc(ex.alt)}</span>
        </button>`
      : "";
    showSheet(`<div class="sheet" data-testid="exercise-picker">
      <div class="handle"></div>
      <h2>${esc(title)}</h2>
      <div class="sheet-body">
        ${sug}
        <input class="search-input" data-picker-search data-testid="picker-search" placeholder="Search exercises" autocomplete="off" enterkeyhint="search" />
        <div class="chip-row" data-cat-chips data-testid="category-chips"></div>
        <div class="chip-row sub" data-sub-chips data-testid="sub-chips"></div>
        <div class="chip-row" data-equip-chips data-testid="equipment-chips"></div>
        <div class="pick-list" data-pick-list data-testid="picker-list"></div>
        <label class="field-label">Custom</label>
        <input class="text-input" data-custom-alt data-testid="custom-exercise" placeholder="Type an exercise name" />
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="close-sheet">Cancel</button>
        <button type="button" class="btn pri" data-action="apply-custom-alt" data-ex="${exIndex == null ? "" : exIndex}" data-testid="use-custom">Use custom</button>
      </div>
    </div>`);
    const search = overlaysEl().querySelector("[data-picker-search]");
    search.addEventListener("input", () => {
      if (!pickerState) return;
      pickerState.query = search.value;
      paintPickerList();
    });
    overlaysEl().querySelector("[data-cat-chips]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn || !pickerState) return;
      pickerState.category = btn.dataset.cat;
      pickerState.sub = "";
      paintPickerChips();
      paintPickerList();
    });
    overlaysEl().querySelector("[data-sub-chips]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sub]");
      if (!btn || !pickerState) return;
      pickerState.sub = btn.dataset.sub;
      paintPickerChips();
      paintPickerList();
    });
    overlaysEl().querySelector("[data-equip-chips]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-equip]");
      if (!btn || !pickerState) return;
      pickerState.equipment = btn.dataset.equip;
      paintPickerChips();
      paintPickerList();
    });
    paintPickerChips();
    paintPickerList();
  }

  function chipBtn(label, on, attrs) {
    return `<button type="button" class="filter-chip${on ? " on" : ""}" ${attrs}>${esc(label)}</button>`;
  }

  function paintPickerChips() {
    if (!pickerState) return;
    const catHost = overlaysEl().querySelector("[data-cat-chips]");
    const subHost = overlaysEl().querySelector("[data-sub-chips]");
    const eqHost = overlaysEl().querySelector("[data-equip-chips]");
    if (!catHost) return;
    const cats = ["", ...C().CATEGORIES];
    catHost.innerHTML = cats.map((c) =>
      chipBtn(c || "All", pickerState.category === c, `data-cat="${esc(c)}" data-testid="cat-chip-${c || "all"}"`)
    ).join("");
    if (pickerState.category === "Legs") {
      subHost.innerHTML = ["", ...C().LEG_SUBS].map((s) =>
        chipBtn(s || "All", pickerState.sub === s, `data-sub="${esc(s)}" data-testid="sub-chip-${s || "all"}"`)
      ).join("");
      subHost.hidden = false;
    } else {
      subHost.innerHTML = "";
      subHost.hidden = true;
    }
    eqHost.innerHTML = ["", ...C().EQUIPMENT].map((eq) =>
      chipBtn(eq || "All gear", pickerState.equipment === eq, `data-equip="${esc(eq)}" data-testid="equip-chip-${eq || "all"}"`)
    ).join("");
    const selected = catHost.querySelector(".filter-chip.on");
    if (selected && selected.scrollIntoView) {
      selected.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
    }
  }

  function paintPickerList() {
    if (!pickerState) return;
    const list = overlaysEl().querySelector("[data-pick-list]");
    if (!list) return;
    const items = C().filterExercises(pickerState);
    const currentKey = (() => {
      if (pickerState.mode !== "swap") return "";
      const w = activeWorkout();
      const ex = w && w.exercises[pickerState.exIndex];
      return ex ? ex.key : "";
    })();
    list.innerHTML = items.map((item) => {
      const key = C().slug(item.name);
      const on = key === currentKey ? " on" : "";
      return `<button type="button" class="pick-item${on}" data-action="pick-library" data-name="${esc(item.name)}" data-testid="picker-item-${esc(key)}">
        <span class="mini-thumb">${C().photoMarkup(item.name, { mini: true })}</span>
        <span class="pick-meta"><strong>${esc(item.name)}</strong><em>${esc(item.equipment)}${item.sub ? " · " + esc(item.sub) : ""}</em></span>
      </button>`;
    }).join("") || `<div class="empty-pick">No exercises match</div>`;
  }

  function applyLibraryPick(name) {
    if (!pickerState) return;
    if (pickerState.mode === "add") {
      const catalog = C().findExercise(name);
      D().addExercise(activeWorkoutId, {
        name,
        alt: "",
        tempo: catalog && catalog.tempo,
        thumb: catalog && catalog.thumb,
        sets: 3,
        reps: catalog && catalog.repsRange ? catalog.defaultReps : 10,
        weight: catalog ? catalog.defaultWeight : null,
      });
      closeSheet();
      pickerState = null;
      render();
      return;
    }
    applyAlt(pickerState.exIndex, name);
  }

  function openExMenu(exIndex) {
    const w = activeWorkout();
    const ex = w && w.exercises[exIndex];
    if (!ex) return;
    showSheet(`<div class="sheet" data-testid="ex-menu-sheet">
      <div class="handle"></div>
      <h2>${esc(ex.name)}</h2>
      <div class="sheet-body">
        <button type="button" class="pick-item" data-action="alt" data-ex="${exIndex}" data-testid="menu-swap">Swap exercise</button>
        <button type="button" class="pick-item danger-item" data-action="remove-exercise" data-ex="${exIndex}" data-testid="menu-remove">Remove exercise</button>
      </div>
      <div class="sheet-actions"><button type="button" class="btn ghost" data-action="close-sheet">Cancel</button></div>
    </div>`);
  }

  function requestRemoveExercise(exIndex) {
    const w = activeWorkout();
    const ex = w && w.exercises[exIndex];
    if (!ex) return;
    showConfirm({
      title: `Remove ${ex.name}?`,
      body: "It will be taken out of this workout. History stays saved if you add it back later.",
      confirm: "Remove",
      danger: true,
      onConfirm: () => {
        const removed = D().removeExercise(activeWorkoutId, exIndex);
        render();
        if (!removed) return;
        showToast("Exercise removed", "Undo", () => {
          D().restoreExercise(removed.workoutId, removed.exercise, removed.index);
          render();
        });
      },
    });
  }

  function bindExerciseReorder() {
    if (!workoutEditMode) return;
    const stack = contentEl().querySelector('[data-testid="exercise-stack"]');
    if (!stack) return;
    stack.querySelectorAll("[data-drag-handle]").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const block = handle.closest("[data-ex-block]");
        if (!block) return;
        const blocks = [...stack.querySelectorAll("[data-ex-block]")];
        const from = Number(block.getAttribute("data-ex-block"));
        const startY = e.clientY;
        const origTop = block.getBoundingClientRect().top;
        block.classList.add("dragging");
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        let currentTo = from;
        const move = (ev) => {
          const dy = ev.clientY - startY;
          block.style.transform = `translateY(${dy}px)`;
          const mid = origTop + dy + block.offsetHeight / 2;
          let best = from;
          let bestDist = Infinity;
          blocks.forEach((b, i) => {
            const r = b.getBoundingClientRect();
            const d = Math.abs(mid - (r.top + r.height / 2));
            if (d < bestDist) { bestDist = d; best = i; }
          });
          currentTo = best;
        };
        const end = () => {
          block.classList.remove("dragging");
          block.style.transform = "";
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          if (currentTo !== from) {
            D().moveExercise(activeWorkoutId, from, currentTo);
            render();
          }
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
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
    pickerState = null;
    editing = null;
    render();
  }

  function exerciseNameFromKey(key) {
    const found = (C().EXERCISES || []).find((e) => C().slug(e.name) === key);
    if (found) return found.name;
    const w = activeWorkout();
    const live = w && w.exercises.find((e) => e.key === key);
    if (live) return live.name;
    return String(key || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatHistoryWhen(h) {
    const when = h.date ? new Date(h.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    const week = h.week ? ` · Week ${h.week}` : "";
    return `${when}${h.workout ? " · " + h.workout : ""}${week}`;
  }

  function historySetRow(h, set, i, signs, exerciseKey) {
    if (!D().historySetLogged(set)) return "";
    const sign = signs && signs[i];
    const badge = sign ? overloadBadge(sign) : "";
    const sid = esc(h.sessionId);
    const editBtns = historyEditMode
      ? `<span class="hist-set-acts">
           <button type="button" class="hist-edit-set" data-action="edit-hist-set" data-key="${esc(exerciseKey)}" data-session="${sid}" data-set="${i}" data-testid="edit-hist-set-${esc(exerciseKey)}-${sid}-${i}">Edit</button>
           <button type="button" class="hist-del" data-action="delete-hist-set" data-key="${esc(exerciseKey)}" data-session="${sid}" data-set="${i}" data-testid="delete-hist-set-${esc(exerciseKey)}-${sid}-${i}">Delete</button>
         </span>`
      : "";
    return `<div class="hist-swipe" data-swipe="hist-set" data-key="${esc(exerciseKey)}" data-session="${sid}" data-set="${i}">
      <button type="button" class="swipe-actions" data-action="delete-hist-set" data-key="${esc(exerciseKey)}" data-session="${sid}" data-set="${i}" aria-hidden="true" tabindex="-1">Delete</button>
      <div class="swipe-front">
        <div class="set-line" data-testid="history-set-${sid}-${i}">
          <span class="set-n">Set ${i + 1}</span>
          <span class="set-val">${esc(D().formatLogged(set.weight, set.reps))}</span>
          ${badge}
          ${editBtns}
        </div>
      </div>
    </div>`;
  }

  function closeHistMenus() {
    const root = overlaysEl();
    if (!root) return;
    root.querySelectorAll(".hist-menu").forEach((m) => m.classList.add("hidden"));
    root.querySelectorAll('[data-action="toggle-hist-menu"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  function histMenuButton(menuId, items) {
    return `<div class="hist-menu-wrap">
      <button type="button" class="more-btn hist-more" data-action="toggle-hist-menu" data-menu="${esc(menuId)}" data-testid="hist-menu-${esc(menuId)}" aria-label="Session options" aria-expanded="false">${ICONS.more}</button>
      <div class="hist-menu hidden" data-testid="hist-menu-panel-${esc(menuId)}" role="menu">
        ${items.join("")}
      </div>
    </div>`;
  }

  function openHistory(exIndex) {
    if (exIndex != null) historyExIndex = exIndex;
    historySessionId = null;
    paintHistory();
  }

  function openHistorySession(sessionId) {
    historySessionId = sessionId;
    paintHistory();
  }

  function paintHistory() {
    const w = activeWorkout();
    if (historySessionId) {
      const rows = D().getSessionHistory(historySessionId);
      const head = rows[0] && rows[0].entry;
      const title = head ? formatHistoryWhen(head) : "Session";
      const blocks = rows.map((row) => {
        const h = row.entry;
        const older = D().previousSession(row.key, h.sessionId);
        const signs = D().sessionSetOverload(h, older);
        const sets = (h.sets || []).map((s, i) => historySetRow(h, s, i, signs, row.key)).join("");
        const exMenu = histMenuButton(row.key, [
          `<button type="button" class="danger" data-action="delete-hist-exercise" data-key="${esc(row.key)}" data-session="${esc(h.sessionId)}" data-testid="delete-hist-exercise-${esc(row.key)}">Delete this exercise</button>`,
        ]);
        return `<div class="hist-item" data-testid="history-entry" data-session="${esc(h.sessionId)}" data-key="${esc(row.key)}">
          <div class="when-row">
            <div class="when">${esc(exerciseNameFromKey(row.key))}</div>
            ${exMenu}
          </div>
          <div class="sets signs">${sets}</div>
        </div>`;
      }).join("") || `<div class="empty">Nothing logged in this session.</div>`;
      const sessionMenu = rows.length ? histMenuButton("session", [
        `<button type="button" class="danger" data-action="delete-hist-session" data-session="${esc(historySessionId)}" data-testid="delete-hist-session">Delete entire session</button>`,
      ]) : "";
      showSheet(`<div class="sheet" data-testid="history-sheet">
        <div class="handle"></div>
        <div class="hist-head">
          <button type="button" class="btn-edit" data-action="history-back" data-testid="history-back">Back</button>
          <h2>Session</h2>
          <button type="button" class="btn-edit${historyEditMode ? " on" : ""}" data-action="toggle-history-edit" data-testid="history-edit">Edit</button>
        </div>
        <div class="sheet-body">
          <div class="when-row hist-session-title">
            <p class="hint" style="margin:0">${esc(title)}</p>
            ${sessionMenu}
          </div>
          ${blocks}
        </div>
        <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
      </div>`);
      bindHistorySwipes();
      return;
    }
    const live = w && historyExIndex != null ? w.exercises[historyExIndex] : null;
    const key = (live && live.key) || historyKey;
    const ex = live || (key ? { key, name: exerciseNameFromKey(key) } : null);
    if (!ex) {
      closeSheet();
      return;
    }
    const hist = D().getHistory(ex.key);
    const rows = hist.map((h, idx) => {
      const older = hist[idx + 1] || null;
      const signs = D().sessionSetOverload(h, older);
      const sets = (h.sets || []).map((s, i) => historySetRow(h, s, i, signs, ex.key)).join("");
      const menu = histMenuButton(h.sessionId, [
        `<button type="button" data-action="open-hist-session" data-session="${esc(h.sessionId)}" data-testid="open-hist-session-${esc(h.sessionId)}">View session</button>`,
        `<button type="button" class="danger" data-action="delete-hist-exercise" data-key="${esc(ex.key)}" data-session="${esc(h.sessionId)}" data-testid="delete-hist-exercise-${esc(h.sessionId)}">Delete this exercise</button>`,
        `<button type="button" class="danger" data-action="delete-hist-session" data-session="${esc(h.sessionId)}" data-testid="delete-hist-session-${esc(h.sessionId)}">Delete entire session</button>`,
      ]);
      return `<div class="hist-item hist-swipe-item" data-testid="history-entry" data-session="${esc(h.sessionId)}" data-key="${esc(ex.key)}">
        <div class="when-row">
          <div class="when">${esc(formatHistoryWhen(h))}</div>
          ${menu}
        </div>
        <div class="sets signs">${sets}</div>
      </div>`;
    }).join("");
    showSheet(`<div class="sheet" data-testid="history-sheet">
      <div class="handle"></div>
      <div class="hist-head">
        <span class="hist-head-space"></span>
        <h2>${esc(ex.name)}</h2>
        <button type="button" class="btn-edit${historyEditMode ? " on" : ""}" data-action="toggle-history-edit" data-testid="history-edit">Edit</button>
      </div>
      <div class="sheet-body">${rows || `<div class="empty">No history yet. Track a set or finish a workout to log it.</div>`}</div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-action="close-sheet">Done</button></div>
    </div>`);
    bindHistorySwipes();
  }

  function bindHistorySwipes() {
    const sheet = overlaysEl().querySelector('[data-testid="history-sheet"]');
    if (sheet && !sheet.dataset.menuBound) {
      sheet.dataset.menuBound = "1";
      sheet.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".hist-menu-wrap")) return;
        closeHistMenus();
      });
    }
    overlaysEl().querySelectorAll('[data-swipe="hist-set"]').forEach((row) => {
      const front = row.querySelector(".swipe-front") || row;
      let startX = 0, startY = 0, dx = 0, tracking = false, decided = false, horizontal = false;
      row.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
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
            row.classList.add("dragging");
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
        const isTap = tracking && !decided;
        const shouldDelete = horizontal && dx < -56;
        tracking = false;
        row.classList.remove("dragging");
        front.style.transition = "";
        front.style.transform = "";
        if (shouldDelete) {
          requestDeleteHistorySet(row.dataset.key, row.dataset.session, Number(row.dataset.set));
        } else if (isTap) {
          openEditHistorySet(row.dataset.key, row.dataset.session, Number(row.dataset.set));
        }
      }
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
    });
  }

  function refreshAfterHistory() {
    if (view === "review" && reviewWorkout && reviewWorkout.sessionId) {
      reviewWorkout = D().workoutFromSession(reviewWorkout.sessionId);
    }
    render();
    if (historyKey || historyExIndex != null || historySessionId) paintHistory();
  }

  function afterHistoryChange(snap, message) {
    refreshAfterHistory();
    if (!snap) return;
    showToast(message, "Undo", () => {
      D().restoreHistoryUndo(snap);
      refreshAfterHistory();
    });
  }

  function requestDeleteHistorySet(key, sessionId, setIndex) {
    const entry = D().findHistoryEntry(key, sessionId);
    const set = entry && entry.sets && entry.sets[setIndex];
    if (!set) return;
    const label = D().formatLogged(set.weight, set.reps);
    showConfirm({
      title: `Delete set ${setIndex + 1}?`,
      body: `Remove ${label} from this session. Overload, volume and the dashboard will update. You can undo for a few seconds after.`,
      confirm: "Delete set",
      danger: true,
      onConfirm: () => {
        const snap = D().deleteHistorySet(key, sessionId, setIndex);
        afterHistoryChange(snap, "Set deleted");
      },
    });
  }

  function requestDeleteHistoryExercise(key, sessionId) {
    showConfirm({
      title: `Delete ${exerciseNameFromKey(key)} from this session?`,
      body: "All sets of this exercise in that session will be removed. Other exercises in the session are kept. You can undo for a few seconds after.",
      confirm: "Delete exercise",
      danger: true,
      onConfirm: () => {
        const snap = D().deleteHistoryExercise(key, sessionId);
        afterHistoryChange(snap, "Exercise entry deleted");
      },
    });
  }

  function requestDeleteHistorySession(sessionId) {
    const rows = D().getSessionHistory(sessionId);
    const when = rows[0] ? formatHistoryWhen(rows[0].entry) : "this session";
    showConfirm({
      title: "Delete entire session?",
      body: `This removes every exercise logged in ${when}. Overload, volume, PBs and the dashboard will update. You can undo for a few seconds after.`,
      confirm: "Delete session",
      danger: true,
      onConfirm: () => {
        const snap = D().deleteHistorySession(sessionId);
        if (historySessionId === sessionId) historySessionId = null;
        afterHistoryChange(snap, "Session deleted");
      },
    });
  }

  function openEditHistorySet(key, sessionId, setIndex) {
    const entry = D().findHistoryEntry(key, sessionId);
    const set = entry && entry.sets && entry.sets[setIndex];
    if (!set) return;
    const reps = set.reps == null ? "" : String(set.reps).replace(".", ",");
    const wt = set.weight == null ? "" : String(set.weight).replace(".", ",");
    showSheet(`<div class="sheet" data-testid="edit-hist-set-sheet">
      <div class="handle"></div>
      <h2>Edit set ${setIndex + 1}</h2>
      <div class="sheet-body">
        <p class="hint" style="margin:0 0 10px">${esc(exerciseNameFromKey(key))} · ${esc(formatHistoryWhen(entry))}</p>
        <label class="field-label">Reps</label>
        <input class="text-input" data-hist-reps data-testid="hist-reps-input" inputmode="decimal" value="${esc(reps)}" />
        <label class="field-label">Weight (kg)</label>
        <input class="text-input" data-hist-weight data-testid="hist-weight-input" inputmode="decimal" value="${esc(wt)}" />
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="history-back">Cancel</button>
        <button type="button" class="btn pri" data-action="save-hist-set" data-key="${esc(key)}" data-session="${esc(sessionId)}" data-set="${setIndex}" data-testid="save-hist-set">Save</button>
      </div>
    </div>`);
    const repsEl = overlaysEl().querySelector("[data-hist-reps]");
    if (repsEl) repsEl.focus({ preventScroll: true });
  }

  function saveEditedHistorySet(key, sessionId, setIndex) {
    const reps = C().parseNum((overlaysEl().querySelector("[data-hist-reps]") || {}).value);
    const weight = C().parseNum((overlaysEl().querySelector("[data-hist-weight]") || {}).value);
    const snap = D().updateHistorySet(key, sessionId, setIndex, { reps, weight });
    afterHistoryChange(snap, "Set updated");
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
      body: "This removes it from this week’s plan. Sets you already logged stay in History. You can undo for a few seconds after.",
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

  function goToNextWeek() {
    D().advanceWeek();
    activeWorkoutId = null;
    editing = null;
    workoutEditMode = false;
    programWeek = null;
    reviewWorkout = null;
    stopRest(true);
    if (tab === "program") view = "program";
    else { tab = "home"; view = "home"; }
    render();
  }

  function openCyclePrompt() {
    const name = D().programName();
    const n = D().cycleWeeks();
    const maxot = D().activeProgramId() === "max-ot";
    const restBtn = maxot
      ? `<button type="button" class="btn pri" data-action="cycle-recover" data-testid="cycle-recover">Take recovery week</button>`
      : "";
    const cont = maxot ? "Start a new cycle" : "Continue";
    const body = maxot
      ? "Max-OT prescribes a recovery week after 8 to 10 weeks of heavy training. You can take that week off now, start a new cycle with your current weights, or return to Week 1. History and overload signs are kept either way."
      : "You can keep going with your current weights, or start Week 1 again. Training history and overload signs are kept either way.";
    showSheet(`<div class="dialog cycle-prompt" data-testid="cycle-prompt" role="dialog" aria-modal="true">
      <h2>${esc(name)} — ${esc(n)} weeks done</h2>
      <p>${esc(body)}</p>
      <div class="sheet-actions col">
        ${restBtn}
        <button type="button" class="btn ${maxot ? "ghost" : "pri"}" data-action="cycle-continue" data-testid="cycle-continue">${esc(cont)}</button>
        <button type="button" class="btn ghost" data-action="cycle-reset" data-testid="cycle-reset">Reset</button>
      </div>
    </div>`);
  }

  function requestNextWeek() {
    if (D().get().recoveryWeek) {
      showConfirm({
        title: "Start the next cycle?",
        body: "Week 1 begins again with your current exercises and last logged weights. History is kept.",
        confirm: "Start next cycle",
        danger: false,
        onConfirm: goToNextWeek,
      });
      return;
    }
    if (D().isCycleEnd()) {
      openCyclePrompt();
      return;
    }
    const next = (D().get().week || 1) + 1;
    showConfirm({
      title: `Start ${D().weekLabel(next)}?`,
      body: "Your workout list stays the same. Completion resets, and last logged weights become the new suggestions.",
      confirm: `Start ${D().weekLabel(next)}`,
      danger: false,
      onConfirm: goToNextWeek,
    });
  }

  function requestCycleReset() {
    showConfirm({
      title: "Start Week 1 again?",
      body: "Training history and overload comparisons are kept. Last logged weights stay as your suggestions. You’ll pick 4 or 5 training days next.",
      confirm: "Reset",
      danger: true,
      onConfirm: () => {
        closeSheet();
        openDaysSetup("reset-cycle");
      },
    });
  }

  function requestProgramReset() {
    showConfirm({
      title: "Reset this program?",
      body: "Week 1 starts again with your current exercises and last logged weights. Training history and overload signs are kept.",
      confirm: "Reset program",
      danger: true,
      onConfirm: () => {
        const days = D().get().daysPerWeek || 4;
        D().resetCycle(days);
        programWeek = null;
        activeWorkoutId = null;
        editing = null;
        workoutEditMode = false;
        stopRest(true);
        view = "program";
        tab = "program";
        render();
        showToast("Program reset. History is kept.");
      },
    });
  }

  function requestReset() {
    showConfirm({
      title: "Reset to the default Bro Split?",
      body: "This week’s plan is replaced with the default Bro Split. Training history, overload comparisons and last logged weights are kept. You’ll pick 4 or 5 training days next.",
      confirm: "Reset",
      danger: true,
      onConfirm: () => {
        closeSheet();
        openDaysSetup("reset-program");
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
        view = returnView || "home";
        if (view === "program-week" && programWeek == null) view = "program";
        activeWorkoutId = null;
        editing = null;
        stopRest(true);
        render();
      },
    });
  }

  /* Swipe helpers */
  function bindSwipe(selector, onOpen) {
    /* v20: the row shrinks from the right (margin) instead of sliding left, so the
       title never slides out of view, and taps on Delete are never eaten by the row. */
    contentEl().querySelectorAll(selector).forEach((row) => {
      let startX = 0, startY = 0, dx = 0, tracking = false, decided = false, horizontal = false, wasOpen = false;
      const front = row.querySelector(".swipe-front") || row;
      const closeOthers = () => contentEl().querySelectorAll(selector + ".open").forEach((r) => { if (r !== row) r.classList.remove("open"); });
      row.addEventListener("pointerdown", (e) => {
        if (e.button && e.button !== 0) return;
        delete row.dataset.swallow;
        if (e.target.closest(".swipe-actions")) { tracking = false; decided = false; return; }
        closeOthers();
        startX = e.clientX;
        startY = e.clientY;
        dx = 0;
        tracking = true;
        decided = false;
        horizontal = false;
        wasOpen = row.classList.contains("open");
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
            row.classList.add("dragging");
            closeOthers();
            try { row.setPointerCapture(e.pointerId); } catch (err) {}
          } else {
            tracking = false;
            front.style.transition = "";
            return;
          }
        }
        if (!horizontal) return;
        dx = Math.min(0, x + (wasOpen ? -92 : 0));
        if (dx < -120) dx = -120;
        front.style.marginRight = `${-dx}px`;
        e.preventDefault();
      });
      function end() {
        if (!tracking && !decided) return;
        const tap = tracking && !decided;
        tracking = false;
        row.classList.remove("dragging");
        front.style.transition = "";
        front.style.marginRight = "";
        if (tap) {
          /* A tap on an open row just closes it; the click is swallowed below. */
          if (wasOpen) { row.classList.remove("open"); row.dataset.swallow = "1"; }
          return;
        }
        if (horizontal && dx < -56) {
          if (onOpen) onOpen(row);
          else row.classList.add("open");
        } else {
          row.classList.remove("open");
        }
        row.dataset.swallow = "1"; /* a swipe is never a tap on the tile */
      }
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
      row.addEventListener("click", (e) => {
        if (e.target.closest(".swipe-actions")) return;
        if (row.dataset.swallow) {
          delete row.dataset.swallow;
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
    });
  }

  function bindSwipeWorkouts() {
    bindSwipe(".swipe-row[data-swipe=workout]");
    const root = contentEl();
    if (!root.dataset.swipeCloser) {
      root.dataset.swipeCloser = "1";
      root.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".swipe-row.open")) return;
        root.querySelectorAll(".swipe-row.open").forEach((r) => r.classList.remove("open"));
      });
    }
  }

  function bindSwipeExercises() {
    if (workoutEditMode) return;
    contentEl().querySelectorAll("[data-ex-block]").forEach((block) => {
      let startX = 0, startY = 0, tracking = false, decided = false, horizontal = false, dx = 0;
      const card = block.querySelector(".card");
      block.addEventListener("pointerdown", (e) => {
        if (workoutEditMode) return;
        if (e.target.closest("input, textarea, button, a, [data-drag-handle]")) return;
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
      workoutEditMode = false;
      D().get().activeWorkoutId = null;
      D().saveNow();
      activeWorkoutId = null;
      reviewWorkout = null;
      stopRest(true);
      view = returnView || "home";
      if (view === "program-week" && programWeek == null) view = "program";
      if (view === "home") tab = "home";
      render();
      return;
    }
    if (action === "switch-tab") { switchTab(btn.dataset.tab); return; }
    if (action === "home-move") { moveHomeBlock(btn.dataset.id, Number(btn.dataset.dir)); return; }

    if (action === "food-back") { view = "home"; tab = "home"; render(); contentEl().scrollTop = 0; return; }
    if (action === "open-week") {
      programWeek = Number(btn.dataset.week) || 1;
      view = "program-week";
      tab = "program";
      render();
      contentEl().scrollTop = 0;
      return;
    }
    if (action === "program-back") {
      programWeek = null;
      view = "program";
      tab = "program";
      render();
      return;
    }
    if (action === "reset-cycle") { requestProgramReset(); return; }
    if (action === "open-review") {
      reviewWorkout = D().workoutFromSession(btn.dataset.session);
      returnView = "program-week";
      tab = "program";
      view = "review";
      render();
      contentEl().scrollTop = 0;
      return;
    }
    if (action === "open-progress-ex") {
      historyKey = btn.dataset.key;
      historyExIndex = null;
      historyEditMode = false;
      historySessionId = null;
      paintHistory();
      return;
    }
    if (action === "settings") { openSettings(); return; }
    if (action === "change-days") { closeSheet(); openDaysSetup("settings"); return; }
    if (action === "choose-program") { closeSheet(); openProgramPicker(); return; }
    if (action === "select-program") { selectProgram(btn.dataset.program); return; }
    if (action === "log-weight") { openLogWeight(); return; }
    if (action === "save-log-weight") { commitLogWeight(); return; }
    if (action === "weight-history") { openWeightHistory(); return; }
    if (action === "toggle-weight-history-edit") { weightHistoryEditMode = !weightHistoryEditMode; paintWeightHistory(); return; }
    if (action === "edit-weight-entry") { openEditWeight(btn.dataset.id); return; }
    if (action === "delete-weight-entry") { requestDeleteWeight(btn.dataset.id); return; }
    if (action === "weight-range") {
      D().setWeightChartRange(btn.dataset.range);
      refreshWeightCard();
      return;
    }
    if (action === "open-checkin") { openCheckIn(); return; }
    if (action === "save-checkin") { commitCheckIn(); return; }
    if (action === "open-pbs") { openPersonalBests(); return; }
    if (action === "cycle-recover") {
      closeSheet();
      D().startRecoveryWeek();
      view = tab === "program" ? "program" : "home";
      activeWorkoutId = null;
      editing = null;
      workoutEditMode = false;
      stopRest(true);
      render();
      return;
    }
    if (action === "choose-days") { chooseDays(btn.dataset.days); return; }
    if (action === "setup-back") { cancelDaysSetup(); return; }
    if (action === "cycle-continue") { closeSheet(); goToNextWeek(); return; }
    if (action === "cycle-reset") { requestCycleReset(); return; }
    if (action === "demo") { openDemo(exIndex); return; }
    if (action === "close-sheet") {
      historyEditMode = false;
      closeSheet();
      D().saveNow();
      if (view === "checkin" && !overlaysEl().querySelector(".sheet, .dialog")) {
        tab = "home";
        view = "home";
        persistTab();
        render();
      }
      return;
    }
    if (action === "open-workout") {
      activeWorkoutId = btn.dataset.id;
      D().get().activeWorkoutId = activeWorkoutId;
      D().startTimer(activeWorkoutId);
      D().saveNow();
      returnView = (view === "program-week") ? "program-week" : "home";
      tab = returnView === "home" ? "home" : "program";
      view = "workout";
      editing = null;
      workoutEditMode = false;
      reviewWorkout = null;
      render();
      /* A workout always opens at its first exercise, even from a scrolled Home. */
      contentEl().scrollTop = 0;
      return;
    }
    if (action === "reset-timer") {
      const id = activeWorkoutId;
      if (!id) return;
      showConfirm({
        title: "Reset timer?",
        body: "The session timer goes back to 0:00. Your logged sets are kept.",
        confirm: "Reset",
        danger: true,
        onConfirm: () => { D().resetTimer(id); renderHeader(); },
      });
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
    if (action === "history") { historyEditMode = false; historySessionId = null; historyKey = null; openHistory(exIndex); return; }
    if (action === "toggle-history-edit") { historyEditMode = !historyEditMode; paintHistory(); return; }
    if (action === "toggle-hist-menu") {
      const menuId = btn.dataset.menu;
      const menu = overlaysEl().querySelector(`[data-testid="hist-menu-panel-${menuId}"]`);
      const willOpen = menu && menu.classList.contains("hidden");
      closeHistMenus();
      if (willOpen && menu) {
        menu.classList.remove("hidden");
        btn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (action === "history-back") { paintHistory(); return; }
    if (action === "open-hist-session") { openHistorySession(btn.dataset.session); return; }
    if (action === "delete-hist-set") { requestDeleteHistorySet(btn.dataset.key, btn.dataset.session, Number(btn.dataset.set)); return; }
    if (action === "delete-hist-exercise") { requestDeleteHistoryExercise(btn.dataset.key, btn.dataset.session); return; }
    if (action === "delete-hist-session") { requestDeleteHistorySession(btn.dataset.session); return; }
    if (action === "edit-hist-set") { openEditHistorySet(btn.dataset.key, btn.dataset.session, Number(btn.dataset.set)); return; }
    if (action === "save-hist-set") { saveEditedHistorySet(btn.dataset.key, btn.dataset.session, Number(btn.dataset.set)); return; }
    if (action === "notes") { openNotes(exIndex); return; }
    if (action === "alt") { openAlt(exIndex); return; }
    if (action === "add-exercise") { openLibraryPicker({ mode: "add" }); return; }
    if (action === "toggle-edit") { workoutEditMode = !workoutEditMode; render(); return; }
    if (action === "ex-menu") { openExMenu(exIndex); return; }
    if (action === "remove-exercise") { requestRemoveExercise(exIndex); return; }
    if (action === "pick-library") {
      const name = btn.dataset.name;
      if (name) applyLibraryPick(name);
      return;
    }
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
      const name = ((overlaysEl().querySelector("[data-custom-alt]") || {}).value || "").trim();
      if (!name) return;
      if (pickerState && pickerState.mode === "add") applyLibraryPick(name);
      else applyAlt(exIndex, name);
      return;
    }
    if (action === "skip-rest") { stopRest(true); return; }
    if (action === "add-rest") {
      if (restTimer) {
        restTimer.endsAt += 15000;
        restTimer.total += 15;
        saveRest();
        tickRest();
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
    if (input.closest(".sheet.tracking")) {
      const held = lockedScroll;
      requestAnimationFrame(() => {
        if (held != null) contentEl().scrollTop = held;
        try { window.scrollTo(0, 0); } catch (err) {}
        pinTrackingToViewport();
      });
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
    if (s.daysPerWeek == null) {
      view = "days-setup";
      daysSetupSource = "first";
    } else if (s.activeWorkoutId && D().workoutById(s.activeWorkoutId)) {
      activeWorkoutId = s.activeWorkoutId;
      view = "workout";
      const w = D().workoutById(activeWorkoutId);
      if (w && !w.completedAt) D().startTimer(activeWorkoutId);
    }
    if (view !== "days-setup" && view !== "workout") {
      const saved = s.uiTab;
      if (saved && ["home", "program", "progress", "checkin", "settings"].includes(saved)) {
        tab = saved;
        view = saved;
      }
    } else if (view === "workout") {
      tab = "home";
      returnView = "home";
    }
    setInterval(patchTimer, 1000);
    ensureOverlayHost();
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", (e) => {
      onFocusIn(e);
      setTimeout(updateKeyboard, 50);
    }, true);
    document.addEventListener("focusout", () => {
      D().saveNow();
      setTimeout(updateKeyboard, 80);
    }, true);
    document.addEventListener("keydown", onKeydown);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateKeyboard);
      window.visualViewport.addEventListener("scroll", updateKeyboard);
    }
    window.addEventListener("resize", updateKeyboard);
    /* Block pinch-zoom like a native iPhone app. */
    ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
      document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
    });
    document.addEventListener("touchmove", (event) => {
      if (event.touches && event.touches.length > 1) event.preventDefault();
    }, { passive: false });
    syncShellViewport();
    window.addEventListener("resize", syncShellViewport);
    window.addEventListener("orientationchange", syncShellViewport);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncShellViewport);
      window.visualViewport.addEventListener("scroll", syncShellViewport);
    }
    render();
    resumeRest();
    const flush = () => D().saveNow();
    window.addEventListener("pagehide", flush);
    const wake = () => { patchTimer(); resumeRest(); };
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
      else {
        syncShellViewport();
        patchTimer();
        resumeRest();
        /* v20: refresh counts when the app comes back to the front. */
        if (view === "home" || view === "program" || view === "program-week" || view === "progress") render();
      }
    });
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      const watch = (reg) => {
        if (!reg) return;
        const ping = () => { try { reg.update(); } catch (e) {} };
        ping();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") ping();
        });
      };
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then(watch).catch(() => {});
      });
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration().then(watch).catch(() => {});
      }
    }
  }

  function openFood() {
    closeSheet();
    view = "food";
    tab = "home";
    render();
    contentEl().scrollTop = 0;
  }

  window.VELA_APP = {
    render,
    openFood,
    showSheet,
    closeSheet,
    showToast,
    showConfirm,
    get view() { return view; },
    get tab() { return tab; },
    version: VELA_VERSION,
    cache: VELA_CACHE,
    pinTrackingToViewport,
    applyTrackingViewport,
    syncShellViewport,
    isStandalonePwa,
  };
  init();
})();
