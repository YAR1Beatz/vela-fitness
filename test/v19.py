"""VELA v19: each week page shows only its own sessions; Delete hidden until swiped."""
import functools, http.server, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v19"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, str(detail or "").strip())
    if not ok:
        fails.append(label)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start_server():
    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


SEED = """() => {
  const D = window.VELA_DATA;
  D.switchProgram('max-ot');
  D.resetCycle();
  D.advanceWeek();                       // now Week 2, nothing logged in Week 1
  const ws = D.get().workouts;
  [ws[0], ws[1]].forEach((w) => {
    D.updateSet(w.id, 0, 0, { reps: 6, weight: 100, done: true });
    D.finishWorkout(w.id);
  });
  D.saveNow();
  return { week: D.get().week, ids: ws.map(w => w.id), names: ws.map(w => w.name), done: [ws[0].id, ws[1].id] };
}"""


def visible_deletes(page):
    return page.evaluate("""() => [...document.querySelectorAll('.swipe-actions')]
      .filter(b => getComputedStyle(b).visibility !== 'hidden' && b.offsetParent !== null).length""")


def swipe(page, sel):
    box = page.locator(sel).bounding_box()
    y = box["y"] + box["height"] / 2
    x0 = box["x"] + box["width"] - 30
    page.mouse.move(x0, y)
    page.mouse.down()
    for i in range(1, 11):
        page.mouse.move(x0 - i * 14, y)
    return box


def run(p, width, height, tag):
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=3,
                              is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    info = page.evaluate(SEED)
    check(info["week"] == 2, f"[{tag}] seeded on week 2", info)
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=INSETS)
    page.locator('[data-testid="tab-program"]').tap()
    page.wait_for_selector('[data-testid="week-list"]')
    p1 = page.locator('[data-testid="week-pct-1"]').inner_text()
    p2 = page.locator('[data-testid="week-pct-2"]').inner_text()
    check(p1.startswith("0%"), f"[{tag}] overview week 1 is 0%", p1)
    check(p2.startswith("40%"), f"[{tag}] overview week 2 is 40%", p2)
    page.screenshot(path=str(SHOTS / f"program-overview{tag}.png"))

    # Week 1: nothing logged, no checks, no Delete
    page.locator('[data-testid="week-card-1"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    st = page.evaluate("""() => [...document.querySelectorAll('[data-testid=week-plan] .swipe-row')].map(r => ({
        id: r.dataset.id, state: r.dataset.weekState, done: !!r.querySelector('.tile.done'),
        check: !!r.querySelector('.mark[aria-label=Done]'), text: r.querySelector('.meta p').textContent,
        del: !!r.querySelector('.swipe-actions') }))""")
    check(len(st) == 5, f"[{tag}] week 1 lists the 5 Max-OT days", len(st))
    check(all(not r["done"] and not r["check"] for r in st), f"[{tag}] week 1 shows no logged checks", st)
    check(all("Not logged" in r["text"] for r in st), f"[{tag}] week 1 rows say Not logged", [r["text"] for r in st])
    check(all(not r["del"] for r in st), f"[{tag}] week 1 rows have no Delete action", st)
    check(visible_deletes(page) == 0, f"[{tag}] no Delete visible on week 1")
    page.screenshot(path=str(SHOTS / f"week1{tag}.png"))
    page.go_back() if False else page.locator('[data-testid="tab-program"]').tap()
    page.wait_for_selector('[data-testid="week-list"]')

    # Week 2 (current): exactly the two logged
    page.locator('[data-testid="week-card-2"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    done_ids = page.evaluate("() => [...document.querySelectorAll('[data-testid=week-plan] .tile.done')].map(t => t.closest('.swipe-row').dataset.id)")
    check(sorted(done_ids) == sorted(info["done"]), f"[{tag}] week 2 shows its 2 logged workouts", done_ids)
    check(visible_deletes(page) == 0, f"[{tag}] Delete hidden at rest on week 2", visible_deletes(page))
    page.screenshot(path=str(SHOTS / f"week2-rest{tag}.png"))
    target = info["ids"][3]
    sel = f'.swipe-row[data-id="{target}"]'
    swipe(page, sel)
    check(visible_deletes(page) == 1, f"[{tag}] Delete appears while swiping", visible_deletes(page))
    page.mouse.up()
    page.wait_for_timeout(300)
    opened = page.evaluate(f"() => document.querySelector('{sel}').classList.contains('open')")
    check(opened and visible_deletes(page) == 1, f"[{tag}] row stays open with Delete after swipe")
    page.screenshot(path=str(SHOTS / f"week2-swiped{tag}.png"))

    # Advance to week 3: week 2 becomes a past week with its own two sessions, week 1 still empty
    page.evaluate("() => window.VELA_DATA.advanceWeek()")
    page.locator('[data-testid="tab-program"]').tap()
    page.wait_for_selector('[data-testid="week-list"]')
    page.locator('[data-testid="week-card-2"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    rows = page.evaluate("""() => [...document.querySelectorAll('[data-testid=week-plan] .swipe-row')].map(r => ({id: r.dataset.id, s: r.dataset.weekState}))""")
    logged = sorted(r["id"] for r in rows if r["s"] == "logged")
    check(logged == sorted(info["done"]), f"[{tag}] past week 2 shows only its 2 sessions", rows)
    check(visible_deletes(page) == 0, f"[{tag}] no Delete on past week 2")
    page.screenshot(path=str(SHOTS / f"week2-past{tag}.png"))
    page.locator('[data-testid="tab-program"]').tap()
    page.locator('[data-testid="week-card-1"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    n = page.evaluate("() => document.querySelectorAll('[data-testid=week-plan] .tile.done').length")
    check(n == 0, f"[{tag}] week 1 still empty after week 3 starts", n)
    page.locator('[data-testid="tab-settings"]').tap()
    page.wait_for_timeout(200)
    ver = page.locator('[data-testid="app-version"] b').inner_text()
    check(ver == "19", f"[{tag}] settings shows version 19", ver)
    browser.close()


httpd, URL = start_server()
with sync_playwright() as p:
    run(p, 440, 956, "")
    run(p, 375, 812, "-375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
