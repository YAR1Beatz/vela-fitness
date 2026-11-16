"""VELA v26 (draft): food tracker. OFF API is mocked; screenshots go to draft-v26."""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/draft-v26"))
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

def nut(k, p, c, f): return {"energy-kcal_100g": k, "proteins_100g": p, "carbohydrates_100g": c, "fat_100g": f}
SEARCH = {"products": [
  {"code": "5701215031000", "product_name": "Skyr naturel 0,2%", "brands": "Arla", "nutriments": nut(57, 10.6, 3.9, 0.2), "serving_size": "150 g", "serving_quantity": 150},
  {"code": "5701215031001", "product_name": "Skyr vanilje", "brands": "Arla", "nutriments": nut(74, 9.1, 8.6, 0.2)},
  {"code": "5711953000000", "product_name": "Islandsk skyr blåbær", "brands": "Thise", "nutriments": nut(85, 8.5, 11, 0.4), "serving_size": "170 g", "serving_quantity": 170},
  {"code": "4016241030573", "product_name": "Skyr Natural Fat Free", "brands": "Arla", "nutriments": nut(63, 11, 4, 0.2)},
]}
PRODUCT = {"status": 1, "product": {"code": "5740900403376", "product_name": "Smørbar", "brands": "Lurpak", "nutriments": nut(707, 0.6, 0.7, 78), "serving_size": "5 g", "serving_quantity": 5}}

def route_off(route):
    u = route.request.url
    if "/cgi/search.pl" in u:
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(SEARCH))
    elif "/api/v2/product/5740900403376" in u:
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(PRODUCT))
    else:
        route.fulfill(status=404, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body='{"status":0}')

SEED = """() => {
  const D = window.VELA_DATA, F = window.VELA_FOOD;
  const t = D.copenhagenYMD();
  const add = (n) => { const d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  D.logBodyWeight(84.6, add(-20)); D.logBodyWeight(83.9, add(-6)); D.logBodyWeight(83.4, t);
  localStorage.removeItem('vela-food-v1'); F.reset();
  const food = (id, name, brand, k, p, c, f, sg) => ({ id, name, brand, per100: { kcal: k, p, c, f }, serving: sg ? { g: sg, label: sg + ' g' } : null, source: 'off' });
  const oats = food('off-1', 'Havregryn', 'Øllingegaard', 372, 13, 59, 7);
  const skyr = food('off-2', 'Skyr naturel 0,2%', 'Arla', 57, 10.6, 3.9, 0.2, 150);
  const banana = food('off-3', 'Banan', '', 89, 1.1, 20, 0.3, 120);
  const rugbrod = food('off-4', 'Rugbrød', 'Schulstad', 213, 6.5, 37, 2.5, 50);
  const chicken = food('off-5', 'Kyllingebryst', 'Danpo', 106, 23, 0, 1.5);
  const rice = food('off-6', 'Jasminris, kogt', '', 130, 2.7, 28, 0.3);
  const whey = food('off-7', 'Whey protein vanilla', 'Bodylab', 380, 75, 7, 6, 30);
  const L = (d, m, f, a, u) => F.logFood(d, m, f, a, u || 'g');
  for (let i = 1; i <= 29; i++) {
    if (i % 6 === 3) continue;
    const d = add(-i), j = (i * 37) % 11;
    L(d, 'breakfast', oats, 70 + j * 3); L(d, 'breakfast', skyr, 1, 'serving');
    L(d, 'lunch', rugbrod, 3, 'serving'); L(d, 'lunch', chicken, 120 + j * 5);
    L(d, 'dinner', chicken, 180); L(d, 'dinner', rice, 220 + j * 15);
    if (i % 2) L(d, 'snacks', whey, 1, 'serving');
    if (i % 3 === 0) F.addItem(d, 'snacks', { quick: true, name: 'Dessert', kcal: 420, p: 6, c: 55, f: 19 });
  }
  L(t, 'breakfast', oats, 80); L(t, 'breakfast', skyr, 1, 'serving'); L(t, 'breakfast', banana, 1, 'serving');
  L(t, 'lunch', rugbrod, 3, 'serving'); L(t, 'lunch', chicken, 150);
  F.addItem(t, 'snacks', { quick: true, name: 'Coffee with milk', kcal: 45, p: 2, c: 4, f: 2 });
  L(t, 'snacks', whey, 1, 'serving');
  const s = F.load(); s.favourites = ['off-2', 'off-7'];
  F.saveCustomFood({ name: 'Mum’s lasagne', basis: 'serving', servingG: 350, kcal: 610, p: 34, c: 52, f: 28 });
  F.save();
  D.saveNow && D.saveNow();
}"""

