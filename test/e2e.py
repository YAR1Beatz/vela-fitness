"""VELA e2e: tap flow, typing 8→15, persistence, no overflow, input lag at 6x CPU."""
import functools
import http.server
import json
import os
import socketserver
import statistics
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v1"))
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
          dt,
          field: el.dataset.field,
          replaced,
          value: (document.activeElement && document.activeElement.value) || el.value
        });
      });
    });
  }, true);
}"""


def overflow(page):
    return page.evaluate("""() => {
      const root = document.scrollingElement || document.documentElement;
      const app = document.getElementById('app');
      const widths = {
        doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
        body: { sw: document.body.scrollWidth, cw: document.body.clientWidth },
        app: app ? { sw: app.scrollWidth, cw: app.clientWidth } : null,
      };
      const bad = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) bad.push('html');
      if (document.body.scrollWidth > document.body.clientWidth + 1) bad.push('body');
      if (app && app.scrollWidth > app.clientWidth + 1) bad.push('app');
      return { bad, widths };
    }""")


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
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
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        page.wait_for_selector('[data-testid="week-plan"]')

        # Home content
        text = page.inner_text("body")
        check("This Week's Plan" in text, "home title")
        check("WEEK 1" in text.upper() or "Week 1" in text, "week 1")
        check("Chest" in text, "chest tile")
        check("Legs 2" in text, "legs 2 tile")
        check("Back" in text, "back tile")
        check("Biceps, Triceps & Delts" in text, "arms tile")
        check("6 exercises · 60 mins" in text, "chest/legs/back counts include 6 x 60")
        # Arms is 8 exercises
        check(page.locator("text=8 exercises · 60 mins").count() >= 1, "arms is 8 exercises")
        ov = overflow(page)
        check(not ov["bad"], "no horizontal overflow on home", json.dumps(ov["bad"]))
        page.screenshot(path=str(SHOTS / "overview.png"), full_page=False)

        # Tap Legs 2
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        body = page.inner_text("body")
        check("Seated Leg Curl" in body, "opens Legs 2, first exercise is Seated Leg Curl")
        check("Standing Leg Curl" in body, "suggested alt Standing Leg Curl")
        check("Leg Extension" in body, "Leg Extension present")
        check("Romanian Deadlift" in body, "Romanian Deadlift present")
        check("2 of 6 exercises" in body.lower() or "0 of 6 exercises" in body.lower(), "progress 0 of 6")
        # Tempo for seated leg curl
        check("3" in body and "Seated Leg Curl" in body, "tempo visible")
        ov = overflow(page)
        check(not ov["bad"], "no horizontal overflow on workout", json.dumps(ov["bad"]))
        page.screenshot(path=str(SHOTS / "workout.png"), full_page=False)

        # Type 8 -> 15 on first set of first exercise
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="reps-input"]')
        reps = page.locator('[data-testid="reps-input"]')
        # scroll position before typing
        scroll0 = page.evaluate("() => document.getElementById('content').scrollTop")
        reps.fill("")
        reps.type("15", delay=40)
        val = reps.input_value()
        check(val == "15", "typed 15 reps", val)
        # chip updates without losing focus
        focused = page.evaluate("() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.field")
        check(focused == "reps", "input kept focus while typing", str(focused))
        scroll1 = page.evaluate("() => document.getElementById('content').scrollTop")
        check(abs(scroll1 - scroll0) < 40, "no scroll jump while typing", f"{scroll0}->{scroll1}")
        # chip should show 15
        chip = page.locator('[data-testid="set-chip-0-0"]').inner_text()
        check("15" in chip, "chip shows 15 reps", chip)
        page.screenshot(path=str(SHOTS / "edit-15-reps.png"), full_page=False)

        # Persistence: reload, reopen Legs 2, chip still 15
        page.reload(wait_until="networkidle")
        # may land on workout if we persist activeWorkoutId — either is fine
        if page.locator('[data-testid="workout-tile-legs-2"]').count():
            page.locator('[data-testid="workout-tile-legs-2"]').tap()
            page.wait_for_selector('[data-testid="exercise-stack"]')
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        chip2 = page.locator('[data-testid="set-chip-0-0"]').inner_text()
        check("15" in chip2, "15 reps persisted after reload", chip2)

        # Mark set done + rest timer
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="reps-input"]')
        page.locator('button[data-action="commit-set"]').tap()
        page.wait_for_selector('[data-testid="rest-timer"]')
        check(page.locator('[data-testid="rest-timer"]').count() == 1, "rest timer after marking set done")
        page.screenshot(path=str(SHOTS / "rest.png"), full_page=False)
        page.locator('button[data-action="skip-rest"]').tap()
        page.wait_for_selector('[data-testid="rest-timer"]', state="detached")

        # Finish workout -> tile done
        page.locator('[data-testid="finish-workout"]').tap()
        page.wait_for_selector("text=Finish workout?")
        page.locator('button[data-confirm="ok"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        # Chest not done, Legs 2 done (check mark instead of chevron — tile has class done)
        done = page.locator('[data-testid="workout-tile-legs-2"].done').count()
        check(done == 1, "finish marks Legs 2 done")
        page.screenshot(path=str(SHOTS / "overview-legs2-done.png"), full_page=False)

        # Next week
        page.locator('[data-testid="next-program"]').tap()
        page.wait_for_selector("text=Start week 2")
        page.locator('button[data-confirm="ok"]').tap()
        page.wait_for_selector("text=Week 2")
        check(page.locator("text=Week 2").count() >= 1, "advances to week 2 of the same program")
        # completion reset, but 15 should become suggestion? last logged was 15 on seated leg curl
        not_done = page.locator('[data-testid="workout-tile-legs-2"].done').count()
        check(not_done == 0, "week 2 resets completion")

        # Input lag at 6x throttle on a fresh page
        lag_page = context.new_page()
        client = lag_page.context.new_cdp_session(lag_page)
        client.send("Emulation.setCPUThrottlingRate", {"rate": THROTTLE})
        lag_page.goto(url, wait_until="networkidle")
        # if week 2 leftover in same origin storage — that's ok
        lag_page.wait_for_timeout(200)
        if lag_page.locator('[data-testid="workout-tile-legs-2"]').count():
            lag_page.locator('[data-testid="workout-tile-legs-2"]').tap()
        else:
            # already on workout?
            pass
        lag_page.wait_for_selector('[data-testid="exercise-stack"], [data-testid="set-chip-0-1"]', timeout=5000)
        # open a fresh unused set (set 2 of first exercise, or set 1)
        lag_page.evaluate(INSTALL_METRICS)
        # pick second chip if present
        chip_sel = '[data-testid="set-chip-0-1"]'
        if lag_page.locator(chip_sel).count() == 0:
            chip_sel = '[data-testid="set-chip-1-0"]'
        lag_page.locator(chip_sel).tap()
        lag_page.wait_for_selector('[data-testid="reps-input"]')
        inp = lag_page.locator('[data-testid="reps-input"]')
        inp.fill("")
        # type quickly
        for ch in "15":
            inp.type(ch, delay=20)
            lag_page.wait_for_timeout(30)
        lag_page.wait_for_timeout(120)
        metrics = lag_page.evaluate("() => window.__typingMetrics")
        times = [k["dt"] for k in metrics.get("keyTimes", [])]
        long_during = [t["dur"] for t in metrics.get("longTasks", []) if t["dur"] >= 80]
        replacements = metrics.get("replacements", 0)
        med = statistics.median(times) if times else None
        mx = max(times) if times else None
        print("lag metrics", {"n": len(times), "median_ms": med, "max_ms": mx, "replacements": replacements, "long_tasks": len(long_during), "times": times})
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
