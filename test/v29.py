"""VELA v29 (draft): Reverse Pec Deck (Machine) in the catalog + demo photo."""
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


def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    sfx = "" if tag == "440" else f"-{tag}"
    def shot(n):
        page.wait_for_timeout(250)
        page.screenshot(path=str(SHOTS / f"{n}{sfx}.png"))
    find = lambda n: page.evaluate("(n) => { const C = window.VELA_CATALOG; const e = C.findExercise(n); return e && { name: e.name, category: e.category, equipment: e.equipment, reps: e.defaultReps, range: e.repsRange, tempo: e.tempo, photo: !!C.photoFor(n) }; }", n)
    r = find("Reverse Pec Deck (Machine)")
    check(r and r["category"] == "Shoulders" and r["equipment"] == "Machine", f"[{tag}] in catalog under Shoulders / Machine", r)
    check(r and r["range"] == "12-15" and r["reps"] == 12 and r["tempo"] == [2, 0, 2, 1], f"[{tag}] defaults 12–15 reps, tempo 2-0-2-1", r)
    check(r and r["photo"], f"[{tag}] has a demo photo")
    for alias in ["Reverse Pec Dec (Machine)", "Reverse Pec Deck", "Machine Rear Delt Fly"]:
        a = find(alias)
        check(a and a["name"] == "Reverse Pec Deck (Machine)", f"[{tag}] '{alias}' finds it", a)
    check(find("Pec Deck")["name"] == "Pec Deck", f"[{tag}] plain Pec Deck (chest) unchanged")
    before = page.evaluate("JSON.stringify(window.VELA_DATA.get().workouts.map(w => w.exercises.map(e => e.name)))")
    check("Reverse Pec Deck" not in before, f"[{tag}] not added to existing workouts automatically")
    # open the Biceps, Triceps & Delts workout and swap Rear Delt Fly
    page.locator('[data-testid="workout-tile-arms"]').tap(); page.wait_for_selector('[data-testid="set-chip-0-0"]'); page.wait_for_timeout(300)
    names = page.evaluate("window.VELA_DATA.get().workouts.find(w => w.id === 'arms').exercises.map(e => e.name)")
    ri = names.index("Rear Delt Fly")
    page.evaluate(f"document.querySelector('[data-action=alt][data-ex=\"{ri}\"]').click()")
    page.wait_for_selector('[data-testid="exercise-picker"]'); page.wait_for_timeout(300)
    item = page.locator('[data-testid="picker-item-reverse-pec-deck-machine"]')
    check(item.count() == 1, f"[{tag}] offered as an alternative to Rear Delt Fly (Shoulders list)")
    item.scroll_into_view_if_needed(); page.wait_for_timeout(200)
    page.wait_for_function("(() => { const i = document.querySelector('[data-testid=picker-item-reverse-pec-deck-machine] img'); return i && i.complete && i.naturalWidth > 0; })()")
    # put it near the top of the visible list for the screenshot
    page.evaluate("(() => { const it = document.querySelector('[data-testid=picker-item-reverse-pec-deck-machine]'); const sc = it.closest('.sheet-body'); if (sc) sc.scrollTop = it.offsetTop - sc.offsetTop - 220; })()")
    shot("reverse-pec-deck-alternatives")
    page.locator('[data-testid="exercise-picker"] [data-action=close-sheet]').first.tap(); page.wait_for_timeout(350)
    # add it to the workout from the library
    page.evaluate("document.querySelector('[data-testid=add-exercise]').click()")
    page.wait_for_selector('[data-testid="exercise-picker"]'); page.wait_for_timeout(250)
    page.locator('[data-testid="picker-search"]').fill("reverse pec"); page.wait_for_timeout(300)
    vis = page.evaluate("[...document.querySelectorAll('[data-pick-list] .pick-item strong')].map(s => s.textContent)")
    check(vis == ["Reverse Pec Deck (Machine)"], f"[{tag}] search 'reverse pec' finds it", vis)
    shot("reverse-pec-deck-catalog-search")
    page.locator('[data-testid="picker-item-reverse-pec-deck-machine"]').tap(); page.wait_for_timeout(400)
    wk = page.evaluate("window.VELA_DATA.get().workouts.find(w => w.id === 'arms')")
    ex = wk["exercises"][-1]
    check(ex["name"] == "Reverse Pec Deck (Machine)", f"[{tag}] added to the workout", ex["name"])
    check(len(ex["sets"]) == 3 and ex["suggestedReps"] == 12 and ex["repsRange"] == "12-15" and ex["tempo"] == [2, 0, 2, 1], f"[{tag}] added with 3 sets, 12 reps, 12–15 range, tempo 2-0-2-1", (len(ex["sets"]), ex["suggestedReps"], ex["repsRange"], ex["tempo"]))
    i = len(wk["exercises"]) - 1
    page.wait_for_selector(f'[data-testid="ex-demo-{i}"]')
    page.wait_for_function(f"(() => {{ const im = document.querySelector('[data-testid=ex-demo-{i}] img'); return im && im.complete && im.naturalWidth > 0 && im.src.includes('reverse-pec-deck-machine'); }})()")
    check(True, f"[{tag}] tile shows the photo")
    aim = page.evaluate(f"(document.querySelector('[data-chips=\"{i}\"]') || document.body).closest('.ex-card, .card, [data-ex-block], section, article')?.textContent || ''")
    check("12–15 reps" in aim, f"[{tag}] tile says Aim for 12–15 reps", aim[:200])
    page.evaluate(f"document.querySelector('[data-testid=ex-demo-{i}]').scrollIntoView({{block:'center'}})"); page.wait_for_timeout(300)
    shot("reverse-pec-deck-tile")
    page.locator(f'[data-testid="ex-demo-{i}"]').tap(); page.wait_for_selector('[data-testid="exercise-demo"]'); page.wait_for_timeout(600)
    check(page.evaluate("[...document.querySelectorAll('[data-testid=exercise-demo] img')].some(i => i.src.includes('reverse-pec-deck-machine') && i.naturalWidth > 0)"), f"[{tag}] demo sheet shows the photo")
    shot("reverse-pec-deck-demo")
    check(not errors, f"[{tag}] no page errors", errors)
    b.close()

with sync_playwright() as p:
    run(p, 440, 956, "440")
    if os.environ.get("BOTH", "1") == "1":
        run(p, 375, 812, "375")
print("FAILS:", fails)
