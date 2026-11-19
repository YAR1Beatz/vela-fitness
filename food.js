/* VELA food tracker (v26 draft). Data lives in its own localStorage key
   ("vela-food-v1") so the training data in "vela-fitness-v1" is never touched.
   Food search and barcode lookup use the free Open Food Facts API (ODbL). */
(function () {
  const KEY = "vela-food-v1";
  const OFF = "https://world.openfoodfacts.org";
  const OFF_FIELDS = "code,product_name,product_name_da,product_name_en,brands,nutriments,serving_size,serving_quantity";
  const MEALS = [
    { id: "breakfast", label: "Breakfast" },
    { id: "lunch", label: "Lunch" },
    { id: "dinner", label: "Dinner" },
    { id: "snacks", label: "Snacks" },
  ];
  const D = () => window.VELA_DATA;
  const C = () => window.VELA_CATALOG;
  const A = () => window.VELA_APP;

  /* ---------- state ---------- */
  let state = null;
  function blank() {
    return { version: 1, targets: null, days: {}, foods: {}, recents: [], favourites: [], searchCache: {}, meals: [] };
  }
  function load() {
    if (state) return state;
    try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { state = null; }
    if (!state || typeof state !== "object") state = blank();
    const b = blank();
    Object.keys(b).forEach((k) => { if (state[k] == null) state[k] = b[k]; });
    /* v30 repair: entries made with "Copy yesterday" before v30 were saved without an id,
       so Delete / Edit couldn't find them. Give every entry an id (nothing else changes). */
    let repaired = 0;
    Object.values(state.days || {}).forEach((d) => {
      if (!d || typeof d !== "object") return;
      Object.values(d).forEach((list) => {
        if (!Array.isArray(list)) return;
        list.forEach((it) => { if (it && typeof it === "object" && !it.id) { it.id = uid("it"); repaired++; } });
      });
    });
    if (repaired) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full */ } }
    return state;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) { /* storage full */ }
  }
  function reset() { state = null; return load(); }
  const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  /* ---------- numbers ---------- */
  const r0 = (n) => Math.round(Number(n) || 0);
  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
  function fmt(n, dec) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const v = dec === 0 ? r0(n) : r1(n);
    return C().formatNumber(v);
  }
  const fmtG = (n) => `${fmt(n, Math.abs(n) >= 10 ? 0 : 1)} g`;
  const num = (t) => C().parseNum(t);

  /* ---------- dates ---------- */
  const today = () => D().copenhagenYMD();
  function addDays(ymd, n) {
    const d = new Date(`${ymd}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dayLabel(ymd) {
    const t = today();
    const d = new Date(`${ymd}T12:00:00`);
    const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    if (ymd === t) return { top: "Today", sub: date };
    if (ymd === addDays(t, -1)) return { top: "Yesterday", sub: date };
    return { top: d.toLocaleDateString("en-GB", { weekday: "long" }), sub: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) };
  }

  /* ---------- foods ---------- */
  function per100FromOff(p) {
    const n = p.nutriments || {};
    let kcal = n["energy-kcal_100g"];
    if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184;
    if (kcal == null && n["energy-kj_100g"] != null) kcal = n["energy-kj_100g"] / 4.184;
    return { kcal: Number(kcal), p: Number(n.proteins_100g || 0), c: Number(n.carbohydrates_100g || 0), f: Number(n.fat_100g || 0) };
  }
  function foodFromOff(p) {
    if (!p) return null;
    const per100 = per100FromOff(p);
    if (!Number.isFinite(per100.kcal)) return null;
    const name = (p.product_name_da || p.product_name || p.product_name_en || "").trim();
    if (!name) return null;
    const sq = Number(p.serving_quantity);
    return {
      id: `off-${p.code}`,
      code: String(p.code || ""),
      name,
      brand: String(p.brands || "").split(",")[0].trim(),
      per100,
      serving: sq > 0 ? { g: sq, label: String(p.serving_size || `${sq} g`) } : null,
      source: "off",
    };
  }
  function rememberFood(food) {
    const s = load();
    s.foods[food.id] = Object.assign({}, s.foods[food.id] || {}, food);
    return s.foods[food.id];
  }
  function getFood(id) { return load().foods[id] || null; }
  function customFoods() {
    return Object.values(load().foods).filter((f) => f.source === "custom" && !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
  }
  function saveCustomFood(input) {
    const id = input.id || uid("my");
    const basis = input.basis === "serving" ? "serving" : "100g";
    let per100, serving = null;
    if (basis === "serving") {
      const g = Number(input.servingG) || 0;
      serving = { g: g || null, label: input.servingLabel || "1 serving" };
      if (g > 0) {
        const k = 100 / g;
        per100 = { kcal: input.kcal * k, p: input.p * k, c: input.c * k, f: input.f * k };
      } else {
        per100 = null;
      }
    } else {
      per100 = { kcal: input.kcal, p: input.p, c: input.c, f: input.f };
      if (Number(input.servingG) > 0) serving = { g: Number(input.servingG), label: input.servingLabel || `${input.servingG} g` };
    }
    const food = { id, name: input.name, brand: "My food", basis, per100, perServing: basis === "serving" ? { kcal: input.kcal, p: input.p, c: input.c, f: input.f } : null, serving, source: "custom" };
    load().foods[id] = food;
    save();
    return food;
  }
  function deleteCustomFood(id) {
    const f = getFood(id);
    if (!f) return;
    f.deleted = true; /* kept so logged items still show their name */
    const s = load();
    s.favourites = s.favourites.filter((x) => x !== id);
    s.recents = s.recents.filter((x) => x !== id);
    save();
  }
  function toggleFavourite(id) {
    const s = load();
    const i = s.favourites.indexOf(id);
    if (i >= 0) s.favourites.splice(i, 1); else s.favourites.unshift(id);
    save();
    return i < 0;
  }
  const isFav = (id) => load().favourites.includes(id);

  /* amount -> macros */
  function macrosFor(food, amount, unit) {
    const a = Number(amount) || 0;
    if (unit === "serving") {
      if (food.perServing) return scale(food.perServing, a);
      const g = food.serving && food.serving.g;
      if (g && food.per100) return scale(food.per100, (a * g) / 100);
      return { kcal: 0, p: 0, c: 0, f: 0 };
    }
    return food.per100 ? scale(food.per100, a / 100) : { kcal: 0, p: 0, c: 0, f: 0 };
  }
  function scale(m, k) { return { kcal: m.kcal * k, p: m.p * k, c: m.c * k, f: m.f * k }; }

  /* ---------- days / items ---------- */
  function day(ymd, create) {
    const s = load();
    if (!s.days[ymd] && create) s.days[ymd] = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    return s.days[ymd] || { breakfast: [], lunch: [], dinner: [], snacks: [] };
  }
  function addItem(ymd, meal, item) {
    const d = day(ymd, true);
    const it = Object.assign({ ts: Date.now() }, item);
    if (!it.id) it.id = uid("it"); /* an explicit id: undefined must not wipe the new id */
    d[meal].push(it);
    if (it.foodId) {
      const s = load();
      s.recents = [it.foodId].concat(s.recents.filter((x) => x !== it.foodId)).slice(0, 40);
    }
    save();
    return it;
  }
  function logFood(ymd, meal, food, amount, unit) {
    rememberFood(food);
    const m = macrosFor(food, amount, unit);
    return addItem(ymd, meal, { foodId: food.id, name: food.name, brand: food.brand || "", amount: Number(amount), unit, kcal: m.kcal, p: m.p, c: m.c, f: m.f });
  }
  function updateItem(ymd, meal, id, amount, unit) {
    const it = day(ymd)[meal].find((x) => x.id === id);
    if (!it) return;
    const food = it.foodId && getFood(it.foodId);
    if (food) {
      const m = macrosFor(food, amount, unit);
      Object.assign(it, { amount: Number(amount), unit, kcal: m.kcal, p: m.p, c: m.c, f: m.f });
    }
    save();
  }
  function updateQuick(ymd, meal, id, vals) {
    const it = day(ymd)[meal].find((x) => x.id === id);
    if (it) Object.assign(it, vals);
    save();
  }
  function removeItem(ymd, meal, id) {
    const d = day(ymd);
    const i = d[meal].findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [it] = d[meal].splice(i, 1);
    save();
    return { ymd, meal, index: i, item: it };
  }
  function restoreItem(snap) {
    if (!snap) return;
    day(snap.ymd, true)[snap.meal].splice(snap.index, 0, snap.item);
    save();
  }
  function copyMeal(fromYmd, toYmd, meal) {
    const src = day(fromYmd)[meal] || [];
    src.forEach((it) => { const copy = Object.assign({}, it, { ts: Date.now() }); delete copy.id; addItem(toYmd, meal, copy); });
    return src.length;
  }
  /* ---------- saved meals (v27) ---------- */
  function itemAt(it, amount) {
    /* Recompute an item for a new amount: from its food when known, else proportionally. */
    const a = Number(amount) || 0;
    const food = it.foodId && getFood(it.foodId);
    if (!it.quick && food) {
      const m = macrosFor(food, a, it.unit);
      return Object.assign({}, it, { amount: a, kcal: m.kcal, p: m.p, c: m.c, f: m.f });
    }
    if (it.quick || !(it.amount > 0)) return Object.assign({}, it);
    const k = a / it.amount;
    return Object.assign({}, it, { amount: a, kcal: it.kcal * k, p: it.p * k, c: it.c * k, f: it.f * k });
  }
  const strip = (it) => ({ foodId: it.foodId || null, name: it.name, brand: it.brand || "", amount: it.amount, unit: it.unit, kcal: it.kcal, p: it.p, c: it.c, f: it.f, quick: !!it.quick });
  function savedMeals() { return load().meals || (load().meals = []); }
  function getMeal(id) { return savedMeals().find((m) => m.id === id) || null; }
  function suggestMealName(slot) {
    const lbl = (MEALS.find((m) => m.id === slot) || MEALS[0]).label;
    const names = new Set(savedMeals().map((m) => m.name.toLowerCase()));
    let n = 1;
    while (names.has(`${lbl} ${n}`.toLowerCase())) n += 1;
    return `${lbl} ${n}`;
  }
  function saveMealFromDay(ymd, slot, name) {
    const items = (day(ymd)[slot] || []).map(strip);
    if (!items.length) return null;
    const meal = { id: uid("meal"), name: String(name).trim() || suggestMealName(slot), slot, items, createdAt: Date.now() };
    savedMeals().unshift(meal);
    save();
    return meal;
  }
  function updateMeal(id, patch) {
    const m = getMeal(id);
    if (!m) return null;
    if (patch.name != null) m.name = String(patch.name).trim() || m.name;
    if (patch.items) m.items = patch.items.map(strip);
    m.updatedAt = Date.now();
    save();
    return m;
  }
  function deleteMeal(id) {
    const list = savedMeals();
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) return null;
    const [m] = list.splice(i, 1);
    save();
    return { index: i, meal: m };
  }
  function restoreMeal(snap) { if (snap) { savedMeals().splice(snap.index, 0, snap.meal); save(); } }
  function addMealItems(ymd, slot, items) {
    items.forEach((it) => addItem(ymd, slot, Object.assign(strip(it), { fromMeal: true })));
    return items.length;
  }

  function totals(items) {
    return items.reduce((t, it) => ({ kcal: t.kcal + (it.kcal || 0), p: t.p + (it.p || 0), c: t.c + (it.c || 0), f: t.f + (it.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
  }
  function dayTotals(ymd) {
    const d = day(ymd);
    return totals(MEALS.flatMap((m) => d[m.id] || []));
  }

  /* ---------- targets ---------- */
  function latestWeight() {
    try {
      const s = D().bodyWeightSeries();
      return s && s.current ? Number(s.current.weight) : null;
    } catch (e) { return null; }
  }
  function suggestTargets(w) {
    const kg = w || latestWeight();
    if (!kg) return { kcal: 2500, p: 160, c: 280, f: 80, basis: null };
    const kcal = Math.round((kg * 33) / 50) * 50; /* rough maintenance for a lifter */
    const p = Math.round(kg * 2);
    const f = Math.round(kg * 0.9);
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { kcal, p, c, f, basis: kg };
  }
  function targets() { return load().targets || Object.assign(suggestTargets(), { suggested: true }); }
  function setTargets(t) { load().targets = { kcal: r0(t.kcal), p: r0(t.p), c: r0(t.c), f: r0(t.f) }; save(); }

  /* ---------- Open Food Facts ---------- */
  let fetchImpl = (url) => fetch(url, { headers: { Accept: "application/json" } });
  async function searchOff(term) {
    const q = encodeURIComponent(term.trim());
    const url = `${OFF}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=25&cc=dk&lc=da&fields=${OFF_FIELDS}&app_name=VELA`;
    let res = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await fetchImpl(url);
        if (res.ok) break;
      } catch (e) { res = null; }
      /* OFF search is rate-limited and sometimes answers 503 without CORS headers. */
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!res || !res.ok) throw new Error(res ? `HTTP ${res.status}` : "network");
    const data = await res.json();
    const foods = (data.products || []).map(foodFromOff).filter(Boolean);
    const s = load();
    foods.forEach((f) => { if (!s.foods[f.id] || s.foods[f.id].source === "off") s.foods[f.id] = Object.assign({}, s.foods[f.id] || {}, f); });
    s.searchCache[term.trim().toLowerCase()] = { ts: Date.now(), ids: foods.map((f) => f.id) };
    const keys = Object.keys(s.searchCache);
    if (keys.length > 30) keys.sort((a, b) => s.searchCache[a].ts - s.searchCache[b].ts).slice(0, keys.length - 30).forEach((k) => delete s.searchCache[k]);
    save();
    return foods;
  }
  function cachedSearch(term) {
    const hit = load().searchCache[term.trim().toLowerCase()];
    if (hit) return hit.ids.map(getFood).filter(Boolean);
    const t = term.trim().toLowerCase();
    return Object.values(load().foods).filter((f) => !f.deleted && (`${f.name} ${f.brand || ""}`).toLowerCase().includes(t)).slice(0, 25);
  }
  async function lookupBarcode(code) {
    const clean = String(code).replace(/\D/g, "");
    const known = Object.values(load().foods).find((f) => f.code === clean);
    if (known) return known;
    const res = await fetchImpl(`${OFF}/api/v2/product/${clean}.json?fields=${OFF_FIELDS}&app_name=VELA`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.status === 0 || !data.product) return null;
    const food = foodFromOff(Object.assign({ code: clean }, data.product));
    if (food) { rememberFood(food); save(); }
    return food;
  }

  /* ---------- UI state ---------- */
  let curDay = null;
  let editMode = false;
  let addCtx = null; /* { meal, tab, term, results, status } */
  let chartRange = 7;
  let mealsEdit = false;
  let scanStop = null;
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ICON = {
    trash: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 4.2h9.6M6.2 4.2V3h3.6v1.2M4.4 4.2 5 13h6l.6-8.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    left: `<svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M13.5 5.5 7.5 11l6 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    right: `<svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M8.5 5.5 14.5 11l-6 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    cal: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    plus: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    scan: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.5 8.5v7M10 8.5v7M12.5 8.5v7M15 8.5v7M17 8.5v7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    star: (on) => `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.5l-5.1 2.8L8 13.6l-4.3-4 5.8-.7z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    bolt: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    more: `<svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="5.5" cy="11" r="1.6" fill="currentColor"/><circle cx="11" cy="11" r="1.6" fill="currentColor"/><circle cx="16.5" cy="11" r="1.6" fill="currentColor"/></svg>`,
    bowl: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 7.5c0-1.4 1-2 1-3.5M13 7.5c0-1.4 1-2 1-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    save: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3.8h12a1 1 0 0 1 1 1v15.4l-7-4.4-7 4.4V4.8a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    food: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16.5 21V3c-2 1-3.5 3.5-3.5 7v3h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  function ring(eaten, target, size) {
    const sz = size || 112, sw = 10, r = (sz - sw) / 2, c = 2 * Math.PI * r;
    const pct = target > 0 ? Math.min(1, eaten / target) : 0;
    const over = target > 0 && eaten > target;
    return `<svg class="food-ring${over ? " over" : ""}" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" aria-hidden="true">
      <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="var(--bar-track)" stroke-width="${sw}"/>
      <circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="${over ? "#F2B84B" : "var(--accent)"}" stroke-width="${sw}" stroke-linecap="round"
        stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${sz / 2} ${sz / 2})"/>
    </svg>`;
  }
  function macroBars(t, tg) {
    const bar = (lbl, v, goal, cls) => {
      const pct = goal > 0 ? Math.min(100, (v / goal) * 100) : 0;
      return `<div class="mbar ${cls}" data-testid="macro-${cls}">
        <div class="mbar-top"><span>${lbl}</span><b>${fmt(v, 0)}<i>/${fmt(goal, 0)} g</i></b></div>
        <div class="mbar-track"><i style="width:${pct.toFixed(1)}%"></i></div>
      </div>`;
    };
    return `<div class="mbars">${bar("Protein", t.p, tg.p, "p")}${bar("Carbs", t.c, tg.c, "c")}${bar("Fat", t.f, tg.f, "f")}</div>`;
  }
  function summaryInner(ymd, size) {
    const t = dayTotals(ymd);
    const tg = targets();
    const left = tg.kcal - t.kcal;
    return `<div class="food-sum">
        <div class="food-ring-wrap">${ring(t.kcal, tg.kcal, size)}
          <div class="food-ring-txt"><b data-testid="food-kcal-eaten">${fmt(t.kcal, 0)}</b><span>of ${fmt(tg.kcal, 0)} kcal</span></div>
        </div>
        <div class="food-sum-side">
          <div class="food-left${left < 0 ? " over" : ""}" data-testid="food-kcal-left"><b>${fmt(Math.abs(left), 0)}</b><span>${left < 0 ? "kcal over" : "kcal left"}</span></div>
          ${macroBars(t, tg)}
        </div>
      </div>`;
  }

  function homeCardHtml() {
    const ymd = today();
    const tg = targets();
    return `<section class="dash-card food-card" data-testid="food-card">
      <div class="weight-head">
        <h2>Today’s food</h2>
        <button type="button" class="weight-log" data-food="open" data-testid="food-card-open">${ICON.plus} Log food</button>
      </div>
      <button type="button" class="food-card-body" data-food="open" aria-label="Open food diary">${summaryInner(ymd, 104)}</button>
      ${tg.suggested ? `<p class="food-hint">Targets are a suggestion from your body weight. Tap to adjust.</p>` : ""}
    </section>`;
  }

  /* ---------- Food page ---------- */
  function renderPage(root) {
    if (!curDay) curDay = today();
    const ymd = curDay;
    const lbl = dayLabel(ymd);
    const d = day(ymd);
    const yesterday = addDays(ymd, -1);
    const yd = day(yesterday);
    const meals = MEALS.map((m) => {
      const items = d[m.id] || [];
      const t = totals(items);
      const rows = items.map((it) => {
        const amt = it.quick ? "Quick add" : it.unit === "serving" ? `${fmt(it.amount)} serving${it.amount === 1 ? "" : "s"}` : `${fmt(it.amount, 0)} g`;
        return `<div class="swipe-row food-swipe" data-food-swipe data-meal="${m.id}" data-id="${esc(it.id)}">
          <button type="button" class="swipe-actions" data-food="del-item" data-meal="${m.id}" data-id="${esc(it.id)}" data-testid="food-swipe-delete">${ICON.trash} Delete</button>
          <div class="swipe-front">
            <div class="food-item" data-testid="food-item">
              <button type="button" class="food-item-main" data-food="edit-item" data-meal="${m.id}" data-id="${esc(it.id)}">
                <span class="fi-name">${esc(it.name || "Quick add")}</span>
                <span class="fi-meta">${esc(amt)}${it.brand ? " · " + esc(it.brand) : ""} · P ${fmt(it.p, 0)} · C ${fmt(it.c, 0)} · F ${fmt(it.f, 0)}</span>
              </button>
              ${editMode ? `<div class="fi-edit">
                  <button type="button" class="fi-btn" data-food="edit-item" data-meal="${m.id}" data-id="${esc(it.id)}" data-testid="food-item-edit">Edit</button>
                  <button type="button" class="fi-btn danger" data-food="del-item" data-meal="${m.id}" data-id="${esc(it.id)}" data-testid="food-item-delete">Delete</button>
                </div>` : `<span class="fi-kcal">${fmt(it.kcal, 0)}</span>`}
            </div>
          </div>
        </div>`;
      }).join("");
      const canCopy = (yd[m.id] || []).length > 0;
      return `<section class="meal-card" data-testid="meal-${m.id}">
        <div class="meal-head">
          <h3>${m.label}</h3>
          <span class="meal-kcal" data-testid="meal-kcal-${m.id}">${fmt(t.kcal, 0)} kcal</span>
          ${items.length ? `<button type="button" class="meal-more" data-food="meal-menu" data-meal="${m.id}" aria-label="${m.label} options" data-testid="meal-menu-${m.id}">${ICON.more}</button>` : ""}
        </div>
        ${rows ? `<div class="meal-items">${rows}</div>` : ""}
        <div class="meal-actions">
          <button type="button" class="add" data-food="add" data-meal="${m.id}" data-testid="add-food-${m.id}">${ICON.plus} Add food</button>
          ${canCopy && !(d[m.id] || []).length ? `<button type="button" class="meal-copy" data-food="copy" data-meal="${m.id}" data-testid="copy-${m.id}">Copy ${ymd === today() ? "yesterday" : "previous day"}</button>` : ""}
        </div>
      </section>`;
    }).join("");
    const anyItems = MEALS.some((m) => (d[m.id] || []).length);
    root.innerHTML = `<div class="food-page" data-testid="food-page">
      <div class="day-bar" data-testid="day-bar">
        <button type="button" class="day-arrow" data-food="prev-day" aria-label="Previous day" data-testid="prev-day">${ICON.left}</button>
        <label class="day-pick">
          <span class="day-top" data-testid="day-label">${esc(lbl.top)}</span>
          <span class="day-sub">${ICON.cal}${esc(lbl.sub)}</span>
          <input type="date" data-food-date value="${ymd}" max="${today()}" aria-label="Pick a day" data-testid="day-input">
        </label>
        <button type="button" class="day-arrow" data-food="next-day" aria-label="Next day" data-testid="next-day"${ymd >= today() ? " disabled" : ""}>${ICON.right}</button>
      </div>
      <section class="dash-card food-sum-card">
        <div class="weight-head"><h2>Calories</h2><button type="button" class="weight-hist-btn" data-food="targets" data-testid="food-targets">Targets</button></div>
        ${summaryInner(ymd, 116)}
      </section>
      <div class="food-tools">
        <span class="food-tools-lbl">Meals</span>
        ${anyItems ? `<button type="button" class="weight-hist-btn${editMode ? " on" : ""}" data-food="toggle-edit" data-testid="food-edit-toggle">${editMode ? "Done" : "Edit"}</button>` : ""}
      </div>
      ${meals}
      <p class="food-credit">Food data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL).</p>
    </div>`;
    bindSwipes(root);
    bindDaySwipe(root);
  }

  function setDay(ymd) {
    if (ymd > today()) ymd = today();
    curDay = ymd;
    editMode = false;
    A().render();
  }

  function bindDaySwipe(root) {
    const bar = root.querySelector("[data-testid=day-bar]");
    const sum = root.querySelector(".food-sum-card");
    [bar, sum].forEach((el) => {
      if (!el) return;
      let x0 = null, y0 = null;
      el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener("touchend", (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setDay(addDays(curDay, dx > 0 ? -1 : 1));
      });
    });
    const inp = root.querySelector("[data-food-date]");
    if (inp) inp.addEventListener("change", () => { if (inp.value) setDay(inp.value); });
  }

  /* iOS-style swipe: drag a row left to reveal a red Delete button (it stays open; tap it
     to delete). A long swipe past ~60% of the row deletes straight away. Touch events with
     a direction lock, so vertical scrolling is never hijacked; mouse uses pointer events. */
  const SWIPE_OPEN = 88;
  function closeSwipeRows(except) {
    document.querySelectorAll(".food-swipe[data-food-swipe].open").forEach((r) => {
      if (r === except) return;
      r.classList.remove("open");
      const f = r.querySelector(".swipe-front");
      if (f) { f.style.transition = ""; f.style.transform = ""; }
    });
  }
  function bindSwipes(root) {
    root.querySelectorAll("[data-food-swipe]").forEach((row) => {
      const front = row.querySelector(".swipe-front");
      let g = null; /* gesture: { x0, y0, base, dx, lock } */
      const startAt = (x, y) => {
        if (editMode) return;
        closeSwipeRows(row);
        g = { x0: x, y0: y, base: row.classList.contains("open") ? -SWIPE_OPEN : 0, dx: 0, lock: null };
      };
      const moveTo = (x, y, e) => {
        if (!g) return;
        const mx = x - g.x0, my = y - g.y0;
        if (!g.lock) {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          g.lock = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
          if (g.lock === "y") { g = null; return; }
          row.classList.add("dragging");
          front.style.transition = "none";
        }
        if (e && e.cancelable) e.preventDefault(); /* horizontal: keep the page still */
        let pos = g.base + mx;
        if (pos > 0) pos = pos / 4; /* rubber band to the right */
        const full = row.offsetWidth;
        if (pos < -full) pos = -full;
        g.dx = pos;
        front.style.transform = `translateX(${pos}px)`;
      };
      const finish = () => {
        if (!g) return;
        const st = g; g = null;
        if (!st.lock) return; /* a plain tap: let the click through */
        row.dataset.swiped = String(Date.now());
        front.style.transition = "";
        const full = row.offsetWidth;
        if (st.dx < -full * 0.6) {
          front.style.transform = `translateX(${-full}px)`;
          setTimeout(() => deleteItem(row.dataset.meal, row.dataset.id), 160);
          return;
        }
        row.classList.remove("dragging");
        if (st.dx < -SWIPE_OPEN / 2) { row.classList.add("open"); front.style.transform = `translateX(${-SWIPE_OPEN}px)`; }
        else { row.classList.remove("open"); front.style.transform = ""; }
      };
      row.addEventListener("touchstart", (e) => { if (e.touches.length === 1) startAt(e.touches[0].clientX, e.touches[0].clientY); else g = null; }, { passive: true });
      row.addEventListener("touchmove", (e) => { if (e.touches.length === 1) moveTo(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
      row.addEventListener("touchend", finish);
      row.addEventListener("touchcancel", () => { if (g) { g.dx = g.base; } finish(); });
      row.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") startAt(e.clientX, e.clientY); });
      row.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") moveTo(e.clientX, e.clientY, null); });
      row.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") finish(); });
      /* swallow the click that ends a swipe */
      row.addEventListener("click", (e) => {
        const t = Number(row.dataset.swiped || 0);
        if (t && Date.now() - t < 350 && !e.target.closest(".swipe-actions")) { e.stopPropagation(); e.preventDefault(); }
      }, true);
    });
    if (!document.documentElement.dataset.foodSwipeClose) {
      document.documentElement.dataset.foodSwipeClose = "1";
      document.addEventListener("touchstart", (e) => { if (!e.target.closest(".food-swipe.open")) closeSwipeRows(); }, { passive: true });
      document.addEventListener("mousedown", (e) => { if (!e.target.closest(".food-swipe.open")) closeSwipeRows(); });
    }
  }

  function deleteItem(meal, id) {
    const snap = removeItem(curDay, meal, id);
    if (!snap) return;
    A().render();
    A().showToast(`${snap.item.name || "Item"} removed`, "Undo", () => { restoreItem(snap); A().render(); });
  }

  /* ---------- Add food sheet ---------- */
  function openAdd(meal) {
    addCtx = { meal, tab: addCtx && addCtx.meal === meal ? addCtx.tab : "search", term: "", results: null, status: "" };
    paintAdd();
  }
  function listRow(f, action) {
    const per = f.basis === "serving" && f.perServing
      ? `${fmt(f.perServing.kcal, 0)} kcal / serving`
      : f.per100 ? `${fmt(f.per100.kcal, 0)} kcal / 100 g` : "";
    return `<button type="button" class="food-row" data-food="${action || "pick"}" data-id="${esc(f.id)}" data-testid="food-result">
      <span class="fr-main"><span class="fr-name">${esc(f.name)}</span><span class="fr-meta">${esc(f.brand || "")}${f.brand ? " · " : ""}${esc(per)}</span></span>
      ${isFav(f.id) ? `<span class="fr-star">${ICON.star(true)}</span>` : ""}
    </button>`;
  }
  function paintAdd() {
    const ctx = addCtx;
    const mealLbl = (MEALS.find((m) => m.id === ctx.meal) || MEALS[0]).label;
    const tabs = [["search", "Search"], ["meals", "Meals"], ["recent", "Recent"], ["fav", "Favourites"], ["mine", "My foods"]]
      .map(([id, l]) => `<button type="button" class="wrange${ctx.tab === id ? " on" : ""}" data-food="add-tab" data-tab="${id}" data-testid="add-tab-${id}">${l}</button>`).join("");
    let body = "";
    const s = load();
    if (ctx.tab === "search") {
      const res = ctx.results;
      body = `<form class="food-search" data-food-search>
          <input class="search-input" type="search" data-food-q placeholder="Search foods, e.g. skyr, havregryn" value="${esc(ctx.term)}" enterkeyhint="search" autocomplete="off" data-testid="food-search-input">
          <button type="submit" class="btn pri" data-testid="food-search-go">Search</button>
        </form>
        <div class="food-quick-row">
          <button type="button" class="food-chip" data-food="scan" data-testid="open-scan">${ICON.scan}Scan barcode</button>
          <button type="button" class="food-chip" data-food="quick" data-testid="open-quick">${ICON.bolt}Quick add</button>
          <button type="button" class="food-chip" data-food="new-food" data-testid="open-new-food">${ICON.plus}New food</button>
        </div>
        ${ctx.status ? `<p class="food-status" data-testid="food-status">${esc(ctx.status)}</p>` : ""}
        <div class="food-list" data-testid="food-results">${res ? (res.map((f) => listRow(f)).join("") || `<p class="empty">No foods found. Try another word or create your own food.</p>`) : `<p class="empty">Search Open Food Facts, scan a barcode, or pick from Recent.</p>`}</div>`;
    } else if (ctx.tab === "meals") {
      const list = savedMeals();
      const rows = list.map((m) => {
        const t = totals(m.items);
        return `<div class="swipe-row food-swipe meal-swipe" data-meal-swipe data-id="${esc(m.id)}">
          <button type="button" class="swipe-actions" data-food="meal-del" data-id="${esc(m.id)}">Delete</button>
          <div class="swipe-front">
            <div class="saved-meal" data-testid="saved-meal">
              <button type="button" class="saved-meal-main" data-food="meal-open" data-id="${esc(m.id)}">
                <span class="sm-ico">${ICON.bowl}</span>
                <span class="fr-main"><span class="fr-name">${esc(m.name)}</span>
                  <span class="fr-meta">${m.items.length} item${m.items.length === 1 ? "" : "s"} · <b>${fmt(t.kcal, 0)} kcal</b> · P ${fmt(t.p, 0)} · C ${fmt(t.c, 0)} · F ${fmt(t.f, 0)}</span></span>
              </button>
              ${mealsEdit ? `<div class="fi-edit">
                <button type="button" class="fi-btn" data-food="meal-edit" data-id="${esc(m.id)}" data-testid="saved-meal-edit">Edit</button>
                <button type="button" class="fi-btn danger" data-food="meal-del" data-id="${esc(m.id)}" data-testid="saved-meal-delete">Delete</button>
              </div>` : `<button type="button" class="sm-add" data-food="meal-open" data-id="${esc(m.id)}" aria-label="Add ${esc(m.name)}">${ICON.plus}</button>`}
            </div>
          </div>
        </div>`;
      }).join("");
      body = list.length
        ? `<div class="food-tools"><span class="food-tools-lbl">Saved meals</span><button type="button" class="weight-hist-btn${mealsEdit ? " on" : ""}" data-food="meals-edit" data-testid="saved-meals-edit-toggle">${mealsEdit ? "Done" : "Edit"}</button></div>
           <div class="food-list" data-testid="saved-meals">${rows}</div>`
        : `<p class="empty" data-testid="saved-meals-empty">No saved meals yet. On the Food page, tap ⋯ on a meal and choose “Save as meal”.</p>`;
    } else if (ctx.tab === "recent") {
      const list = s.recents.map(getFood).filter((f) => f && !f.deleted);
      body = `<div class="food-list">${list.map((f) => listRow(f)).join("") || `<p class="empty">Foods you log show up here for quick re-adding.</p>`}</div>`;
    } else if (ctx.tab === "fav") {
      const list = s.favourites.map(getFood).filter((f) => f && !f.deleted);
      body = `<div class="food-list">${list.map((f) => listRow(f)).join("") || `<p class="empty">Tap the star on a food to keep it here.</p>`}</div>`;
    } else {
      const list = customFoods();
      body = `<button type="button" class="add" data-food="new-food" data-testid="new-food">${ICON.plus} Create food</button>
        <div class="food-list">${list.map((f) => listRow(f)).join("") || `<p class="empty">Add your own foods with calories and macros per 100 g or per serving.</p>`}</div>`;
    }
    A().showSheet(`<div class="sheet food-sheet kb-safe tall" data-testid="add-food-sheet">
      <div class="tracking-head"><h2>Add to ${esc(mealLbl)}</h2><button type="button" class="tracking-close" data-food="close" data-testid="close-add-food">Done</button></div>
      <div class="weight-ranges food-tabs">${tabs}</div>
      <div class="sheet-body">${body}</div>
    </div>`, { top: true });
    bindMealSwipes();
    const form = document.querySelector("[data-food-search]");
    if (form) form.addEventListener("submit", (e) => { e.preventDefault(); runSearch(form.querySelector("[data-food-q]").value); });
  }
  async function runSearch(term) {
    term = String(term || "").trim();
    if (!term) return;
    addCtx.term = term;
    const cached = cachedSearch(term);
    if (navigator.onLine === false) {
      addCtx.results = cached;
      addCtx.status = "You’re offline. Search needs a connection — showing foods saved on this phone.";
      paintAdd();
      return;
    }
    addCtx.status = "Searching Open Food Facts…";
    addCtx.results = cached.length ? cached : null;
    paintAdd();
    try {
      const foods = await searchOff(term);
      if (!addCtx || addCtx.term !== term) return;
      addCtx.results = foods;
      addCtx.status = foods.length ? `${foods.length} result${foods.length === 1 ? "" : "s"} · values per 100 g` : "";
    } catch (e) {
      if (!addCtx) return;
      addCtx.results = cached;
      addCtx.status = "Open Food Facts search is busy or unreachable right now. Try again in a minute — showing foods saved on this phone.";
    }
    if (document.querySelector("[data-testid=add-food-sheet]")) paintAdd();
  }

  /* ---------- amount sheet ---------- */
  function openAmount(food, opts) {
    const o = opts || {};
    const hasServing = !!(food.perServing || (food.serving && food.serving.g));
    let unit = o.unit || (food.basis === "serving" ? "serving" : "g");
    let amount = o.amount != null ? o.amount : unit === "serving" ? 1 : (food.serving && food.serving.g) || 100;
    const per = food.per100;
    const meal = o.meal || (addCtx && addCtx.meal) || "snacks";
    const paint = () => {
      const m = macrosFor(food, amount, unit);
      return `<div class="amt-live" data-testid="amount-live">
        <div><b data-testid="amount-kcal">${fmt(m.kcal, 0)}</b><span>kcal</span></div>
        <div><b>${fmt(m.p, 0)}</b><span>protein g</span></div>
        <div><b>${fmt(m.c, 0)}</b><span>carbs g</span></div>
        <div><b>${fmt(m.f, 0)}</b><span>fat g</span></div>
      </div>`;
    };
    A().showSheet(`<div class="sheet food-sheet kb-safe" data-testid="amount-sheet">
      <div class="tracking-head"><h2>${esc(food.name)}</h2>
        <button type="button" class="fav-btn${isFav(food.id) ? " on" : ""}" data-food="fav" data-id="${esc(food.id)}" aria-label="Favourite" data-testid="fav-toggle">${ICON.star(isFav(food.id))}</button>
      </div>
      <p class="amt-brand">${esc(food.brand || "")}${food.code ? ` · ${esc(food.code)}` : ""}</p>
      ${per ? `<div class="per100" data-testid="per100"><span>Per 100 g</span><b>${fmt(per.kcal, 0)} kcal</b><b>P ${fmt(per.p)}</b><b>C ${fmt(per.c)}</b><b>F ${fmt(per.f)}</b></div>` : ""}
      <label class="field-label">Amount</label>
      <div class="amt-row">
        <input class="text-input" data-amt inputmode="decimal" value="${esc(String(fmt(amount)).replace(/\./g, ""))}" data-testid="amount-input">
        <div class="weight-ranges unit-toggle">
          <button type="button" class="wrange${unit === "g" ? " on" : ""}" data-unit="g"${per ? "" : " disabled"} data-testid="unit-g">g</button>
          <button type="button" class="wrange${unit === "serving" ? " on" : ""}" data-unit="serving"${hasServing ? "" : " disabled"} data-testid="unit-serving">${food.serving && food.serving.label ? esc(shortServing(food.serving.label)) : "serving"}</button>
        </div>
      </div>
      <div data-amt-live>${paint()}</div>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-food="${o.editId ? "close" : "back-to-add"}">${o.editId ? "Cancel" : "Back"}</button>
        <button type="button" class="btn pri" data-amt-save data-testid="amount-save">${o.editId ? "Save" : "Add to " + (MEALS.find((x) => x.id === meal) || {}).label}</button>
      </div>
      ${o.editId ? `<button type="button" class="btn danger-text sheet-del" data-food="del-item-sheet" data-meal="${esc(meal)}" data-id="${esc(o.editId)}" data-testid="sheet-delete-item">${ICON.trash} Delete from ${esc((MEALS.find((x) => x.id === meal) || {}).label || "meal")}</button>` : ""}
    </div>`);
    const root = document.querySelector("[data-testid=amount-sheet]");
    const inp = root.querySelector("[data-amt]");
    const live = root.querySelector("[data-amt-live]");
    inp.addEventListener("input", () => { amount = num(inp.value) || 0; live.innerHTML = paint(); });
    root.querySelectorAll("[data-unit]").forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return;
      const next = b.dataset.unit;
      if (next === unit) return;
      if (next === "serving") amount = 1; else amount = (food.serving && food.serving.g) || 100;
      unit = next;
      inp.value = String(fmt(amount)).replace(/\./g, "");
      root.querySelectorAll("[data-unit]").forEach((x) => x.classList.toggle("on", x.dataset.unit === unit));
      live.innerHTML = paint();
    }));
    root.querySelector("[data-amt-save]").addEventListener("click", () => {
      if (!(amount > 0)) { A().showToast("Enter an amount"); return; }
      if (o.editId) {
        updateItem(o.ymd || curDay, meal, o.editId, amount, unit);
        A().closeSheet();
        A().render();
        A().showToast("Updated");
        return;
      }
      logFood(curDay || today(), meal, food, amount, unit);
      A().closeSheet();
      A().render();
      A().showToast(`${food.name} added`);
    });
  }
  function shortServing(l) { const s = String(l); return s.length > 14 ? "serving" : s; }

  /* ---------- quick add / custom food / targets ---------- */
  function openQuick(meal, item) {
    const v = item || {};
    A().showSheet(`<div class="sheet food-sheet kb-safe" data-testid="quick-sheet">
      <div class="tracking-head"><h2>${item ? "Edit quick add" : "Quick add"}</h2><button type="button" class="tracking-close" data-food="${item ? "close" : "back-to-add"}">${item ? "Cancel" : "Back"}</button></div>
      <label class="field-label">Name (optional)</label>
      <input class="text-input" data-q-name placeholder="e.g. Canteen lunch" value="${esc(v.quick && v.name !== "Quick add" ? v.name : "")}">
      <label class="field-label">Calories (kcal)</label>
      <input class="text-input" data-q-kcal inputmode="decimal" placeholder="e.g. 650" value="${v.kcal != null ? esc(fmt(v.kcal, 0)) : ""}" data-testid="quick-kcal">
      <div class="macro-grid">
        <label>Protein g<input class="text-input" data-q-p inputmode="decimal" placeholder="—" value="${v.p ? esc(fmt(v.p)) : ""}"></label>
        <label>Carbs g<input class="text-input" data-q-c inputmode="decimal" placeholder="—" value="${v.c ? esc(fmt(v.c)) : ""}"></label>
        <label>Fat g<input class="text-input" data-q-f inputmode="decimal" placeholder="—" value="${v.f ? esc(fmt(v.f)) : ""}"></label>
      </div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-q-save data-testid="quick-save">${item ? "Save" : "Add"}</button></div>
      ${item && item.id ? `<button type="button" class="btn danger-text sheet-del" data-food="del-item-sheet" data-meal="${esc(meal)}" data-id="${esc(item.id)}" data-testid="sheet-delete-item">${ICON.trash} Delete from ${esc((MEALS.find((x) => x.id === meal) || {}).label || "meal")}</button>` : ""}
    </div>`);
    const root = document.querySelector("[data-testid=quick-sheet]");
    root.querySelector("[data-q-save]").addEventListener("click", () => {
      const kcal = num(root.querySelector("[data-q-kcal]").value);
      if (!(kcal >= 0) || kcal == null) { A().showToast("Enter calories"); return; }
      const vals = { quick: true, name: root.querySelector("[data-q-name]").value.trim() || "Quick add", kcal,
        p: num(root.querySelector("[data-q-p]").value) || 0, c: num(root.querySelector("[data-q-c]").value) || 0, f: num(root.querySelector("[data-q-f]").value) || 0 };
      if (item) updateQuick(curDay, meal, item.id, vals); else addItem(curDay, meal, vals);
      A().closeSheet();
      A().render();
      A().showToast(item ? "Updated" : "Added");
    });
  }

  function openCustom(existing) {
    const f = existing || {};
    const basis = f.basis || "100g";
    const vals = basis === "serving" && f.perServing ? f.perServing : (f.per100 || {});
    A().showSheet(`<div class="sheet food-sheet kb-safe tall" data-testid="custom-food-sheet">
      <div class="tracking-head"><h2>${existing ? "Edit food" : "New food"}</h2><button type="button" class="tracking-close" data-food="back-to-add">Cancel</button></div>
      <div class="sheet-body">
      <label class="field-label">Name</label>
      <input class="text-input" data-cf-name placeholder="e.g. Mum’s lasagne" value="${esc(f.name || "")}" data-testid="cf-name">
      <label class="field-label">Values are</label>
      <div class="weight-ranges" data-cf-basis>
        <button type="button" class="wrange${basis === "100g" ? " on" : ""}" data-b="100g">Per 100 g</button>
        <button type="button" class="wrange${basis === "serving" ? " on" : ""}" data-b="serving">Per serving</button>
      </div>
      <label class="field-label">Serving size in grams (optional)</label>
      <input class="text-input" data-cf-sg inputmode="decimal" placeholder="e.g. 250" value="${f.serving && f.serving.g ? esc(fmt(f.serving.g)) : ""}">
      <label class="field-label">Calories (kcal)</label>
      <input class="text-input" data-cf-kcal inputmode="decimal" value="${vals.kcal != null ? esc(fmt(vals.kcal, 0)) : ""}" data-testid="cf-kcal">
      <div class="macro-grid">
        <label>Protein g<input class="text-input" data-cf-p inputmode="decimal" value="${vals.p != null ? esc(fmt(vals.p)) : ""}"></label>
        <label>Carbs g<input class="text-input" data-cf-c inputmode="decimal" value="${vals.c != null ? esc(fmt(vals.c)) : ""}"></label>
        <label>Fat g<input class="text-input" data-cf-f inputmode="decimal" value="${vals.f != null ? esc(fmt(vals.f)) : ""}"></label>
      </div>
      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn ghost danger-text" data-cf-del data-testid="cf-delete">Delete</button>` : ""}
        <button type="button" class="btn pri" data-cf-save data-testid="cf-save">Save food</button>
      </div></div>
    </div>`, { top: true });
    const root = document.querySelector("[data-testid=custom-food-sheet]");
    let b = basis;
    root.querySelectorAll("[data-b]").forEach((x) => x.addEventListener("click", () => {
      b = x.dataset.b;
      root.querySelectorAll("[data-b]").forEach((y) => y.classList.toggle("on", y === x));
    }));
    root.querySelector("[data-cf-save]").addEventListener("click", () => {
      const name = root.querySelector("[data-cf-name]").value.trim();
      const kcal = num(root.querySelector("[data-cf-kcal]").value);
      if (!name || kcal == null) { A().showToast("Add a name and calories"); return; }
      const sg = num(root.querySelector("[data-cf-sg]").value);
      if (b === "serving" && !sg) { /* allowed: logs by serving only */ }
      const food = saveCustomFood({ id: f.id, name, basis: b, servingG: sg, kcal,
        p: num(root.querySelector("[data-cf-p]").value) || 0, c: num(root.querySelector("[data-cf-c]").value) || 0, f: num(root.querySelector("[data-cf-f]").value) || 0 });
      A().showToast(existing ? "Food updated" : "Food saved");
      if (addCtx) { addCtx.tab = "mine"; openAmount(food); } else A().closeSheet();
    });
    const del = root.querySelector("[data-cf-del]");
    if (del) del.addEventListener("click", () => {
      deleteCustomFood(f.id);
      A().showToast(`${f.name} deleted`, "Undo", () => { const x = getFood(f.id); if (x) { delete x.deleted; save(); } });
      if (addCtx) { addCtx.tab = "mine"; paintAdd(); } else A().closeSheet();
    });
  }

  function targetsFormHtml(inSettings) {
    const t = targets();
    const sug = suggestTargets();
    return `<div class="targets-form" data-testid="targets-form">
      <div class="macro-grid two">
        <label>Calories kcal<input class="text-input" data-t-kcal inputmode="numeric" value="${r0(t.kcal)}" data-testid="target-kcal"></label>
        <label>Protein g<input class="text-input" data-t-p inputmode="numeric" value="${r0(t.p)}" data-testid="target-p"></label>
        <label>Carbs g<input class="text-input" data-t-c inputmode="numeric" value="${r0(t.c)}"></label>
        <label>Fat g<input class="text-input" data-t-f inputmode="numeric" value="${r0(t.f)}"></label>
      </div>
      <div class="target-suggest" data-testid="target-suggest">
        <p>${sug.basis
          ? `Suggestion for ${esc(fmt(sug.basis))} kg (latest weigh-in): ${fmt(sug.kcal, 0)} kcal · protein ${sug.p} g (2 g/kg) · fat ${sug.f} g · carbs ${sug.c} g. Roughly maintenance — eat less to cut, more to gain.`
          : "Log your body weight on Home to get a suggestion based on it (protein about 2 g per kg)."}</p>
        ${sug.basis ? `<button type="button" class="weight-hist-btn" data-food="use-suggest" data-testid="use-suggest">Use suggestion</button>` : ""}
      </div>
      <div class="sheet-actions"${inSettings ? ' style="margin-top:8px"' : ""}><button type="button" class="btn pri" data-food="save-targets" data-testid="save-targets">Save targets</button></div>
    </div>`;
  }
  function openTargets() {
    A().showSheet(`<div class="sheet food-sheet kb-safe" data-testid="targets-sheet">
      <div class="tracking-head"><h2>Daily targets</h2><button type="button" class="tracking-close" data-food="close">Cancel</button></div>
      ${targetsFormHtml(false)}
    </div>`);
  }
  function readTargets(btn) {
    const root = btn.closest("[data-testid=targets-form]");
    const g = (sel) => num(root.querySelector(sel).value);
    return { root, t: { kcal: g("[data-t-kcal]"), p: g("[data-t-p]"), c: g("[data-t-c]"), f: g("[data-t-f]") } };
  }
  function settingsHtml() {
    const t = targets();
    return `<div class="settings-food" data-testid="settings-food">
      <h3 class="settings-sub">Food targets</h3>
      <p class="prog-note">${t.suggested ? "Using a suggestion from your body weight. Set your own below." : "Your daily targets. Change them any time."}</p>
      ${targetsFormHtml(true)}
    </div>`;
  }

  /* ---------- saved meals UI (v27) ---------- */
  function openMealMenu(slot) {
    const lbl = (MEALS.find((m) => m.id === slot) || MEALS[0]).label;
    const n = (day(curDay)[slot] || []).length;
    A().showSheet(`<div class="sheet action-sheet" data-testid="meal-menu-sheet">
      <div class="handle"></div>
      <p class="as-title">${esc(lbl)} · ${n} item${n === 1 ? "" : "s"}</p>
      <button type="button" class="as-btn" data-food="save-meal" data-meal="${slot}" data-testid="save-as-meal">${ICON.save}<span>Save as meal</span></button>
      <button type="button" class="as-btn" data-food="add-saved" data-meal="${slot}" data-testid="add-saved-meal">${ICON.bowl}<span>Add a saved meal</span></button>
      <button type="button" class="as-btn" data-food="toggle-edit" data-testid="meal-menu-edit">${ICON.more}<span>Edit items</span></button>
      <button type="button" class="as-btn cancel" data-food="close">Cancel</button>
    </div>`);
  }
  function openSaveMeal(slot) {
    const items = day(curDay)[slot] || [];
    const t = totals(items);
    A().showSheet(`<div class="sheet food-sheet kb-safe" data-testid="save-meal-sheet">
      <div class="tracking-head"><h2>Save as meal</h2><button type="button" class="tracking-close" data-food="close">Cancel</button></div>
      <p class="amt-brand">${items.length} item${items.length === 1 ? "" : "s"} · ${fmt(t.kcal, 0)} kcal · P ${fmt(t.p, 0)} · C ${fmt(t.c, 0)} · F ${fmt(t.f, 0)}</p>
      <label class="field-label" for="meal-name">Name</label>
      <input class="text-input" id="meal-name" data-meal-name value="${esc(suggestMealName(slot))}" maxlength="40" autocomplete="off" enterkeyhint="done" data-testid="meal-name-input">
      <div class="sm-preview">${items.map((it) => `<div class="smp-row"><span>${esc(it.name || "Quick add")}</span><b>${esc(amountLabel(it))}</b></div>`).join("")}</div>
      <div class="sheet-actions"><button type="button" class="btn pri" data-food="save-meal-go" data-meal="${slot}" data-testid="meal-name-save">Save meal</button></div>
    </div>`);
    const inp = document.querySelector("[data-meal-name]");
    if (inp) { inp.focus(); inp.select(); }
  }
  function amountLabel(it) {
    if (it.quick) return `${fmt(it.kcal, 0)} kcal`;
    return it.unit === "serving" ? `${fmt(it.amount)} serving${it.amount === 1 ? "" : "s"}` : `${fmt(it.amount, 0)} g`;
  }
  /* mode "add": preview + adjust before adding; mode "edit": rename, change amounts, remove items, delete. */
  function openMealSheet(id, mode) {
    const meal = getMeal(id);
    if (!meal) return;
    const slot = (addCtx && addCtx.meal) || "breakfast";
    const slotLbl = (MEALS.find((m) => m.id === slot) || MEALS[0]).label;
    let rows = meal.items.map((it) => ({ it, amount: it.amount, on: true }));
    const cur = () => rows.filter((r) => r.on).map((r) => itemAt(r.it, r.amount));
    const totalsHtml = () => {
      const t = totals(cur());
      return `<div class="amt-live" data-testid="meal-sheet-totals">
        <div><b data-testid="meal-sheet-kcal">${fmt(t.kcal, 0)}</b><span>kcal</span></div>
        <div><b>${fmt(t.p, 0)}</b><span>protein g</span></div>
        <div><b>${fmt(t.c, 0)}</b><span>carbs g</span></div>
        <div><b>${fmt(t.f, 0)}</b><span>fat g</span></div></div>`;
    };
    const rowHtml = (r, i) => {
      const x = itemAt(r.it, r.amount);
      const unit = r.it.quick ? "" : r.it.unit === "serving" ? "srv" : "g";
      return `<div class="msi${r.on ? "" : " off"}" data-row="${i}" data-testid="meal-sheet-item">
        ${mode === "add" ? `<button type="button" class="msi-check${r.on ? " on" : ""}" data-toggle="${i}" aria-label="Include ${esc(r.it.name)}">${r.on ? "✓" : ""}</button>` : ""}
        <span class="msi-main"><span class="fi-name">${esc(r.it.name || "Quick add")}</span><span class="fi-meta" data-rowmeta="${i}">${fmt(x.kcal, 0)} kcal · P ${fmt(x.p, 0)} · C ${fmt(x.c, 0)} · F ${fmt(x.f, 0)}</span></span>
        ${r.it.quick ? `<span class="msi-q">Quick add</span>` : `<label class="msi-amt"><input class="text-input" inputmode="decimal" data-amt-row="${i}" value="${esc(fmt(r.amount))}" aria-label="Amount for ${esc(r.it.name)}"><i>${unit}</i></label>`}
        ${mode === "edit" ? `<button type="button" class="msi-del" data-remove="${i}" aria-label="Remove ${esc(r.it.name)}" data-testid="meal-sheet-remove">×</button>` : ""}
      </div>`;
    };
    const paint = () => {
      A().showSheet(`<div class="sheet food-sheet kb-safe tall" data-testid="meal-sheet" data-mode="${mode}">
        <div class="tracking-head"><h2>${mode === "edit" ? "Edit meal" : esc(meal.name)}</h2>
          <button type="button" class="tracking-close" data-food="back-to-add" data-testid="meal-sheet-back">${addCtx ? "Back" : "Close"}</button></div>
        <div class="sheet-body">
          ${mode === "edit"
            ? `<label class="field-label" for="meal-rename">Name</label><input class="text-input" id="meal-rename" data-meal-rename value="${esc(meal.name)}" maxlength="40" data-testid="meal-rename">`
            : `<p class="amt-brand">Adjust amounts or untick items, then add them to ${esc(slotLbl)}.</p>`}
          <label class="field-label">${rows.length} item${rows.length === 1 ? "" : "s"}</label>
          <div class="msi-list">${rows.map(rowHtml).join("") || `<p class="empty">No items left.</p>`}</div>
          <div data-meal-totals>${totalsHtml()}</div>
        </div>
        <div class="sheet-actions">
          ${mode === "edit"
            ? `<button type="button" class="btn ghost danger-text" data-meal-delete data-testid="meal-sheet-delete">Delete</button>
               <button type="button" class="btn pri" data-meal-save data-testid="meal-sheet-save">Save changes</button>`
            : `<button type="button" class="btn ghost" data-meal-editbtn data-testid="meal-sheet-edit">Edit meal</button>
               <button type="button" class="btn pri" data-meal-add data-testid="meal-sheet-add">Add ${cur().length} to ${esc(slotLbl)}</button>`}
        </div>
      </div>`, { top: true });
      bind();
    };
    const bind = () => {
      const root = document.querySelector("[data-testid=meal-sheet]");
      root.querySelectorAll("[data-amt-row]").forEach((inp) => inp.addEventListener("input", () => {
        const i = Number(inp.dataset.amtRow);
        rows[i].amount = num(inp.value) || 0;
        const x = itemAt(rows[i].it, rows[i].amount);
        root.querySelector(`[data-rowmeta="${i}"]`).textContent = `${fmt(x.kcal, 0)} kcal · P ${fmt(x.p, 0)} · C ${fmt(x.c, 0)} · F ${fmt(x.f, 0)}`;
        root.querySelector("[data-meal-totals]").innerHTML = totalsHtml();
      }));
      root.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => { const i = Number(b.dataset.toggle); rows[i].on = !rows[i].on; paint(); }));
      root.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => { rows.splice(Number(b.dataset.remove), 1); paint(); }));
      const add = root.querySelector("[data-meal-add]");
      if (add) add.addEventListener("click", () => {
        const items = cur().filter((x) => x.quick || x.amount > 0);
        if (!items.length) { A().showToast("Pick at least one item"); return; }
        addMealItems(curDay || today(), slot, items);
        addCtx = null;
        A().closeSheet();
        A().render();
        A().showToast(`${meal.name} added to ${slotLbl}`);
      });
      const eb = root.querySelector("[data-meal-editbtn]");
      if (eb) eb.addEventListener("click", () => openMealSheet(id, "edit"));
      const sv = root.querySelector("[data-meal-save]");
      if (sv) sv.addEventListener("click", () => {
        const name = root.querySelector("[data-meal-rename]").value.trim();
        if (!name) { A().showToast("Give the meal a name"); return; }
        if (!rows.length) { A().showToast("A meal needs at least one item — or delete it"); return; }
        updateMeal(id, { name, items: rows.map((r) => itemAt(r.it, r.amount)) });
        A().showToast("Meal saved");
        if (addCtx) { addCtx.tab = "meals"; paintAdd(); } else A().closeSheet();
      });
      const del = root.querySelector("[data-meal-delete]");
      if (del) del.addEventListener("click", () => removeSavedMeal(id));
    };
    paint();
  }
  function removeSavedMeal(id) {
    const snap = deleteMeal(id);
    if (!snap) return;
    if (addCtx) { addCtx.tab = "meals"; paintAdd(); } else A().closeSheet();
    A().showToast(`${snap.meal.name} deleted`, "Undo", () => { restoreMeal(snap); if (addCtx && document.querySelector("[data-testid=add-food-sheet]")) paintAdd(); });
  }
  function bindMealSwipes() {
    document.querySelectorAll("[data-meal-swipe]").forEach((row) => {
      const front = row.querySelector(".swipe-front");
      let x0 = null, dx = 0, pid = null;
      row.addEventListener("pointerdown", (e) => { if (mealsEdit) return; x0 = e.clientX; dx = 0; pid = e.pointerId; });
      row.addEventListener("pointermove", (e) => {
        if (x0 == null || e.pointerId !== pid) return;
        dx = Math.min(0, e.clientX - x0);
        if (dx < -8) { front.style.transition = "none"; front.style.transform = `translateX(${Math.max(dx, -120)}px)`; row.classList.add("dragging"); }
      });
      const end = () => {
        if (x0 == null) return;
        x0 = null; front.style.transition = ""; front.style.transform = ""; row.classList.remove("dragging");
        if (dx < -90) removeSavedMeal(row.dataset.id);
      };
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
    });
  }

  /* ---------- barcode ---------- */
  function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "vendor/zxing.min.js";
      s.onload = () => res(window.ZXing);
      s.onerror = () => rej(new Error("scanner failed to load"));
      document.head.appendChild(s);
    });
  }
  function openScan() {
    stopScan();
    A().showSheet(`<div class="sheet food-sheet kb-safe tall scan-sheet" data-testid="scan-sheet">
      <div class="tracking-head"><h2>Scan barcode</h2><button type="button" class="tracking-close" data-food="back-to-add" data-testid="close-scan">Back</button></div>
      <div class="scan-view" data-scan-view>
        <video data-scan-video playsinline muted autoplay></video>
        <div class="scan-frame"><i></i></div>
        <p class="scan-msg" data-scan-msg>Starting camera…</p>
      </div>
      <label class="field-label">Or type the barcode</label>
      <form class="food-search" data-scan-form>
        <input class="search-input" data-scan-code inputmode="numeric" placeholder="e.g. 5740900403376" autocomplete="off" data-testid="barcode-input">
        <button type="submit" class="btn pri" data-testid="barcode-go">Look up</button>
      </form>
      <p class="food-status" data-scan-status></p>
    </div>`, { top: true });
    const root = document.querySelector("[data-testid=scan-sheet]");
    root.querySelector("[data-scan-form]").addEventListener("submit", (e) => {
      e.preventDefault();
      const code = root.querySelector("[data-scan-code]").value.trim();
      if (code) handleCode(code);
    });
    startCamera(root);
  }
  async function startCamera(root) {
    const video = root.querySelector("[data-scan-video]");
    const msg = root.querySelector("[data-scan-msg]");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg.textContent = "Camera isn’t available here. Type the barcode below.";
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (e) {
      msg.textContent = "Camera access was blocked. Allow the camera for VELA in Settings, or type the barcode below.";
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* autoplay */ }
    msg.textContent = "Point the camera at the barcode";
    let stopped = false;
    scanStop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); };
    let detect = null;
    if ("BarcodeDetector" in window) {
      try {
        const bd = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        detect = async () => { const r = await bd.detect(video); return r && r[0] && r[0].rawValue; };
      } catch (e) { detect = null; }
    }
    if (!detect) {
      try {
        const Z = await loadZxing();
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        const reader = new Z.MultiFormatReader();
        reader.setHints(hints);
        const canvas = document.createElement("canvas");
        detect = async () => {
          const w = video.videoWidth, h = video.videoHeight;
          if (!w || !h) return null;
          const cw = Math.round(w * 0.8), ch = Math.round(h * 0.4);
          canvas.width = cw; canvas.height = ch;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
          try {
            const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
            const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(src));
            return reader.decode(bmp).getText();
          } catch (e) { return null; }
        };
      } catch (e) {
        msg.textContent = "The scanner couldn’t load offline. Type the barcode below.";
        return;
      }
    }
    const tick = async () => {
      if (stopped) return;
      let code = null;
      try { code = await detect(); } catch (e) { code = null; }
      if (code && /^\d{8,14}$/.test(code)) { if (navigator.vibrate) navigator.vibrate(30); stopScan(); handleCode(code); return; }
      setTimeout(tick, 180);
    };
    tick();
  }
  function stopScan() { if (scanStop) { try { scanStop(); } catch (e) { /* */ } scanStop = null; } }
  async function handleCode(code) {
    const status = document.querySelector("[data-scan-status]");
    const set = (t) => { if (status) status.textContent = t; };
    set(`Looking up ${code}…`);
    try {
      const food = await lookupBarcode(code);
      if (!food) { set(`No product with barcode ${code} on Open Food Facts yet. Use Quick add or create your own food.`); return; }
      stopScan();
      openAmount(food);
    } catch (e) {
      set(navigator.onLine === false ? "You’re offline. Barcode lookup needs a connection." : "Couldn’t reach Open Food Facts. Try again.");
    }
  }

  /* ---------- Progress chart ---------- */
  function progressHtml() {
    const n = chartRange;
    const t = today();
    const tg = targets();
    const days = Array.from({ length: n }, (_, i) => addDays(t, i - n + 1));
    const vals = days.map((d) => dayTotals(d));
    const logged = vals.filter((v) => v.kcal > 0);
    const W = 320, H = 150, pl = 30, pr = 6, pt = 10, pb = 20;
    const maxK = Math.max(tg.kcal * 1.25, ...vals.map((v) => v.kcal), 1);
    const maxP = Math.max(tg.p * 1.4, ...vals.map((v) => v.p), 1);
    const bw = (W - pl - pr) / n;
    const y = (k) => pt + (H - pt - pb) * (1 - k / maxK);
    const bars = vals.map((v, i) => {
      if (!v.kcal) return "";
      const x = pl + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
      const over = v.kcal > tg.kcal * 1.05;
      return `<rect x="${x.toFixed(1)}" y="${y(v.kcal).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - pb - y(v.kcal)).toFixed(1)}" rx="${Math.min(3, w / 2).toFixed(1)}" fill="${over ? "#F2B84B" : "var(--accent)"}" opacity="0.9"/>`;
    }).join("");
    const pts = vals.map((v, i) => v.kcal ? `${(pl + i * bw + bw / 2).toFixed(1)},${(pt + (H - pt - pb) * (1 - v.p / maxP)).toFixed(1)}` : null).filter(Boolean);
    const line = pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="#B794F6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : "";
    const dots = pts.map((p) => { const [cx, cy] = p.split(","); return `<circle cx="${cx}" cy="${cy}" r="2.6" fill="#B794F6"/>`; }).join("");
    const ty = y(tg.kcal);
    const labels = days.map((d, i) => {
      const step = n <= 7 ? 1 : 5;
      if ((n - 1 - i) % step) return "";
      const dt = new Date(`${d}T12:00:00`);
      const l = n <= 7 ? dt.toLocaleDateString("en-GB", { weekday: "narrow" }) : String(dt.getDate());
      return `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${l}</text>`;
    }).join("");
    const avgK = logged.length ? logged.reduce((a, v) => a + v.kcal, 0) / logged.length : 0;
    const avgP = logged.length ? logged.reduce((a, v) => a + v.p, 0) / logged.length : 0;
    const ranges = [7, 30].map((r) => `<button type="button" class="wrange${r === n ? " on" : ""}" data-food="chart-range" data-range="${r}" data-testid="food-chart-${r}">${r}D</button>`).join("");
    return `<section class="prog-card food-chart-card" data-testid="food-chart">
      <div class="weight-head"><h2>Calories &amp; protein</h2><div class="weight-ranges">${ranges}</div></div>
      <p class="prog-note">Daily calories vs your ${fmt(tg.kcal, 0)} kcal target, and protein (${fmt(tg.p, 0)} g target).</p>
      <svg class="food-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Calories and protein chart">
        <text x="${pl - 4}" y="${(ty + 3).toFixed(1)}" text-anchor="end">${fmt(tg.kcal / 1000)}k</text>
        <line x1="${pl}" x2="${W - pr}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--accent2)" stroke-dasharray="4 4" stroke-width="1.2" opacity="0.7"/>
        <line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="var(--border)" stroke-width="1"/>
        ${bars}${line}${dots}${labels}
      </svg>
      <div class="chart-legend"><span class="lg k"></span>Calories<span class="lg t"></span>Target<span class="lg p"></span>Protein</div>
      <div class="chart-avgs">
        <div><b data-testid="avg-kcal">${logged.length ? fmt(avgK, 0) : "—"}</b><span>avg kcal / logged day</span></div>
        <div><b data-testid="avg-protein">${logged.length ? fmt(avgP, 0) + " g" : "—"}</b><span>avg protein</span></div>
        <div><b>${logged.length}/${n}</b><span>days logged</span></div>
      </div>
    </section>`;
  }

  /* ---------- click handling ---------- */
  function findItem(meal, id) { return (day(curDay)[meal] || []).find((x) => x.id === id); }
  function onClick(e) {
    const btn = e.target.closest("[data-food]");
    if (!btn) return;
    const act = btn.dataset.food;
    if (act === "open") { e.preventDefault(); curDay = today(); editMode = false; A().openFood(); return; }
    if (act === "prev-day") { setDay(addDays(curDay, -1)); return; }
    if (act === "next-day") { setDay(addDays(curDay, 1)); return; }
    if (act === "toggle-edit") { editMode = !editMode; A().closeSheet(); A().render(); return; }
    if (act === "meal-menu") { openMealMenu(btn.dataset.meal); return; }
    if (act === "save-meal") { openSaveMeal(btn.dataset.meal); return; }
    if (act === "save-meal-go") {
      const inp = document.querySelector("[data-meal-name]");
      const name = inp ? inp.value.trim() : "";
      if (!name) { A().showToast("Give the meal a name"); return; }
      const m = saveMealFromDay(curDay, btn.dataset.meal, name);
      A().closeSheet();
      if (m) A().showToast(`Saved “${m.name}” · ${m.items.length} items`);
      return;
    }
    if (act === "add-saved") { addCtx = { meal: btn.dataset.meal, tab: "meals", term: "", results: null, status: "" }; paintAdd(); return; }
    if (act === "meals-edit") { mealsEdit = !mealsEdit; paintAdd(); return; }
    if (act === "meal-open") { if (btn.closest(".dragging")) return; openMealSheet(btn.dataset.id, "add"); return; }
    if (act === "meal-edit") { openMealSheet(btn.dataset.id, "edit"); return; }
    if (act === "meal-del") { removeSavedMeal(btn.dataset.id); return; }
    if (act === "add") { openAdd(btn.dataset.meal); return; }
    if (act === "add-tab") { addCtx.tab = btn.dataset.tab; paintAdd(); return; }
    if (act === "close") { stopScan(); addCtx = null; A().closeSheet(); return; }
    if (act === "back-to-add") { stopScan(); if (addCtx) paintAdd(); else A().closeSheet(); return; }
    if (act === "pick") {
      const f = getFood(btn.dataset.id);
      if (!f) return;
      if (addCtx && addCtx.tab === "mine") { openCustomOrAmount(f); return; }
      openAmount(f);
      return;
    }
    if (act === "fav") {
      const on = toggleFavourite(btn.dataset.id);
      btn.classList.toggle("on", on);
      btn.innerHTML = ICON.star(on);
      A().showToast(on ? "Added to favourites" : "Removed from favourites");
      return;
    }
    if (act === "quick") { openQuick(addCtx ? addCtx.meal : "snacks"); return; }
    if (act === "new-food") { openCustom(null); return; }
    if (act === "scan") { openScan(); return; }
    if (act === "copy") {
      const from = addDays(curDay, -1);
      const n = copyMeal(from, curDay, btn.dataset.meal);
      A().render();
      A().showToast(`Copied ${n} item${n === 1 ? "" : "s"}`, "Undo", () => {
        const d = day(curDay);
        d[btn.dataset.meal] = d[btn.dataset.meal].slice(0, Math.max(0, d[btn.dataset.meal].length - n));
        save();
        A().render();
      });
      return;
    }
    if (act === "edit-item") {
      if (btn.closest(".dragging")) return;
      const openRow = btn.closest(".food-swipe.open");
      if (openRow) { closeSwipeRows(); return; }
      const it = findItem(btn.dataset.meal, btn.dataset.id);
      if (!it) return;
      if (it.quick || !it.foodId || !getFood(it.foodId)) { openQuick(btn.dataset.meal, it); return; }
      addCtx = null;
      openAmount(getFood(it.foodId), { amount: it.amount, unit: it.unit, editId: it.id, meal: btn.dataset.meal, ymd: curDay });
      return;
    }
    if (act === "del-item") { deleteItem(btn.dataset.meal, btn.dataset.id); return; }
    if (act === "del-item-sheet") { A().closeSheet(); deleteItem(btn.dataset.meal, btn.dataset.id); return; }
    if (act === "targets") { openTargets(); return; }
    if (act === "use-suggest") {
      const s = suggestTargets();
      const root = btn.closest("[data-testid=targets-form]");
      root.querySelector("[data-t-kcal]").value = s.kcal;
      root.querySelector("[data-t-p]").value = s.p;
      root.querySelector("[data-t-c]").value = s.c;
      root.querySelector("[data-t-f]").value = s.f;
      return;
    }
    if (act === "save-targets") {
      const { t } = readTargets(btn);
      if (!(t.kcal > 0)) { A().showToast("Enter a calorie target"); return; }
      setTargets({ kcal: t.kcal, p: t.p || 0, c: t.c || 0, f: t.f || 0 });
      A().closeSheet();
      A().render();
      A().showToast("Targets saved");
      return;
    }
    if (act === "chart-range") { chartRange = Number(btn.dataset.range) || 7; A().render(); return; }
  }
  function openCustomOrAmount(f) { openAmount(f); }
  document.addEventListener("click", onClick);

  window.VELA_FOOD = {
    MEALS, load, reset, save, homeCardHtml, renderPage, settingsHtml, progressHtml,
    dayTotals, targets, suggestTargets, setTargets, logFood, addItem, saveCustomFood, macrosFor,
    savedMeals, saveMealFromDay, updateMeal, deleteMeal, addMealItems, itemAt,
    searchOff, lookupBarcode, foodFromOff, openAdd, openScan, stopScan,
    get day() { return curDay; }, set day(v) { curDay = v; },
    _setFetch(fn) { fetchImpl = fn; },
  };
})();
