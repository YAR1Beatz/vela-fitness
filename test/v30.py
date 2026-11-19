"""VELA v30 (draft): deleting a food entry works (incl. legacy id-less entries), swipe + sheet delete."""
import functools, http.server, json, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", ROOT / "drafts"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, "" if ok else detail)
    if not ok: fails.append(label)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = os.environ.get("URL") or f"http://127.0.0.1:{httpd.server_address[1]}/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


SEED = """() => {
  const D = window.VELA_DATA, t = D.copenhagenYMD();
  D.logBodyWeight(83.4, t); D.saveNow && D.saveNow();
  const f = (id, n, b, k, p, c, fa, sg) => ({ id, name: n, brand: b, per100: { kcal: k, p, c, f: fa }, serving: sg ? { g: sg, label: sg + ' g' } : null, source: 'off' });
  const foods = {
    oats: f('off-havre', 'Havregryn', 'Øllingegaard', 372, 13, 59, 7),
    milk: f('off-mini', 'Minimælk 0,4%', 'Arla', 36, 3.5, 4.8, 0.4),
    chia: f('off-chia', 'Chiafrø', 'Urtekram', 486, 17, 7.7, 31),
    yog: f('off-graesk', 'Græsk yoghurt 10%', 'Lindahls', 123, 4.5, 4, 10),
    alm: f('off-mandel', 'Mandler', 'Fine Food', 610, 21, 7, 52),
    whey: f('off-whey', 'Whey protein vanilla', 'Bodylab', 380, 75, 7, 6, 30),
    banana: f('off-banan', 'Banan', '', 89, 1.1, 20, 0.3, 120),
  };
  const it = (fd, a, u) => { const k = u === 'serving' ? (fd.serving.g * a) / 100 : a / 100;
    return { id: 'it-' + Math.random().toString(36).slice(2), ts: Date.now(), foodId: fd.id, name: fd.name, brand: fd.brand, amount: a, unit: u || 'g',
      kcal: fd.per100.kcal * k, p: fd.per100.p * k, c: fd.per100.c * k, f: fd.per100.f * k }; };
  const store = { version: 1, targets: null, foods: {}, recents: [], favourites: ['off-whey'], searchCache: {},
    days: { [t]: { breakfast: [it(foods.oats, 50), it(foods.milk, 200), it(foods.chia, 8), it(foods.yog, 67), it(foods.alm, 23)],
                   lunch: [], dinner: [], snacks: [it(foods.whey, 1, 'serving'), it(foods.banana, 1, 'serving')] } } };
  Object.values(foods).forEach((x) => { store.foods[x.id] = x; });
  localStorage.setItem('vela-food-v1', JSON.stringify(store));
  localStorage.removeItem('vela-home-layout-v1');
}"""
# Make it look like Morten's data: today's breakfast was made with "Copy yesterday" before v30,
# so the entries were saved without an id.
STRIP_IDS = """() => { const k = 'vela-food-v1', s = JSON.parse(localStorage.getItem(k)), t = window.VELA_DATA.copenhagenYMD();
  s.days[t].breakfast.forEach((it) => { delete it.id; }); localStorage.setItem(k, JSON.stringify(s)); }"""