def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    c.grant_permissions(["camera"], origin=URL)
    c.route("https://world.openfoodfacts.org/**", route_off)
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    before = page.evaluate("localStorage.getItem('vela-fitness-v1')")
    page.evaluate(SEED)
    after = json.loads(page.evaluate("localStorage.getItem('vela-fitness-v1')"))
    page.reload(wait_until="networkidle")
    ins = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"
    page.add_style_tag(content=ins)
    sfx = "" if tag == "440" else f"-{tag}"
    def shot(n):
        page.evaluate("document.getElementById('toast').classList.add('hidden')")
        page.screenshot(path=str(SHOTS / f"{n}{sfx}.png"))

    # Home card under body weight
    order = page.evaluate("""() => { const w = document.querySelector('[data-testid=weight-card]'), f = document.querySelector('[data-testid=food-card]');
        return !!(w && f && (w.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && w.nextElementSibling === f); }""")
    check(order, f"[{tag}] food card directly under Body weight")
    check(page.locator('[data-testid=tab-bar] .tab-btn').count() == 5, f"[{tag}] still 5 tabs")
    page.evaluate("document.querySelector('[data-testid=weight-card]').scrollIntoView({block:'start'})")
    page.evaluate("document.querySelector('.content').scrollTop -= 12")
    page.wait_for_timeout(150)
    shot("home-food-card")
    kc = page.locator('[data-testid=food-card] [data-testid=food-kcal-eaten]').inner_text()
    check(kc.isdigit() or "." in kc, f"[{tag}] kcal shown on card", kc)

    # Food page
    page.locator('[data-testid=food-card-open]').tap()
    page.wait_for_selector('[data-testid=food-page]')
    page.wait_for_timeout(150)
    check(page.locator('[data-testid=day-label]').inner_text() == "Today", f"[{tag}] day defaults to today")
    check(page.locator('[data-testid=food-item]').count() == 7, f"[{tag}] 7 sample items today", page.locator('[data-testid=food-item]').count())
    check("on" in page.locator('[data-testid=tab-home]').get_attribute("class"), f"[{tag}] Home tab stays active on Food page")
    shot("food-day")
    page.evaluate("document.querySelector('.content').scrollTop = 1e6"); page.wait_for_timeout(120)
    shot("food-day-scrolled")
    page.evaluate("document.querySelector('.content').scrollTop = 0")
    # Edit mode
    page.locator('[data-testid=food-edit-toggle]').tap(); page.wait_for_timeout(100)
    check(page.locator('[data-testid=food-item-delete]').count() == 7, f"[{tag}] Edit shows Edit/Delete")
    shot("food-day-edit")
    page.locator('[data-testid=food-item-delete]').first.tap(); page.wait_for_timeout(100)
    check(page.locator('[data-testid=food-item]').count() == 6, f"[{tag}] delete removes item")
    page.locator('#toast [data-toast-action]').tap(); page.wait_for_timeout(100)
    check(page.locator('[data-testid=food-item]').count() == 7, f"[{tag}] undo restores item")
    page.locator('[data-testid=food-edit-toggle]').tap()
    # previous day
    page.locator('[data-testid=prev-day]').tap(); page.wait_for_timeout(100)
    check(page.locator('[data-testid=day-label]').inner_text() == "Yesterday", f"[{tag}] previous day")
    page.locator('[data-testid=next-day]').tap(); page.wait_for_timeout(100)

    # Add food search (mocked)
    page.locator('[data-testid=add-food-dinner]').tap()
    page.wait_for_selector('[data-testid=add-food-sheet]')
    page.locator('[data-testid=food-search-input]').fill("skyr")
    page.locator('[data-testid=food-search-go]').tap()
    page.wait_for_selector('[data-testid=food-result]')
    page.wait_for_timeout(150)
    check(page.locator('[data-testid=food-result]').count() == 4, f"[{tag}] 4 search results")
    page.evaluate("document.activeElement && document.activeElement.blur()")
    shot("add-food-search")
    page.locator('[data-testid=food-result]').first.tap()
    page.wait_for_selector('[data-testid=amount-sheet]')
    page.locator('[data-testid=amount-input]').fill("200")
    page.wait_for_timeout(80)
    check(page.locator('[data-testid=amount-kcal]').inner_text() == "114", f"[{tag}] 200 g skyr = 114 kcal", page.locator('[data-testid=amount-kcal]').inner_text())
    page.evaluate("document.activeElement && document.activeElement.blur()")
    shot("add-food-amount")
    page.locator('[data-testid=amount-save]').tap(); page.wait_for_timeout(150)
    check(page.locator('[data-testid=meal-dinner] [data-testid=food-item]').count() == 1, f"[{tag}] skyr logged to dinner")

    # Barcode screen (fake camera) + manual lookup
    page.locator('[data-testid=add-food-snacks]').tap()
    page.wait_for_selector('[data-testid=add-food-sheet]')
    page.locator('[data-testid=open-scan]').tap()
    page.wait_for_selector('[data-testid=scan-sheet]')
    page.wait_for_timeout(1500)
    shot("barcode")
    page.locator('[data-testid=barcode-input]').fill("5740900403376")
    page.locator('[data-testid=barcode-go]').tap()
    page.wait_for_selector('[data-testid=amount-sheet]')
    check("Smørbar" in page.locator('[data-testid=amount-sheet] h2').inner_text(), f"[{tag}] barcode lookup finds product")
    page.locator('[data-testid=close-add-food], [data-food=back-to-add]').first.tap()
    page.wait_for_timeout(100)
    page.evaluate("window.VELA_APP.closeSheet()")

    # Recent / favourites tabs
    page.locator('[data-testid=add-food-snacks]').tap()
    page.locator('[data-testid=add-tab-fav]').tap(); page.wait_for_timeout(80)
    check(page.locator('[data-testid=food-result]').count() == 2, f"[{tag}] 2 favourites")
    page.locator('[data-testid=add-tab-mine]').tap(); page.wait_for_timeout(80)
    shot("add-food-myfoods")
    page.evaluate("window.VELA_APP.closeSheet()")

    # Targets sheet from food page
    page.locator('[data-testid=food-targets]').tap()
    page.wait_for_selector('[data-testid=targets-sheet]')
    sug = page.locator('[data-testid=target-suggest]').inner_text()
    check("83,4 kg" in sug and "167 g" in sug, f"[{tag}] suggestion from latest weight (2 g/kg)", sug)
    shot("targets-food")
    page.evaluate("window.VELA_APP.closeSheet()")
    # Settings targets
    page.locator('[data-testid=tab-settings]').tap(); page.wait_for_timeout(150)
    page.evaluate("document.querySelector('[data-testid=settings-food]').scrollIntoView({block:'start'})")
    page.evaluate("document.querySelector('.content').scrollTop -= 12")
    page.wait_for_timeout(100)
    shot("targets-settings")
    # Progress chart
    page.locator('[data-testid=tab-progress]').tap(); page.wait_for_timeout(150)
    shot("chart-7d")
    page.locator('[data-testid=food-chart-30]').tap(); page.wait_for_timeout(150)
    shot("chart-30d")

    final = json.loads(page.evaluate("localStorage.getItem('vela-fitness-v1')"))
    keys_changed = [k for k in after if k != "uiTab" and json.dumps(after[k], sort_keys=True) != json.dumps(final.get(k), sort_keys=True)]
    check(not keys_changed, f"[{tag}] food logging never changed training data", keys_changed)
    check(not errors, f"[{tag}] no page errors", errors)
    b.close()

with sync_playwright() as p:
    run(p, 440, 956, "440")
    if os.environ.get("BOTH"): run(p, 375, 812, "375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
