"""VELA e2e v2: tracking sheet, greyed sets, select-all, history, overload signs."""
import functools
import http.server
import json
import os
import socketserver
import statistics
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v2"))
SHOTS.mkdir(parents=True, exist_ok=True)
THROTTLE = int(os.environ.get("CPU_THROTTLE", "6"))

fails = []

def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, (detail or "").strip())
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


INSTALL_METRICS = """() => {
  window.__typingMetrics = { longTasks: [], keyTimes: [], replacements: 0 };
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__typingMetrics.longTasks.push({ start: e.startTime, dur: e.duration });
      }
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch (err) {}
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.field) return;
    const t0 = performance.now();
    const same = el;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const dt = performance.now() - t0;
        const replaced = document.activeElement !== same;
        if (replaced) window.__typingMetrics.replacements += 1;
        window.__typingMetrics.keyTimes.push({
          dt, field: el.dataset.field, replaced,
          value: (document.activeElement && document.activeElement.value) || el.value
        });
      });
    });
  }, true);
}"""


def overflow(page):
    return page.evaluate("""() => {
      const app = document.getElementById('app');
      const bad = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) bad.push('html');
      if (document.body.scrollWidth > document.body.clientWidth + 1) bad.push('body');
      if (app && app.scrollWidth > app.clientWidth + 1) bad.push('app');
      return { bad };
    }""")


def seed_prior_session(page):
    """Write into the live app state so a pagehide flush cannot overwrite it."""
    page.evaluate("""() => {
      const s = window.VELA_DATA.get();
      s.history = s.history || {};
      s.history['seated-leg-curl'] = [{
        date: '2026-11-07',
        datetime: '2026-11-07T18:00:00.000Z',
        workout: 'Legs 2',
        week: 1,
        sessionId: 'prior-week',
        sets: [
          { reps: 8, weight: 50 },
          { reps: 8, weight: 50 },
          { reps: 8, weight: 50 }
        ]
      }];
      window.VELA_DATA.saveNow();
    }""")


def track_one(page, set_index, reps, weight):
    page.locator(f'[data-testid="set-chip-0-{set_index}"]').tap()
    page.wait_for_selector('[data-testid="sets-tracking"]')
    page.locator('[data-testid="reps-input"]').fill(str(reps))
    page.locator('[data-testid="weight-input"]').fill(str(weight))
    page.locator('[data-testid="track-reps"]').tap()
    page.wait_for_selector('[data-testid="sets-tracking"]', state="detached")
    # skip rest if it appears
    if page.locator('[data-testid="rest-timer"]').count():
        page.locator('button[data-action="skip-rest"]').tap()
        page.wait_for_selector('[data-testid="rest-timer"]', state="detached")



def choose_days_if_needed(page, days=4):
    """First-launch Bro Split setup must be dismissed so older tests reach the plan."""
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")
        page.wait_for_selector('[data-testid="week-plan"]')