def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA, service_workers="block" if os.environ.get("URL") else "allow")
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.evaluate(SEED); page.evaluate(STRIP_IDS)
    fit_before = page.evaluate("localStorage.getItem('vela-fitness-v1')")
    raw_before = json.loads(page.evaluate("localStorage.getItem('vela-food-v1')"))
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    sfx = "" if tag == "440" else f"-{tag}"
    def shot(n):
        page.wait_for_timeout(250)
        page.screenshot(path=str(SHOTS / f"{n}{sfx}.png"))
    t = page.evaluate("window.VELA_DATA.copenhagenYMD()")
    store = lambda: json.loads(page.evaluate("localStorage.getItem('vela-food-v1')"))
    bf = lambda: store()["days"][t]["breakfast"]
    names = lambda: [i["name"] for i in bf()]
    # open Food (load() repairs ids)
    page.locator('[data-testid=food-card-open]').tap(); page.wait_for_timeout(300)
    after = store()
    check(all(i.get("id") for i in after["days"][t]["breakfast"]), f"[{tag}] legacy entries get an id", [i.get("id") for i in after["days"][t]["breakfast"]])
    strip = lambda L: [{k: v for k, v in i.items() if k != "id"} for i in L]
    check(strip(after["days"][t]["breakfast"]) == strip(raw_before["days"][t]["breakfast"]), f"[{tag}] repair changes nothing but the id")
    check(after["days"][t]["snacks"] == raw_before["days"][t]["snacks"] and after["foods"] == raw_before["foods"], f"[{tag}] other food data untouched")
    meal_kcal = lambda: page.locator('[data-testid=meal-kcal-breakfast]').inner_text()
    eaten = lambda: page.locator('[data-testid=food-kcal-eaten]').inner_text()
    check(meal_kcal() == "520 kcal", f"[{tag}] breakfast starts at 520 kcal", meal_kcal())
    e0 = eaten()
    rows = page.locator('[data-testid=meal-breakfast] [data-food-swipe]')
    # ---- 1) Edit mode Delete (the button Morten tapped) ----
    page.locator('[data-testid=food-edit-toggle]').tap(); page.wait_for_timeout(250)
    page.locator('[data-testid=meal-breakfast] [data-testid=food-item-delete]').nth(1).tap(); page.wait_for_timeout(350)
    check("Minimælk 0,4%" not in names() and len(names()) == 4, f"[{tag}] Edit → Delete removes the entry", names())
    check(meal_kcal() == "448 kcal", f"[{tag}] meal kcal updates (520 → 448)", meal_kcal())
    check(eaten() != e0, f"[{tag}] daily total updates", (e0, eaten()))
    page.locator('[data-toast-action]').tap(); page.wait_for_timeout(300)
    check(names()[1] == "Minimælk 0,4%" and meal_kcal() == "520 kcal", f"[{tag}] Undo puts it back in place", names())
    page.locator('[data-testid=food-edit-toggle]').tap(); page.wait_for_timeout(250)
    # ---- 2) tap a row → edit sheet → Delete from Breakfast ----
    page.locator('[data-testid=meal-breakfast] .food-item-main').nth(2).tap(); page.wait_for_selector('[data-testid=sheet-delete-item]'); page.wait_for_timeout(300)
    check("Delete from Breakfast" in page.locator('[data-testid=sheet-delete-item]').inner_text(), f"[{tag}] edit sheet has Delete from Breakfast")
    shot("food-delete-sheet")
    page.locator('[data-testid=sheet-delete-item]').tap(); page.wait_for_timeout(350)
    check("Chiafrø" not in names(), f"[{tag}] sheet Delete removes the entry", names())
    page.locator('[data-toast-action]').tap(); page.wait_for_timeout(300)
    check("Chiafrø" in names(), f"[{tag}] Undo again")
    # ---- 3) swipe left reveals Delete (CDP touch) ----
    cdp = c.new_cdp_session(page)
    def touch(kind, x=0, y=0):
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [] if kind == "touchEnd" else [{"x": x, "y": y}]})
    def swipe(i, dx, dy=0, steps=10):
        bb = rows.nth(i).bounding_box(); x, y = bb["x"] + bb["width"] * 0.7, bb["y"] + bb["height"] / 2
        touch("touchStart", x, y)
        for k in range(1, steps + 1): touch("touchMove", x + dx * k / steps, y + dy * k / steps); page.wait_for_timeout(16)
        touch("touchEnd"); page.wait_for_timeout(350)
    page.evaluate("document.querySelector('[data-testid=meal-breakfast]').scrollIntoView({block:'center'})"); page.wait_for_timeout(200)
    # vertical drag over a row: no reveal
    swipe(3, 6, -70)
    check(page.locator('[data-testid=meal-breakfast] .food-swipe.open').count() == 0, f"[{tag}] vertical scroll doesn't open a row")
    page.evaluate("document.querySelector('[data-testid=meal-breakfast]').scrollIntoView({block:'center'})"); page.wait_for_timeout(200)
    swipe(3, -110)
    openrows = page.locator('[data-testid=meal-breakfast] .food-swipe.open')
    check(openrows.count() == 1, f"[{tag}] swipe left opens the row")
    btn = openrows.first.locator('[data-testid=food-swipe-delete]')
    check(btn.is_visible(), f"[{tag}] red Delete is showing")
    check(len(names()) == 5, f"[{tag}] reveal alone doesn't delete")
    shot("food-delete-swiped")
    btn.tap(); page.wait_for_timeout(400)
    check("Græsk yoghurt 10%" not in names() and len(names()) == 4, f"[{tag}] tapping Delete removes it", names())
    k_after = meal_kcal()
    check(k_after == "437 kcal", f"[{tag}] meal kcal after swipe delete (520 − 82,4)", k_after)
    shot("food-delete-after")
    # persisted
    page.wait_for_timeout(5400)  # toast expires, delete stays
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    page.locator('[data-testid=food-card-open]').tap(); page.wait_for_timeout(300)
    check(meal_kcal() == "437 kcal" and len(names()) == 4, f"[{tag}] deletion persists after reload", (meal_kcal(), names()))
    # tap on an open row closes it instead of opening the editor; long swipe deletes directly
    page.evaluate("document.querySelector('[data-testid=meal-breakfast]').scrollIntoView({block:'center'})"); page.wait_for_timeout(200)
    swipe(0, -110)
    page.locator('[data-testid=meal-breakfast] .food-item-main').first.tap(); page.wait_for_timeout(300)
    check(page.locator('[data-testid=meal-breakfast] .food-swipe.open').count() == 0 and page.locator('[data-testid=amount-sheet]').count() == 0, f"[{tag}] tap closes an open row")
    swipe(0, -w * 0.8, 0, 14)
    page.wait_for_timeout(300)
    check(len(names()) == 3 and "Havregryn" not in names(), f"[{tag}] long swipe deletes straight away", names())
    check(page.evaluate("localStorage.getItem('vela-fitness-v1')") == fit_before, f"[{tag}] training data untouched")
    check(not errors, f"[{tag}] no page errors", errors)
    b.close()

with sync_playwright() as p:
    run(p, 440, 956, "440")
    if os.environ.get("BOTH", "1") == "1":
        run(p, 375, 812, "375")
print("FAILS:", fails)
