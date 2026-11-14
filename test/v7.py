"""VELA v7: stats dashboard, monthly check-in, Max-OT program switch."""
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
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v7"))
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


def shot(page, name):
    path = SHOTS / name
    page.screenshot(path=str(path), full_page=False)
    print("shot", path)
    return path


def choose_days_if_needed(page, days=4):
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")
        page.wait_for_selector('[data-testid="week-plan"]')


def seed_dashboard(page):
    """Seed three full calendar weeks plus 3/4 this week, one new PB, hours and volume."""
    return page.evaluate(
        """() => {
      const D = window.VELA_DATA;
      const s = D.get();
      s.daysPerWeek = 4;
      s.week = 3;
      s.history = s.history || {};
      s.sessions = [];

      const weekStarts = [];
      let cur = D.calendarWeekStart(D.copenhagenYMD());
      weekStarts.push(cur); // this week
      for (let i = 0; i < 3; i++) {
        const [y,m,d] = cur.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m-1, d-7));
        cur = dt.toISOString().slice(0,10);
        weekStarts.push(cur);
      }
      // weekStarts[0] this week, [1]=last, [2], [3]

      const workouts = ['chest','legs-2','back','arms'];
      function addDay(date, workoutId, name, durationMin, setsByEx, programId) {
        const sessionId = 'ses-' + date + '-' + workoutId;
        const datetime = date + 'T18:00:00.000Z';
        let vol = 0;
        Object.keys(setsByEx).forEach((key) => {
          const sets = setsByEx[key];
          sets.forEach((st) => { if (st.weight && st.reps) vol += st.weight * st.reps; });
          s.history[key] = s.history[key] || [];
          s.history[key].unshift({
            date, datetime, workout: name, workoutId, week: 2,
            programId: programId || 'bro-split', sessionId, sets
          });
        });
        s.sessions.unshift({
          programId: programId || 'bro-split', workoutId, workoutName: name,
          week: 2, sessionId, date, datetime,
          durationMs: durationMin * 60000, volumeKg: vol, completed: true
        });
        return vol;
      }

      const curlPrior = [{reps:8,weight:50},{reps:8,weight:50},{reps:8,weight:50}];
      // Older PB baseline for EZ-Bar Curl (before this week)
      s.history['ez-bar-curl'] = [{
        date: '2026-10-10', datetime: '2026-10-10T18:00:00.000Z',
        workout: 'Biceps, Triceps & Delts', workoutId: 'arms', week: 1,
        programId: 'bro-split', sessionId: 'old-curl',
        sets: curlPrior
      }];

      // Three prior full weeks, 4 workouts each
      for (let w = 1; w <= 3; w++) {
        const start = weekStarts[w];
        workouts.forEach((id, i) => {
          const date = (() => {
            const [y,m,d] = start.split('-').map(Number);
            const dt = new Date(Date.UTC(y, m-1, d+i));
            return dt.toISOString().slice(0,10);
          })();
          const sets = {
            'barbell-bench-press': [{reps:8,weight:70},{reps:8,weight:70},{reps:8,weight:70}],
            'seated-leg-curl': [{reps:8,weight:52.5},{reps:8,weight:52.5},{reps:8,weight:52.5}],
          };
          addDay(date, id, id, 40, sets);
        });
      }

      // This week: 3 of 4 workouts (Mon-Wed), curl is a new PB 60 > 50
      const start = weekStarts[0];
      function day(offset) {
        const [y,m,d] = start.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m-1, d+offset));
        return dt.toISOString().slice(0,10);
      }
      addDay(day(0), 'chest', 'Chest', 50, {
        'barbell-bench-press': [{reps:8,weight:70},{reps:8,weight:70},{reps:8,weight:70}]
      });
      addDay(day(1), 'legs-2', 'Legs 2', 55, {
        'seated-leg-curl': [{reps:8,weight:52.5},{reps:8,weight:52.5},{reps:8,weight:52.5}]
      });
      addDay(day(2), 'arms', 'Biceps, Triceps & Delts', 40, {
        'ez-bar-curl': [{reps:6,weight:60},{reps:6,weight:60},{reps:6,weight:60}]
      });

      D.saveNow();
      D.get(); // touch
      return D.weekStats();
    }"""
    )


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser, context = launch_context(p)
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        choose_days_if_needed(page)

        page.wait_for_selector('[data-testid="week-plan"]')
        check(page.locator('[data-testid="stats-card"]').count() == 1, "stats card is on home")

        stats = seed_dashboard(page)
        page.evaluate("() => window.VELA_APP.render()")
        page.wait_for_selector('[data-testid="stats-card"]')

        # Logic assertions from the seed return + on-screen
        print("seed stats", json.dumps(stats, default=str))
        check(stats["streak"] == 3, "streak is 3 complete calendar weeks", json.dumps(stats))
        check(stats["completed"] == 3 and stats["planned"] == 4, "this week is 3 of 4 workouts")
        check(stats["personalBests"] == 1, "one new heaviest-weight PB this week (EZ-Bar Curl 60 > 50)")
        check(stats["scope"] == "this week", "tiles are scoped to this week")
        check("1 more workout" in (stats["subtitle"] or ""), "subtitle asks for 1 more workout")

        # Expected volume this week: chest 8*70*3=1680, curl 6*60*3=1080, leg curl 8*52.5*3=1260 → 4020
        check(abs(stats["volumeKg"] - 4020) < 0.2, "this-week volume is 4020 kg", str(stats["volumeKg"]))
        # Hours: 50+55+40 = 145 min = 2:25
        check(stats["hoursLabel"] == "2:25", "hours spent 2:25", stats["hoursLabel"])

        streak = page.locator('[data-testid="streak-weeks"]').inner_text()
        check("3" in streak and "week" in streak.lower(), "streak tile shows 3 weeks", streak)
        sub = page.locator('[data-testid="streak-subtitle"]').inner_text()
        check("1 more workout" in sub, "on-screen streak subtitle", sub)
        filled = page.evaluate("() => document.querySelectorAll('[data-testid=streak-bar] i.on').length")
        total = page.evaluate("() => document.querySelectorAll('[data-testid=streak-bar] i').length")
        check(filled == 3 and total == 4, "segmented bar is 3 of 4", f"{filled}/{total}")
        check(page.locator('[data-testid="tile-volume"]').inner_text().startswith("4020"), "volume tile 4020")
        check("1" in page.locator('[data-testid="tile-pbs"]').inner_text(), "PB tile is 1")
        check("3" in page.locator('[data-testid="tile-workouts"]').inner_text(), "workouts tile is 3")
        check("2:25" in page.locator('[data-testid="tile-hours"]').inner_text(), "hours tile 2:25")
        check("this week" in page.locator('[data-testid="stats-card"]').inner_text().lower(), "dashboard labeled This week")
        check("Weekly Check-in" not in page.inner_text("body"), "check-in is monthly")
        due = "due" in (page.locator('[data-testid="checkin-button"]').get_attribute("class") or "")
        check(due, "Check-in button is highlighted when the month is due")
        check("Check-in" in page.locator('[data-testid="checkin-button"]').inner_text(), "due button says Check-in")

        # Hero sits above the weekly plan
        order = page.evaluate(
            """() => {
          const dash = document.querySelector('[data-testid=stats-card]');
          const plan = document.querySelector('[data-testid=week-plan]');
          return dash && plan && !!(dash.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING);
        }"""
        )
        check(order, "stats card is the hero above the weekly plan")
        check("This Week's Plan" in page.inner_text("body"), "weekly plan heading under the dashboard")
        check("Week 3 of 5" in page.inner_text("body"), "Week 3 of 5 under the dashboard")
        check(page.locator('[data-testid="workout-tile-legs-2"]').count() == 1, "tappable workout tiles still present")
        shot(page, "home-dashboard.png")

        # Check-in save + history
        page.locator('[data-testid="checkin-button"]').tap()
        page.wait_for_selector('[data-testid="checkin-sheet"]')
        page.locator("[data-cin-weight]").fill("82,5")
        page.locator("[data-cin-waist]").fill("81")
        page.locator("[data-cin-note]").fill("Feeling strong")
        shot(page, "check-in.png")
        page.locator('[data-testid="save-checkin"]').tap()
        page.wait_for_selector('[data-testid="checkin-sheet"]', state="detached")
        btn = page.locator('[data-testid="checkin-button"]')
        check("due" not in (btn.get_attribute("class") or ""), "button is not due after saving this month")
        check("View" in btn.inner_text(), "button says View after a check-in is saved")
        saved = page.evaluate("() => window.VELA_DATA.listCheckIns()")
        check(len(saved) == 1 and saved[0]["weight"] == 82.5 and saved[0]["waist"] == 81, "check-in stored with comma decimal", json.dumps(saved))
        page.locator('[data-testid="checkin-button"]').tap()
        page.wait_for_selector('[data-testid="checkin-sheet"]')
        check(page.locator('[data-testid="checkin-entry"]').count() == 1, "check-in appears in history")
        check("82.5" in page.inner_text('[data-testid="checkin-sheet"]') or "82,5" in page.inner_text('[data-testid="checkin-sheet"]'), "history shows body weight")
        page.locator('[data-action="close-sheet"]').tap()
        page.wait_for_selector('[data-testid="checkin-sheet"]', state="detached")

        # PB drill-in mentions heaviest weight
        page.locator('[data-testid="tile-pbs"]').tap()
        page.wait_for_selector('[data-testid="pb-sheet"]')
        pb_txt = page.inner_text('[data-testid="pb-sheet"]')
        check("heaviest" in pb_txt.lower(), "PB sheet explains heaviest-weight rule")
        check("60" in pb_txt, "PB sheet lists 60kg")
        page.locator('[data-action="close-sheet"]').tap()

        # Program switch to Max-OT
        bro_week = page.evaluate("() => window.VELA_DATA.get().week")
        page.locator('[data-testid="program-name"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]')
        check(page.locator('[data-testid="program-option-bro-split"]').count() == 1, "chooser has Bro Split")
        check(page.locator('[data-testid="program-option-max-ot"]').count() == 1, "chooser has Max-OT")
        page.locator('[data-testid="program-option-max-ot"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]', state="detached")
        body = page.inner_text("body")
        check("max-ot" in body.lower() or "max ot" in body.lower() or "MAX-OT" in page.locator('[data-testid="program-name"]').inner_text() or "max-ot" in page.locator('[data-testid="program-name"]').inner_text().lower(), "home shows Max-OT", page.locator('[data-testid="program-name"]').inner_text())
        check("Week 1 of 8" in body, "Max-OT starts at Week 1 of 8")
        for name in ("Shoulders & Traps", "Calves & Legs", "Abs & Back", "Chest & Triceps", "Biceps & Forearms"):
            check(name in body, f"Max-OT day {name}")
        for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday"):
            check(day in body, f"Max-OT labeled {day}")
        check(page.locator('[data-testid="workout-tile-maxot-shoulders"]').count() == 1, "shoulders tile tappable")
        check(page.locator('[data-testid="workout-tile-delts"]').count() == 0, "Bro Split Delts is not on Max-OT")
        rest = page.evaluate("() => window.VELA_DATA.get().restSeconds")
        check(rest == 180, "Max-OT rest timer defaults to 3 minutes", str(rest))
        # Open a workout and check 4–6 aim
        page.locator('[data-testid="workout-tile-maxot-shoulders"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        wo = page.inner_text("body")
        check("Standing Barbell Shoulder Press" in wo, "standing barbell press seeded with the AST name")
        check("4–6" in wo or "4-6" in wo, "Max-OT aim shows 4–6 reps")
        check(page.evaluate("() => window.VELA_DATA.workoutById('maxot-shoulders').exercises[0].sets.length") == 3, "OHP has 3 working sets")
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="stats-card"]')
        shot(page, "max-ot-plan.png")

        # History still shared: EZ-Bar Curl PB history remains
        still = page.evaluate("() => (window.VELA_DATA.get().history['ez-bar-curl'] || []).length")
        check(still >= 2, "history is shared across programs", str(still))

        # Switch back: Bro Split week preserved
        page.locator('[data-testid="program-name"]').tap()
        page.wait_for_selector('[data-testid="program-picker"]')
        page.locator('[data-testid="program-option-bro-split"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        check("Bro Split" in page.locator('[data-testid="program-name"]').inner_text() or "BRO SPLIT" in page.locator('[data-testid="program-name"]').inner_text(), "switched back to Bro Split")
        week = page.evaluate("() => window.VELA_DATA.get().week")
        check(week == bro_week, "Bro Split week is preserved after visiting Max-OT", f"{bro_week} vs {week}")
        check("Week 3 of 5" in page.inner_text("body"), "Bro Split week label restored")
        check(page.locator('[data-testid="workout-tile-legs-2"]').count() == 1, "Bro Split plan restored")

        # Cache / version
        ver = page.evaluate("() => window.VELA_DATA.get().version")
        check(ver == 5, "state version is 5", str(ver))

        browser.close()
    httpd.shutdown()
    print()
    if fails:
        print(f"{len(fails)} failed:")
        for f in fails:
            print(" -", f)
        sys.exit(1)
    print("all v7 checks passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
