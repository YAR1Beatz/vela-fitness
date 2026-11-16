"""VELA v21: + Add workout on the Program tab's current-week page, same sheet as Home."""
import functools, http.server, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v21"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, str(detail).strip())
    if not ok:
        fails.append(label)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{httpd.server_address[1]}/"

SEED = """() => {
  const D = window.VELA_DATA;
  D.switchProgram('max-ot'); D.resetCycle(); D.advanceWeek();
  const chest = D.get().workouts.find(w => w.id === 'maxot-chest');
  D.updateSet(chest.id, 0, 0, { reps: 6, weight: 100, done: true });
  D.finishWorkout(chest.id); D.saveNow();
  return D.get().workouts.length;
}"""


def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True).new_page()
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    n = page.evaluate(SEED)
    check(n == 5, f"[{tag}] Max-OT week 2 has 5 days", n)
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=INSETS)
    page.locator('[data-testid="tab-program"]').tap()
    page.locator('[data-testid="week-card-1"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    check(page.locator('[data-testid="week-add-workout"]').count() == 0, f"[{tag}] no Add workout on a past week")
    page.locator('[data-testid="tab-program"]').tap()
    page.locator('[data-testid="week-card-2"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    btn = page.locator('[data-testid="week-add-workout"]')
    check(btn.count() == 1 and "Add workout" in btn.inner_text(), f"[{tag}] current week has + Add workout")
    style = page.evaluate("""() => { const a = document.querySelector('[data-testid=week-add-workout]');
        const h = document.querySelector('.plan-titles h1'); const ab = a.getBoundingClientRect(), hb = h.getBoundingClientRect();
        return { color: getComputedStyle(a).color, sameRow: Math.abs((ab.top+ab.bottom)/2 - (hb.top+hb.bottom)/2) < 14, right: ab.right <= innerWidth }; }""")
    check(style["color"] == "rgb(30, 224, 200)" and style["sameRow"] and style["right"], f"[{tag}] teal button beside the header", style)
    page.screenshot(path=str(SHOTS / f"week2-add{tag}.png"))
    btn.tap()
    page.wait_for_selector('[data-new-name]')
    check(page.locator('.sheet h2').first.inner_text() == "Add workout", f"[{tag}] opens the Home add-workout sheet")
    page.locator('[data-new-name]').fill("Mix")
    page.locator('[data-pick-list] .pick-item').nth(0).tap()
    page.locator('[data-pick-list] .pick-item').nth(3).tap()
    page.screenshot(path=str(SHOTS / f"add-sheet{tag}.png"))
    page.locator('[data-action="create-workout"]').tap()
    page.wait_for_timeout(300)
    names = page.evaluate("() => [...document.querySelectorAll('[data-testid=week-plan] .tile h2')].map(h => h.textContent)")
    hdr = page.locator('[data-testid="week-detail-pct"]').inner_text()
    check(page.evaluate("() => window.VELA_APP.view") == "program-week" and names[-1] == "Mix" and len(names) == 6,
          f"[{tag}] stays on the week page with Mix added", names)
    check("17%" in hdr, f"[{tag}] week % updates to 17% (1/6)", hdr)
    page.screenshot(path=str(SHOTS / f"week2-after-add{tag}.png"))
    page.locator('[data-testid="tab-program"]').tap()
    check(page.locator('[data-testid="week-pct-2"]').inner_text().startswith("17%"), f"[{tag}] week card 17%")
    page.locator('[data-testid="tab-home"]').tap()
    page.wait_for_timeout(200)
    sub = page.locator('[data-testid="streak-subtitle"]').inner_text()
    home_names = page.evaluate("() => [...document.querySelectorAll('[data-testid=week-plan] .tile h2')].map(h => h.textContent)")
    check("5 more" in sub and "Mix" in home_names, f"[{tag}] Home shows Mix and 5 more", (sub, home_names))
    page.screenshot(path=str(SHOTS / f"home-after-add{tag}.png"))
    page.locator('[data-testid="tab-settings"]').tap()
    page.wait_for_timeout(200)
    check(int(page.locator('[data-testid="app-version"] b').inner_text()) >= 21, f"[{tag}] version 21+")
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "")
    run(p, 375, 812, "-375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