def launch_context(p):
    browser = p.chromium.launch(
        executable_path="/usr/bin/google-chrome",
        args=["--no-sandbox"],
    )
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ),
    )
    return browser, context


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser, context = launch_context(p)
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        choose_days_if_needed(page)
        page.wait_for_selector('[data-testid="week-plan"]')

        text = page.inner_text("body")
        check("This Week's Plan" in text, "home title")
        check("Legs 2" in text, "legs 2 tile")
        check(page.locator("text=8 exercises · 60 mins").count() >= 1, "arms is 8 exercises")
        ov = overflow(page)
        check(not ov["bad"], "no horizontal overflow on home", json.dumps(ov["bad"]))

        # Seed last week's session into live state, then open Legs 2
        seed_prior_session(page)
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        body = page.inner_text("body")
        check("Seated Leg Curl" in body, "opens Legs 2")
        check("Standing Leg Curl" in body, "alt tab shows Standing Leg Curl")
        check("Exercises" in body, "Exercises heading")
        check(page.locator('[data-testid="workout-timer"]').count() == 1, "workout timer in header")
        check("8 reps" in page.locator('[data-testid="set-chip-0-0"]').inner_text(), "untracked chip shows 8 reps")
        check("chip pending" in (page.locator('[data-testid="set-chip-0-0"]').get_attribute("class") or ""), "untracked is accent pending")
        ov = overflow(page)
        check(not ov["bad"], "no horizontal overflow on workout", json.dumps(ov["bad"]))

        # Open tracking sheet, type 15 (instant, no jump), screenshot
        scroll0 = page.evaluate("() => document.getElementById('content').scrollTop")
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]')
        check(page.locator("text=Sets Tracking").count() >= 1, "Sets Tracking sheet opens")
        check(page.locator("text=Select the sets to track").count() >= 1, "select sets label")
        check(page.locator('[data-testid="select-all-sets"]').count() == 1, "Select All present")
        reps = page.locator('[data-testid="reps-input"]')
        check(reps.get_attribute("placeholder") in ("8", "8.0"), "reps placeholder is suggestion 8")
        wt = page.locator('[data-testid="weight-input"]')
        check("52.5" in (wt.get_attribute("placeholder") or ""), "weight placeholder is 52.5")
        scroll1 = page.evaluate("() => document.getElementById('content').scrollTop")
        check(abs(scroll1 - scroll0) < 40, "no scroll jump opening sheet", f"{scroll0}->{scroll1}")
        reps.type("15", delay=40)
        check(reps.input_value() == "15", "typed 15 reps", reps.input_value())
        focused = page.evaluate("() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.field")
        check(focused == "reps", "input kept focus while typing", str(focused))
        scroll2 = page.evaluate("() => document.getElementById('content').scrollTop")
        check(abs(scroll2 - scroll1) < 40, "no scroll jump while typing", f"{scroll1}->{scroll2}")
        page.screenshot(path=str(SHOTS / "tracking-sheet.png"), full_page=False)

        # Track just set 1 with 15 reps / 52 kg (progress vs 50)
        page.locator('[data-testid="weight-input"]').fill("52")
        page.locator('[data-testid="track-reps"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]', state="detached")
        if page.locator('[data-testid="rest-timer"]').count():
            page.locator('button[data-action="skip-rest"]').tap()
            page.wait_for_selector('[data-testid="rest-timer"]', state="detached")

        chip0 = page.locator('[data-testid="set-chip-0-0"]')
        check("logged" in (chip0.get_attribute("class") or ""), "logged set is greyed (logged class)")
        check("52.00kg x 15" in chip0.inner_text().replace(" ", "").replace("kgx", "kg x ") or "52.00kg x 15" in chip0.inner_text(), "logged chip shows 52.00kg x 15", chip0.inner_text())
        check(chip0.locator('[data-overload="up"]').count() == 1, "set 1 shows progressed up arrow")

        # Persist after reload
        page.reload(wait_until="networkidle")
        if page.locator('[data-testid="workout-tile-legs-2"]').count():
            page.locator('[data-testid="workout-tile-legs-2"]').tap()
            page.wait_for_selector('[data-testid="exercise-stack"]')
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        chip0 = page.locator('[data-testid="set-chip-0-0"]')
        check("52.00kg x 15" in chip0.inner_text() or "52.00kg" in chip0.inner_text(), "logged set persisted after reload", chip0.inner_text())
        check("logged" in (chip0.get_attribute("class") or ""), "still greyed after reload")

        # Track set 2 maintained 50x8, set 3 decreased 48x8
        track_one(page, 1, 8, 50)
        track_one(page, 2, 8, 48)
        chip1 = page.locator('[data-testid="set-chip-0-1"]')
        chip2 = page.locator('[data-testid="set-chip-0-2"]')
        check(chip1.locator('[data-overload="same"]').count() == 1, "set 2 maintained (=)")
        check(chip2.locator('[data-overload="down"]').count() == 1, "set 3 decreased (down)")
        check("logged" in (chip1.get_attribute("class") or "") and "logged" in (chip2.get_attribute("class") or ""), "sets 2 and 3 greyed")
        page.screenshot(path=str(SHOTS / "workout-greyed-signs.png"), full_page=False)

        # History screen lists prior session + signs
        page.locator('button[data-action="history"][data-ex="0"]').tap()
        page.wait_for_selector('[data-testid="history-sheet"]')
        hist = page.inner_text('[data-testid="history-sheet"]')
        check("7 Nov" in hist or "Nov" in hist, "history lists dates", hist[:200])
        check("50.00kg x 8" in hist or "50" in hist, "history shows prior sets")
        page.screenshot(path=str(SHOTS / "history.png"), full_page=False)
        page.locator('button[data-action="close-sheet"]').tap()

        # Select All: open a fresh exercise (Leg Extension, index 1) and track all
        page.locator('[data-testid="set-chip-1-0"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]')
        page.locator('[data-testid="select-all-sets"]').tap()
        on_count = page.evaluate("""() => document.querySelectorAll('[data-action=toggle-track-set].on').length""")
        check(on_count == 3, "Select All selects all three sets", str(on_count))
        page.locator('[data-testid="reps-input"]').fill("15")
        page.locator('[data-testid="weight-input"]').fill("70")
        page.locator('[data-testid="track-reps"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]', state="detached")
        if page.locator('[data-testid="rest-timer"]').count():
            page.locator('button[data-action="skip-rest"]').tap()
            page.wait_for_selector('[data-testid="rest-timer"]', state="detached")
        logged = page.evaluate("""() => [0,1,2].filter(i => document.querySelector(`[data-testid=set-chip-1-${i}]`).classList.contains('logged')).length""")
        check(logged == 3, "Select All + Track Reps logs all three sets", str(logged))
        check("70.00kg x 15" in page.locator('[data-testid="set-chip-1-0"]').inner_text(), "leg extension logged 70.00kg x 15")

        # Finish + next week keeps history
        page.locator('[data-testid="finish-workout"]').tap()
        page.wait_for_selector("text=Finish workout?")
        page.locator('button[data-confirm="ok"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="next-program"]').tap()
        page.wait_for_selector("text=Start week 2")
        page.locator('button[data-confirm="ok"]').tap()
        page.wait_for_selector("text=Week 2")
        check(page.locator("text=Week 2").count() >= 1, "advances to week 2")
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        # current week reset (untracked chips again)
        check("8 reps" in page.locator('[data-testid="set-chip-0-0"]').inner_text(), "week 2 resets set chips")
        page.locator('button[data-action="history"][data-ex="0"]').tap()
        page.wait_for_selector('[data-testid="history-sheet"]')
        hist2 = page.inner_text('[data-testid="history-sheet"]')
        check("50.00kg x 8" in hist2 or "50" in hist2, "prior week history kept after next program", hist2[:300])
        check("52.00kg x 15" in hist2 or "52.00" in hist2, "this week's finished session is in history", hist2[:300])
        page.locator('button[data-action="close-sheet"]').tap()

        # Input lag at 6x in the tracking sheet
        lag_page = context.new_page()
        client = lag_page.context.new_cdp_session(lag_page)
        client.send("Emulation.setCPUThrottlingRate", {"rate": THROTTLE})
        lag_page.goto(url, wait_until="networkidle")
        choose_days_if_needed(lag_page)
        lag_page.wait_for_timeout(200)
        if lag_page.locator('[data-testid="workout-tile-legs-2"]').count():
            lag_page.locator('[data-testid="workout-tile-legs-2"]').tap()
        lag_page.wait_for_selector('[data-testid="exercise-stack"]', timeout=5000)
        lag_page.evaluate(INSTALL_METRICS)
        lag_page.locator('[data-testid="set-chip-0-1"]').tap()
        lag_page.wait_for_selector('[data-testid="reps-input"]')
        inp = lag_page.locator('[data-testid="reps-input"]')
        inp.fill("")
        for ch in "15":
            inp.type(ch, delay=20)
            lag_page.wait_for_timeout(30)
        lag_page.wait_for_timeout(120)
        metrics = lag_page.evaluate("() => window.__typingMetrics")
        times = [k["dt"] for k in metrics.get("keyTimes", [])]
        replacements = metrics.get("replacements", 0)
        med = statistics.median(times) if times else None
        mx = max(times) if times else None
        print("lag metrics", {"n": len(times), "median_ms": med, "max_ms": mx, "replacements": replacements, "times": times})
        check(len(times) >= 1, "recorded keystroke timings", str(len(times)))
        if times:
            check(med <= 80, f"median keystroke ≤ 80ms at {THROTTLE}x throttle", f"{med:.1f}ms")
            check(mx <= 200, "no keystroke freeze > 200ms", f"{mx:.1f}ms")
        check(replacements == 0, "input element not replaced while typing", str(replacements))
        lag_page.close()
        browser.close()

    if fails:
        print("\nFAILED:", ", ".join(fails))
        sys.exit(1)
    print("\nAll e2e checks passed.")
    print("screenshots:", SHOTS)


if __name__ == "__main__":
    main()
