"""VELA v31: Smith Machine Back Squat and Smith Machine Front Squat in the catalog + demo photos."""
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

NEW = [
    ("Smith Machine Back Squat", "smith-machine-back-squat"),
    ("Smith Machine Front Squat", "smith-machine-front-squat"),
]


def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(
        viewport={"width": w, "height": h},
        screen={"width": w, "height": h},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
        user_agent=UA,
    )
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

    find = lambda n: page.evaluate(
        "(n) => { const C = window.VELA_CATALOG; const e = C.findExercise(n); const ph = C.photoFor(n); return e && { name: e.name, category: e.category, sub: e.sub, equipment: e.equipment, reps: e.defaultReps, weight: e.defaultWeight, tempo: e.tempo, photo: !!(ph && ph.frames && ph.frames[0]), src: ph && ph.frames && ph.frames[0] }; }",
        n,
    )

    # cache version
    ver = page.evaluate("() => ({ v: window.VELA_APP && window.VELA_APP.version, cache: document.querySelector('.settings-build') ? null : null })")
    # existing Smith Machine Squat is unchanged
    old = find("Smith Machine Squat")
    check(old and old["name"] == "Smith Machine Squat" and old["equipment"] == "Smith" and old["category"] == "Legs" and old["sub"] == "Quads", f"[{tag}] existing Smith Machine Squat unchanged", old)
    check(old and old["src"] and "smith-machine-squat/0.webp" in old["src"] and "back-squat" not in old["src"], f"[{tag}] existing squat still uses original photo", old)

    before = page.evaluate("JSON.stringify(window.VELA_DATA.get().workouts.map(w => w.exercises.map(e => e.name)))")
    for name, slug in NEW:
        r = find(name)
        check(r and r["category"] == "Legs" and r["sub"] == "Quads" and r["equipment"] == "Smith", f"[{tag}] {name} in catalog under Legs / Quads / Smith", r)
        check(r and r["reps"] == 10 and r["weight"] == 50 and r["tempo"] == [3, 1, 2, 1], f"[{tag}] {name} defaults match existing Smith squat", r)
        check(r and r["photo"] and f"{slug}/0.webp" in (r["src"] or ""), f"[{tag}] {name} has its own demo photo", r)
        check(name not in before, f"[{tag}] {name} not added to existing workouts automatically")

    # sw precache includes both new images and still includes the old ones
    assets = Path(ROOT / "sw.js").read_text()
    check('const CACHE = "vela-v31"' in assets, f"[{tag}] service worker cache is vela-v31")
    for _, slug in NEW:
        check(f"./img/exercises/{slug}/0.webp" in assets, f"[{tag}] SW precaches {slug}/0.webp")
    check("./img/exercises/smith-machine-squat/0.webp" in assets and "./img/exercises/smith-machine-squat/1.webp" in assets, f"[{tag}] SW still precaches existing Smith Machine Squat frames")

    # open Legs 2, add both from the picker, confirm photos
    page.locator('[data-testid="workout-tile-legs-2"]').tap()
    page.wait_for_selector('[data-testid="add-exercise"]')
    page.wait_for_timeout(300)

    for name, slug in NEW:
        page.locator('[data-testid="add-exercise"]').tap()
        page.wait_for_selector('[data-testid="exercise-picker"]')
        page.wait_for_timeout(200)
        page.locator('[data-testid="picker-search"]').fill(name)
        page.wait_for_timeout(300)
        item = page.locator(f'[data-testid="picker-item-{slug}"]')
        check(item.count() == 1, f"[{tag}] search finds {name}", item.count())
        # the other new exercise and the old squat should not all collapse incorrectly
        item.scroll_into_view_if_needed()
        page.wait_for_timeout(200)
        shot(f"{slug}-catalog-search")
        # thumb in the picker actually loaded
        loaded = page.evaluate(
            f"""() => {{
              const item = document.querySelector('[data-testid="picker-item-{slug}"]');
              const im = item && item.querySelector('img');
              return im && im.complete && im.naturalWidth > 0 && (im.src || '').includes('{slug}');
            }}"""
        )
        check(loaded, f"[{tag}] picker row shows the {name} photo")
        item.tap()
        page.wait_for_selector('[data-testid="exercise-picker"]', state="detached")
        page.wait_for_timeout(400)

        names = page.evaluate("window.VELA_DATA.get().workouts.find(w => w.id === 'legs-2').exercises.map(e => e.name)")
        check(name in names, f"[{tag}] added {name} to Legs 2", names)
        i = names.index(name)
        page.wait_for_selector(f'[data-testid="ex-demo-{i}"]')
        page.wait_for_function(
            f"(() => {{ const im = document.querySelector('[data-testid=ex-demo-{i}] img'); return im && im.complete && im.naturalWidth > 0 && im.src.includes('{slug}'); }})()"
        )
        check(True, f"[{tag}] workout tile shows the {name} photo")
        page.evaluate(f"document.querySelector('[data-testid=ex-demo-{i}]').scrollIntoView({{block:'center'}})")
        page.wait_for_timeout(300)
        shot(f"{slug}-tile")
        page.locator(f'[data-testid="ex-demo-{i}"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"]')
        page.wait_for_timeout(600)
        check(
            page.evaluate(
                f"[...document.querySelectorAll('[data-testid=exercise-demo] img')].some(i => i.src.includes('{slug}') && i.naturalWidth > 0)"
            ),
            f"[{tag}] demo sheet shows the {name} photo",
        )
        title = page.locator('[data-testid="exercise-demo"] h2').inner_text()
        check(title == name, f"[{tag}] demo title is {name}", title)
        shot(f"{slug}-demo")
        page.locator('[data-testid="close-demo"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"]', state="detached")

    check(not errors, f"[{tag}] no page errors", errors)
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "440")
    if os.environ.get("BOTH", "1") == "1":
        run(p, 375, 812, "375")
print("FAILS:", fails)
if fails:
    raise SystemExit(1)
