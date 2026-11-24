"""VELA v33 (draft): Machine Lateral Raise (Hammer Strength) in the catalog + demo photo and cues."""
import functools, http.server, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", ROOT / "drafts"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []

def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, "" if ok else detail)
    if not ok:
        fails.append(label)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = os.environ.get("URL") or f"http://127.0.0.1:{httpd.server_address[1]}/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
SLUG = "machine-lateral-raise"
NAME = "Machine Lateral Raise"


def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h},
                      device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")

    ver = page.evaluate("() => window.VELA_APP && window.VELA_APP.version")
    check(ver == "33", f"[{tag}] app version 33", ver)
    sw = Path(ROOT / "sw.js").read_text()
    check('const CACHE = "vela-v33"' in sw, f"[{tag}] service worker cache is vela-v33")
    check(f"./img/exercises/{SLUG}/0.webp" in sw, f"[{tag}] SW precaches {SLUG}/0.webp")

    find = lambda n: page.evaluate(
        """(n) => {
          const C = window.VELA_CATALOG;
          const e = C.findExercise(n);
          const ph = C.photoFor(n);
          return e && {
            name: e.name, category: e.category, equipment: e.equipment,
            reps: e.defaultReps, range: e.repsRange, weight: e.defaultWeight,
            tempo: e.tempo, note: e.note, cues: e.cues,
            photo: !!(ph && ph.frames && ph.frames[0]),
            src: ph && ph.frames && ph.frames[0]
          };
        }""",
        n,
    )

    r = find(NAME)
    check(r and r["category"] == "Shoulders" and r["equipment"] == "Machine", f"[{tag}] in catalog under Shoulders / Machine", r)
    check(r and r["reps"] == 12 and r["range"] == "10-15" and r["weight"] == 20 and r["tempo"] == [2, 0, 2, 1], f"[{tag}] defaults 12 reps (10–15), 20kg, tempo 2-0-2-1", r)
    check(r and r["note"] == "Hammer Strength", f"[{tag}] noted as Hammer Strength", r)
    check(r and isinstance(r["cues"], list) and len(r["cues"]) == 3, f"[{tag}] has three how-to cues", r and r.get("cues"))
    check(r and r["photo"] and f"{SLUG}/0.webp" in (r["src"] or ""), f"[{tag}] has its own demo photo", r)

    for alias in ["Hammer Strength Lateral Raise", "Hammer Strength Machine Lateral Raise", "Seated Machine Lateral Raise", "Lateral Raise Machine"]:
        a = find(alias)
        check(a and a["name"] == NAME, f"[{tag}] '{alias}' finds it", a)

    lr = find("Lateral Raise")
    cr = find("Cable Lateral Raise")
    check(lr and lr["name"] == "Lateral Raise" and lr["equipment"] == "Dumbbell", f"[{tag}] dumbbell Lateral Raise unchanged", lr)
    check(cr and cr["name"] == "Cable Lateral Raise" and cr["equipment"] == "Cable", f"[{tag}] Cable Lateral Raise unchanged", cr)

    before = page.evaluate("JSON.stringify(window.VELA_DATA.get().workouts.map(w => w.exercises.map(e => e.name)))")
    check(NAME not in before, f"[{tag}] not added to existing workouts automatically")

    # Open Arms, swap Lateral Raise — should be offered in the Shoulders list
    page.locator('[data-testid="workout-tile-arms"]').tap()
    page.wait_for_selector('[data-testid="set-chip-0-0"]')
    page.wait_for_timeout(300)
    names = page.evaluate("window.VELA_DATA.get().workouts.find(w => w.id === 'arms').exercises.map(e => e.name)")
    check("Lateral Raise" in names, f"[{tag}] Arms workout still has Lateral Raise", names)
    ri = names.index("Lateral Raise")
    page.evaluate(f"document.querySelector('[data-action=alt][data-ex=\"{ri}\"]').click()")
    page.wait_for_selector('[data-testid="exercise-picker"]')
    page.wait_for_timeout(200)
    page.locator('[data-testid="picker-search"]').fill("machine lateral")
    page.wait_for_timeout(300)
    item = page.locator(f'[data-testid="picker-item-{SLUG}"]')
    check(item.count() == 1, f"[{tag}] offered as an alternative when swapping Lateral Raise", item.count())
    # also findable as Hammer Strength
    page.locator('[data-testid="picker-search"]').fill("hammer strength")
    page.wait_for_timeout(300)
    # Hammer Curl might also match; the machine raise must be present
    check(page.locator(f'[data-testid="picker-item-{SLUG}"]').count() == 1, f"[{tag}] search 'hammer strength' finds it")
    item = page.locator(f'[data-testid="picker-item-{SLUG}"]')
    item.scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    if tag == "430":
        page.screenshot(path=str(SHOTS / "machine-lateral-raise-picker.png"))
    loaded = page.evaluate(
        f"""() => {{
          const item = document.querySelector('[data-testid="picker-item-{SLUG}"]');
          const im = item && item.querySelector('img');
          return im && im.complete && im.naturalWidth > 0 && (im.src || '').includes('{SLUG}');
        }}"""
    )
    check(loaded, f"[{tag}] picker row shows the photo")
    item.tap()
    page.wait_for_selector('[data-testid="exercise-picker"]', state="detached")
    page.wait_for_timeout(400)

    names = page.evaluate("window.VELA_DATA.get().workouts.find(w => w.id === 'arms').exercises.map(e => e.name)")
    check(names[ri] == NAME, f"[{tag}] swapped in for Lateral Raise", names)
    ex = page.evaluate(f"window.VELA_DATA.get().workouts.find(w => w.id === 'arms').exercises[{ri}]")
    check(ex.get("repsRange") == "10-15" and ex.get("suggestedReps") == 12, f"[{tag}] added with 10–15 range and 12 suggested reps", ex)

    page.wait_for_selector(f'[data-testid="ex-demo-{ri}"]')
    page.wait_for_function(
        f"(() => {{ const im = document.querySelector('[data-testid=ex-demo-{ri}] img'); return im && im.complete && im.naturalWidth > 0 && im.src.includes('{SLUG}'); }})()"
    )
    check(True, f"[{tag}] workout tile shows the photo")
    page.evaluate(f"document.querySelector('[data-testid=ex-demo-{ri}]').scrollIntoView({{block:'center'}})")
    page.wait_for_timeout(300)
    if tag == "430":
        page.screenshot(path=str(SHOTS / "machine-lateral-raise-tile.png"))

    page.locator(f'[data-testid="ex-demo-{ri}"]').tap()
    page.wait_for_selector('[data-testid="exercise-demo"]')
    page.wait_for_timeout(600)
    check(
        page.evaluate(
            f"[...document.querySelectorAll('[data-testid=exercise-demo] img')].some(i => i.src.includes('{SLUG}') && i.naturalWidth > 0)"
        ),
        f"[{tag}] demo sheet shows the photo",
    )
    title = page.locator('[data-testid="exercise-demo"] h2').inner_text()
    check(title == NAME, f"[{tag}] demo title is {NAME}", title)
    note = page.locator('[data-testid="exercise-note"]').inner_text()
    check(note == "Hammer Strength", f"[{tag}] demo note says Hammer Strength", note)
    cues = page.locator('[data-testid="exercise-cues"] li')
    check(cues.count() == 3, f"[{tag}] demo shows three how-to cues", cues.count())
    check("upper arms" in cues.nth(0).inner_text().lower(), f"[{tag}] first cue is about seat and pads", cues.nth(0).inner_text())
    if tag == "430":
        page.screenshot(path=str(SHOTS / "machine-lateral-raise-demo.png"))
    page.locator('[data-testid="close-demo"]').tap()
    page.wait_for_selector('[data-testid="exercise-demo"]', state="detached")

    check(not errors, f"[{tag}] no page errors", errors)
    b.close()


with sync_playwright() as p:
    # 430 is the requested screenshot viewport; also run the usual phone widths
    run(p, 430, 932, "430")
    if os.environ.get("BOTH", "1") == "1":
        run(p, 375, 812, "375")
print("FAILS:", fails)
if fails:
    raise SystemExit(1)
