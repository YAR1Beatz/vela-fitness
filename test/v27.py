"""VELA v27 (draft): saved meals + rearrangeable Home cards."""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/draft-v27"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, "" if ok else detail)
    if not ok: fails.append(label)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{httpd.server_address[1]}/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

# A v26-shaped food store (no "meals" key) with Morten-like breakfast today.
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

def run(p, w, h, tag, full):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.evaluate(SEED)
    fit_before = page.evaluate("localStorage.getItem('vela-fitness-v1')")
    food_before = json.loads(page.evaluate("localStorage.getItem('vela-food-v1')"))
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    sfx = "" if tag == "440" else f"-{tag}"
    def shot(n):
        page.evaluate("document.getElementById('toast').classList.add('hidden')")
        page.wait_for_timeout(120)
        page.screenshot(path=str(SHOTS / f"{n}{sfx}.png"))
    order = lambda: page.evaluate("[...document.querySelectorAll('[data-home-block]')].map(b => b.dataset.homeBlock)")

    # ---------- Home rearrange ----------
    check(order() == ["stats", "weight", "food", "plan"], f"[{tag}] default Home order", order())
    check(page.locator('[data-testid=move-up-food]').is_visible() is False, f"[{tag}] arrows hidden until Rearrange")
    shot("home-normal")
    page.locator('[data-testid=home-rearrange]').tap(); page.wait_for_timeout(150)
    check(page.locator('[data-testid=rearrange-bar]').is_visible(), f"[{tag}] rearrange mode on")
    shot("home-rearrange")
    page.locator('[data-testid=move-up-food]').tap(); page.wait_for_timeout(260)
    page.locator('[data-testid=move-up-food]').tap(); page.wait_for_timeout(260)
    check(order() == ["food", "stats", "weight", "plan"], f"[{tag}] arrows move food to top", order())
    # drag: move plan above weight with the handle
    page.evaluate("document.querySelector('[data-testid=home-block-weight]').scrollIntoView({block:'start'}); document.querySelector('.content').scrollTop -= 60")
    page.wait_for_timeout(100)
    hb = page.locator('[data-testid=drag-plan]').bounding_box()
    print("drag from", hb, "vh", h)
    tb = page.locator('[data-testid=home-block-weight]').bounding_box()
    page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2)
    page.mouse.down()
    for k in range(1, 11):
        page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2 - (hb["y"] - tb["y"] + 20) * k / 10)
        page.wait_for_timeout(16)
    if full: shot("home-rearrange-dragging")
    page.mouse.up(); page.wait_for_timeout(200)
    check(order() == ["food", "stats", "plan", "weight"], f"[{tag}] drag handle reorders", order())
    page.locator('[data-testid=move-down-plan]').tap(); page.wait_for_timeout(260)
    check(order() == ["food", "stats", "weight", "plan"], f"[{tag}] arrow down", order())
    page.locator('[data-testid=home-rearrange-done]').tap(); page.wait_for_timeout(150)
    check(not page.locator('[data-testid=rearrange-bar]').count(), f"[{tag}] Done exits")
    page.evaluate("document.querySelector('.content').scrollTop = 0")
    shot("home-reordered")
    saved = json.loads(page.evaluate("localStorage.getItem('vela-home-layout-v1')"))["order"]
    check(saved == ["food", "stats", "weight", "plan"], f"[{tag}] order persisted in its own key", saved)
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    check(order() == ["food", "stats", "weight", "plan"], f"[{tag}] order survives reload", order())
    # unknown/missing ids: new cards appended
    page.evaluate("localStorage.setItem('vela-home-layout-v1', JSON.stringify({order: ['plan', 'bogus']}))")
    page.locator('[data-testid=tab-progress]').tap(); page.locator('[data-testid=tab-home]').tap(); page.wait_for_timeout(100)
    check(order() == ["plan", "stats", "weight", "food"], f"[{tag}] missing cards appended in default order", order())
    page.evaluate("localStorage.setItem('vela-home-layout-v1', JSON.stringify({order: ['food','stats','weight','plan']}))")
    page.locator('[data-testid=tab-progress]').tap(); page.locator('[data-testid=tab-home]').tap(); page.wait_for_timeout(100)

    # ---------- Saved meals ----------
    store = json.loads(page.evaluate("localStorage.getItem('vela-food-v1')"))
    check(store.get("days") == food_before["days"], f"[{tag}] existing food days untouched on load")
    page.locator('[data-testid=food-card-open]').tap()
    page.wait_for_selector('[data-testid=food-page]')
    check(page.locator('[data-testid=meal-menu-lunch]').count() == 0, f"[{tag}] no ⋯ on empty meal")
    page.locator('[data-testid=meal-menu-breakfast]').tap()
    page.wait_for_selector('[data-testid=meal-menu-sheet]')
    shot("meal-menu")
    page.locator('[data-testid=save-as-meal]').tap()
    page.wait_for_selector('[data-testid=save-meal-sheet]')
    check(page.locator('[data-testid=meal-name-input]').input_value() == "Breakfast 1", f"[{tag}] name prefilled Breakfast 1")
    page.locator('[data-testid=meal-name-input]').fill("morgenmad 1")
    page.evaluate("document.activeElement.blur()")
    shot("save-meal-name")
    page.locator('[data-testid=meal-name-save]').tap(); page.wait_for_timeout(150)
    # a second saved meal from snacks for a realistic list
    page.locator('[data-testid=meal-menu-snacks]').tap(); page.locator('[data-testid=save-as-meal]').tap()
    page.locator('[data-testid=meal-name-input]').fill("Efter træning"); page.locator('[data-testid=meal-name-save]').tap(); page.wait_for_timeout(120)
    meals = page.evaluate("window.VELA_FOOD.savedMeals()")
    check([m["name"] for m in meals] == ["Efter træning", "morgenmad 1"], f"[{tag}] meals saved", [m["name"] for m in meals])
    mm = [m for m in meals if m["name"] == "morgenmad 1"][0]
    check([(i["name"], i["amount"]) for i in mm["items"]] == [("Havregryn", 50), ("Minimælk 0,4%", 200), ("Chiafrø", 8), ("Græsk yoghurt 10%", 67), ("Mandler", 23)], f"[{tag}] all 5 items with amounts", mm["items"])

    # Add food on Lunch -> Meals tab
    page.locator('[data-testid=add-food-lunch]').tap()
    page.wait_for_selector('[data-testid=add-food-sheet]')
    page.locator('[data-testid=add-tab-meals]').tap(); page.wait_for_timeout(120)
    check(page.locator('[data-testid=saved-meal]').count() == 2, f"[{tag}] 2 saved meals listed")
    txt = page.locator('[data-testid=saved-meal]').nth(1).inner_text()
    check("5 items" in txt and "kcal" in txt and "P " in txt, f"[{tag}] meal row shows count, kcal and P/C/F", txt)
    shot("saved-meals-list")
    page.locator('[data-testid=saved-meals-edit-toggle]').tap(); page.wait_for_timeout(100)
    check(page.locator('[data-testid=saved-meal-delete]').count() == 2, f"[{tag}] Edit reveals Edit/Delete")
    if full: shot("saved-meals-list-edit")
    # edit view: rename + change amount
    page.locator('[data-testid=saved-meal-edit]').nth(1).tap()
    page.wait_for_selector('[data-testid=meal-sheet][data-mode=edit]')
    shot("saved-meal-edit")
    page.locator('[data-testid=meal-rename]').fill("morgenmad 1")
    page.locator('[data-amt-row="0"]').fill("60")
    page.locator('[data-testid=meal-sheet-save]').tap(); page.wait_for_timeout(120)
    mm = [m for m in page.evaluate("window.VELA_FOOD.savedMeals()") if m["name"] == "morgenmad 1"][0]
    check(mm["items"][0]["amount"] == 60 and round(mm["items"][0]["kcal"]) == 223, f"[{tag}] edited amount saved + recomputed", mm["items"][0])
    page.locator('[data-testid=saved-meals-edit-toggle]').tap(); page.wait_for_timeout(80)
    # delete + undo
    page.locator('[data-testid=saved-meals-edit-toggle]').tap(); page.locator('[data-testid=saved-meal-delete]').first.tap(); page.wait_for_timeout(100)
    check(page.locator('[data-testid=saved-meal]').count() == 1, f"[{tag}] delete saved meal")
    page.locator('#toast [data-toast-action]').tap(); page.wait_for_timeout(100)
    check(len(page.evaluate("window.VELA_FOOD.savedMeals()")) == 2, f"[{tag}] undo restores saved meal")
    page.evaluate("window.VELA_APP.closeSheet()")
    page.locator('[data-testid=add-food-lunch]').tap(); page.locator('[data-testid=add-tab-meals]').tap(); page.wait_for_timeout(100)
    if page.locator('[data-testid=saved-meals-edit-toggle]').inner_text() == "Done":
        page.locator('[data-testid=saved-meals-edit-toggle]').tap()
    # preview + adjust, then add to Lunch
    page.locator('[data-testid=saved-meal]').filter(has_text="morgenmad 1").locator('.saved-meal-main').tap()
    page.wait_for_selector('[data-testid=meal-sheet][data-mode=add]')
    page.locator('[data-amt-row="1"]').fill("250")
    page.evaluate("document.activeElement.blur()")
    shot("saved-meal-preview")
    k = page.locator('[data-testid=meal-sheet-kcal]').inner_text()
    page.locator('[data-testid=meal-sheet-add]').tap(); page.wait_for_timeout(200)
    lunch = page.locator('[data-testid=meal-lunch] [data-testid=food-item]')
    check(lunch.count() == 5, f"[{tag}] 5 items added to Lunch", lunch.count())
    check(page.locator('[data-testid=meal-kcal-lunch]').inner_text() == f"{k} kcal", f"[{tag}] lunch kcal matches preview", (k, page.locator('[data-testid=meal-kcal-lunch]').inner_text()))
    page.evaluate("document.querySelector('[data-testid=meal-lunch]').scrollIntoView({block:'start'}); document.querySelector('.content').scrollTop -= 70")
    shot("food-after-lunch")
    # saved meal unchanged by preview edits
    mm = [m for m in page.evaluate("window.VELA_FOOD.savedMeals()") if m["name"] == "morgenmad 1"][0]
    check(mm["items"][1]["amount"] == 200, f"[{tag}] preview tweaks don't change the saved meal")
    # breakfast still intact, training data untouched
    st = json.loads(page.evaluate("localStorage.getItem('vela-food-v1')"))
    t = page.evaluate("window.VELA_DATA.copenhagenYMD()")
    check([i["id"] for i in st["days"][t]["breakfast"]] == [i["id"] for i in food_before["days"][t]["breakfast"]], f"[{tag}] breakfast items untouched")
    fit_after = json.loads(page.evaluate("localStorage.getItem('vela-fitness-v1')"))
    fb = json.loads(fit_before)
    changed = [k2 for k2 in fb if k2 != "uiTab" and json.dumps(fb[k2], sort_keys=True) != json.dumps(fit_after.get(k2), sort_keys=True)]
    check(not changed, f"[{tag}] training data untouched", changed)
    check(not errors, f"[{tag}] no page errors", errors)
    b.close()

with sync_playwright() as p:
    run(p, 440, 956, "440", True)
    run(p, 375, 812, "375", False)
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
