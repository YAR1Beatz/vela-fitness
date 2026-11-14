"""VELA v9: bottom tab bar, Program screen, change program, week %."""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v9"))
SHOTS.mkdir(parents=True, exist_ok=True)

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


def choose_days_if_needed(page, days=4):
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")


def shot(page, name):
    path = SHOTS / name
    page.screenshot(path=str(path), full_page=False)
    print("shot", path)


def seed_cycle(page):
    return page.evaluate(
        """() => {
      const D = window.VELA_DATA;
      const s = D.get();
      s.week = 3;
      s.history = s.history || {};
      s.sessions = [];
      const mk = (week, workoutId, name, date, vol, dur, sets) => {
        const sessionId = 'ses-w' + week + '-' + workoutId;
        (sets || []).forEach((row) => {
          if (!s.history[row.key]) s.history[row.key] = [];
          s.history[row.key].unshift({
            date, datetime: date + 'T18:00:00.000Z',
            workout: name, workoutId, week, programId: s.activeProgramId,
            sessionId, sets: row.sets
          });
        });
        s.sessions.unshift({
          programId: s.activeProgramId, workoutId, workoutName: name, week,
          sessionId, date, datetime: date + 'T18:00:00.000Z',
          durationMs: dur, volumeKg: vol, completed: true
        });
      };
      const curl = [{reps:8,weight:50},{reps:8,weight:50},{reps:8,weight:50}];
      const bench = [{reps:8,weight:60},{reps:8,weight:60},{reps:8,weight:60}];
      // Week 1: 3 of 4
      mk(1, 'chest', 'Chest', '2026-10-26', 1440, 50*60000, [{key:'barbell-bench-press', sets:bench}]);
      mk(1, 'legs-2', 'Legs 2', '2026-10-27', 1200, 45*60000, [{key:'seated-leg-curl', sets:curl}]);
      mk(1, 'back', 'Back', '2026-10-28', 1000, 40*60000, [{key:'lat-pulldown', sets:curl}]);
      // Week 2: 4 of 4
      mk(2, 'chest', 'Chest', '2026-11-02', 1500, 50*60000, [{key:'barbell-bench-press', sets:bench}]);
      mk(2, 'legs-2', 'Legs 2', '2026-11-03', 1300, 48*60000, [{key:'seated-leg-curl', sets:curl}]);
      mk(2, 'back', 'Back', '2026-11-04', 1100, 42*60000, [{key:'lat-pulldown', sets:curl}]);
      mk(2, 'arms', 'Arms', '2026-11-05', 800, 40*60000, [{key:'ez-bar-curl', sets:[{reps:10,weight:30},{reps:10,weight:30},{reps:10,weight:30}]}]);
      D.saveNow();
      return D.cycleProgress();
    }"""
    )


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser, context = launch_context(p)
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        choose_days_if_needed(page, 4)
        page.wait_for_selector('[data-testid="week-plan"]')

        # Tab bar on home
        page.wait_for_selector('[data-testid="tab-bar"]')
        check(page.locator('[data-testid="tab-bar"]').is_visible(), "tab bar visible on home")
        for tid, label in (("tab-home", "Home"), ("tab-program", "Program"), ("tab-progress", "Progress"), ("tab-checkin", "Check-in"), ("tab-settings", "Settings")):
            check(page.locator(f'[data-testid="{tid}"]').count() == 1, f"tab {label} exists")
        check("on" in (page.locator('[data-testid="tab-home"]').get_attribute("class") or ""), "Home tab is active")
        check(page.locator('[data-testid="tab-bar"]').inner_text().lower().find("nutrition") < 0, "no nutrition tab")
        # tab bar sits at the bottom and is not covering the plan
        bar = page.locator('[data-testid="tab-bar"]').bounding_box()
        plan = page.locator('[data-testid="week-plan"]').bounding_box()
        check(bar and bar["y"] + bar["height"] <= 846, "tab bar sits at the bottom of 390x844", json.dumps(bar))
        check(plan and bar and plan["y"] + 20 < bar["y"], "week plan is above the tab bar")
        shot(page, "home-tabbar.png")

        # Seed cycle data then open Program
        cycle = seed_cycle(page)
        print("seed cycle", json.dumps(cycle))
        check(cycle["done"] == 7 and cycle["total"] == 20, "cycle workouts 7/20 (3+4 of 4-day, 5 weeks)", json.dumps(cycle))
        check(cycle["pct"] == 35, "completed 35%", json.dumps(cycle))
        w1 = next(w for w in cycle["weeks"] if w["week"] == 1)
        w2 = next(w for w in cycle["weeks"] if w["week"] == 2)
        w3 = next(w for w in cycle["weeks"] if w["week"] == 3)
        check(w1["pct"] == 75 and w2["pct"] == 100 and w3["pct"] == 0, "week % is 75 / 100 / 0", json.dumps({"w1": w1, "w2": w2, "w3": w3}))

        page.evaluate("() => window.VELA_APP.render()")
        page.locator('[data-testid="tab-program"]').tap()
        page.wait_for_selector('[data-testid="program-tab"]')
        title = page.locator('[data-testid="program-title"]').inner_text()
        check("BRO SPLIT" in title.upper() and "4" in title, "program title is Bro Split 4 Day", title)
        check(page.locator('[data-testid="change-program"]').count() == 1, "Change program control is prominent")
        check(page.locator('[data-testid="reset-program"]').count() == 1, "Reset program pill is present")
        stats = page.locator('[data-testid="program-stats"]').inner_text()
        check("7/20" in stats.replace(" ", ""), "stats strip shows 7/20 workouts", stats)
        check("35%" in stats, "stats strip shows 35% completed", stats)
        check(page.locator('[data-testid="week-card-1"]').count() == 1 and page.locator('[data-testid="week-card-5"]').count() == 1, "Week 1–5 cards are listed")
        check("75%" in page.locator('[data-testid="week-pct-1"]').inner_text(), "Week 1 card shows 75%")
        check("100%" in page.locator('[data-testid="week-pct-2"]').inner_text(), "Week 2 card shows 100%")
        check("done" in (page.locator('[data-testid="week-card-2"]').get_attribute("class") or ""), "Week 2 has a completed/check state")
        check("current" in (page.locator('[data-testid="week-card-3"]').get_attribute("class") or ""), "Week 3 is marked current")
        check("on" in (page.locator('[data-testid="tab-program"]').get_attribute("class") or ""), "Program tab is active")
        shot(page, "program-tab.png")

        # Open week 2 (past) — logged days
        page.locator('[data-testid="week-card-2"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        week2 = page.inner_text('[data-testid="week-plan"]')
        check("Chest" in week2 and "Legs 2" in week2, "past week lists logged days", week2)
        page.locator('[data-testid="workout-tile-chest"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        review = page.inner_text("body")
        check("Barbell Bench Press" in review, "past day opens the logged workout")
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-action="program-back"]').tap()
        page.wait_for_selector('[data-testid="program-tab"]')

        # Change program: Max-OT, then back, week preserved
        bro_week = page.evaluate("() => window.VELA_DATA.get().week")
        page.locator('[data-testid="change-program"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]')
        check(page.locator('[data-testid="program-option-bro-split"]').count() == 1, "chooser lists Bro Split 4-day")
        check(page.locator('[data-testid="program-option-bro-split-5"]').count() == 1, "chooser lists Bro Split 5-day")
        check(page.locator('[data-testid="program-option-max-ot"]').count() == 1, "chooser lists Max-OT")
        page.locator('[data-testid="program-option-max-ot"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]', state="detached")
        page.wait_for_selector('[data-testid="program-tab"]')
        mt = page.locator('[data-testid="program-title"]').inner_text()
        check("MAX-OT" in mt.upper(), "title switches to Max-OT", mt)
        check(page.locator('[data-testid="week-card-8"]').count() == 1, "Max-OT shows 8 week cards")
        check(page.evaluate("() => window.VELA_DATA.get().week") == 1, "Max-OT starts at week 1")

        page.locator('[data-testid="change-program"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]')
        page.locator('[data-testid="program-option-bro-split"]').tap()
        page.wait_for_selector('[data-testid="program-tab"]')
        check(page.evaluate("() => window.VELA_DATA.get().week") == bro_week, "Bro Split 4-day week is preserved")
        check("75%" in page.locator('[data-testid="week-pct-1"]').inner_text(), "4-day cycle % restored")

        # 5-day is a separate slot
        page.locator('[data-testid="change-program"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]')
        page.locator('[data-testid="program-option-bro-split-5"]').tap()
        page.wait_for_selector('[data-testid="program-tab"]')
        t5 = page.locator('[data-testid="program-title"]').inner_text()
        check("5" in t5, "title is Bro Split 5 Day", t5)
        check(page.evaluate("() => window.VELA_DATA.get().week") == 1, "5-day slot has its own week 1")
        check(page.evaluate("() => window.VELA_DATA.get().daysPerWeek") == 5, "5-day slot uses 5 days")
        # switch back to 4-day
        page.locator('[data-testid="change-program"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]')
        page.locator('[data-testid="program-option-bro-split"]').tap()
        page.wait_for_selector('[data-testid="program-tab"]')
        check(page.evaluate("() => window.VELA_DATA.get().week") == bro_week, "4-day progress still intact after visiting 5-day")

        # Progress tab
        page.locator('[data-testid="tab-progress"]').tap()
        page.wait_for_selector('[data-testid="progress-tab"]')
        prog = page.inner_text('[data-testid="progress-tab"]')
        check("Personal best" in prog or "Personal bests" in prog, "Progress shows personal bests")
        check("Seated Leg Curl" in prog or "Barbell Bench Press" in prog or "EZ-Bar Curl" in prog, "Progress lists exercise history", prog[:400])
        check(page.locator('[data-testid="history-list"] button, [data-testid="pb-list"] button').count() >= 1, "history/PB rows are tappable")
        page.locator('[data-testid="progress-ex-seated-leg-curl"], [data-testid="progress-ex-barbell-bench-press"]').first.tap()
        page.wait_for_selector('[data-testid="history-sheet"]')
        check(page.locator('[data-testid="history-edit"]').count() == 1, "history edit/delete is available from Progress")
        page.locator('[data-action="close-sheet"]').tap()
        shot(page, "progress.png")

        # Check-in + Settings tabs
        page.locator('[data-testid="tab-checkin"]').tap()
        page.wait_for_selector('[data-testid="checkin-sheet"]')
        check(page.locator('[data-testid="save-checkin"]').count() == 1, "Check-in tab has the form")
        page.locator('[data-testid="tab-settings"]').tap()
        page.wait_for_selector('[data-testid="settings-tab"]')
        check("Rest timer" in page.inner_text('[data-testid="settings-tab"]'), "Settings tab has rest timer")

        # Tab remembered after reload
        page.locator('[data-testid="tab-program"]').tap()
        page.wait_for_selector('[data-testid="program-tab"]')
        page.reload(wait_until="networkidle")
        choose_days_if_needed(page, 4)
        page.wait_for_selector('[data-testid="program-tab"], [data-testid="tab-bar"]')
        check(page.locator('[data-testid="program-tab"]').count() == 1 or "on" in (page.locator('[data-testid="tab-program"]').get_attribute("class") or ""), "Program tab is remembered after reload")

        # Tracking card hides the tab bar
        page.locator('[data-testid="tab-home"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        check(page.locator('[data-testid="tab-bar"]').is_visible(), "tab bar stays visible in a workout")
        check(page.locator('[data-testid="finish-workout"]').is_visible(), "Finish workout sits above the tab bar")
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]')
        check(not page.locator('[data-testid="tab-bar"]').is_visible(), "tab bar hides while Sets Tracking is open")
        page.locator('[data-testid="close-tracking"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]', state="detached")
        check(page.locator('[data-testid="tab-bar"]').is_visible(), "tab bar returns after closing Sets Tracking")

        browser.close()
    httpd.shutdown()
    print()
    if fails:
        print(f"{len(fails)} failed:")
        for f in fails:
            print(" -", f)
        sys.exit(1)
    print("all v9 checks passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
