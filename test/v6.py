"""VELA v6: exercise library, overload/volume audit, Bro Split 5-week cycle, 4/5-day setup."""
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
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v6"))
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


def skip_rest(page):
    if page.locator('[data-testid="rest-timer"]').count():
        page.locator('button[data-action="skip-rest"]').tap()
        page.wait_for_selector('[data-testid="rest-timer"]', state="detached")


def track_one(page, ex_index, set_index, reps, weight):
    page.locator(f'[data-testid="set-chip-{ex_index}-{set_index}"]').tap()
    page.wait_for_selector('[data-testid="sets-tracking"]')
    if reps is not None:
        page.locator('[data-testid="reps-input"]').fill(str(reps))
    if weight is not None:
        page.locator('[data-testid="weight-input"]').fill(str(weight))
    page.locator('[data-testid="track-reps"]').tap()
    page.wait_for_selector('[data-testid="sets-tracking"]', state="detached")
    skip_rest(page)


def seed_multiweek_history(page):
    """Previous session of the exercise (not merely last calendar week), via live state."""
    page.evaluate(
        """() => {
      const D = window.VELA_DATA;
      const s = D.get();
      s.history = s.history || {};
      const common = { workout: 'Legs 2', workoutId: 'legs-2' };
      s.history['seated-leg-curl'] = [
        {
          ...common, week: 2, sessionId: 'prior-w2',
          date: '2026-11-07', datetime: '2026-11-07T18:00:00.000Z',
          sets: [
            { reps: 8, weight: 52.5 },
            { reps: 8, weight: 52.5 },
            { reps: 7, weight: 52.5 }
          ]
        },
        {
          ...common, week: 1, sessionId: 'prior-w1',
          date: '2026-10-31', datetime: '2026-10-31T18:00:00.000Z',
          sets: [
            { reps: 8, weight: 60 },
            { reps: 8, weight: 60 },
            { reps: 8, weight: 60 }
          ]
        }
      ];
      s.history['leg-extension'] = [{
        ...common, week: 2, sessionId: 'prior-w2',
        date: '2026-11-07', datetime: '2026-11-07T18:00:00.000Z',
        sets: [
          { reps: 15, weight: 70 },
          { reps: 15, weight: 70 },
          { reps: 15, weight: 70 }
        ]
      }];
      s.history['romanian-deadlift'] = [{
        ...common, week: 2, sessionId: 'prior-w2',
        date: '2026-11-07', datetime: '2026-11-07T18:00:00.000Z',
        sets: [
          { reps: 10, weight: 60 },
          { reps: 10, weight: 60 },
          { reps: 10, weight: 60 }
        ]
      }];
      s.history['chest-dip'] = [{
        workout: 'Chest', workoutId: 'chest', week: 2, sessionId: 'chest-w2',
        date: '2026-11-07', datetime: '2026-11-07T18:00:00.000Z',
        sets: [
          { reps: 8, weight: null },
          { reps: 8, weight: null },
          { reps: 8, weight: null }
        ]
      }];
      D.saveNow();
    }"""
    )


def shot(page, name):
    path = SHOTS / name
    page.screenshot(path=str(path), full_page=False)
    print("shot", path)
    return path


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser, context = launch_context(p)
        page = context.new_page()
        page.goto(url, wait_until="networkidle")

        # --- First-launch days setup ---
        page.wait_for_selector('[data-testid="days-setup"]')
        body = page.inner_text("body")
        check("How often do you want to train?" in body, "setup title")
        check(page.locator('[data-testid="days-option-4"]').count() == 1, "4x/week option")
        check(page.locator('[data-testid="days-option-5"]').count() == 1, "5x/week option")
        check("3x/week" not in body, "no 3x/week option")
        check(page.locator('[data-testid="days-setup-progress"]').count() == 1, "teal progress bar")
        check(page.locator('[data-action="settings"]').count() == 0, "settings hidden on setup")
        shot(page, "days-setup.png")

        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        home = page.inner_text("body")
        pname = page.locator('[data-testid="program-name"]').inner_text()
        check("bro split" in pname.lower(), "program name Bro Split", pname)
        check("This Week's Plan" in home, "weekly plan heading")
        check("Week 1 of 5" in home, "Week 1 of 5 on home")
        check(page.locator('[data-testid="workout-tile-chest"]').count() == 1, "4-day has Chest")
        check(page.locator('[data-testid="workout-tile-legs-2"]').count() == 1, "4-day has Legs 2")
        check(page.locator('[data-testid="workout-tile-back"]').count() == 1, "4-day has Back")
        check(page.locator('[data-testid="workout-tile-arms"]').count() == 1, "4-day has Arms")
        check(page.locator('[data-testid="workout-tile-delts"]').count() == 0, "4-day has no separate Delts")
        check("Biceps, Triceps & Delts" in home, "4-day arms title includes Delts")

        # --- Overload + volume ---
        seed_multiweek_history(page)
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        check("Seated Leg Curl" in page.inner_text("body"), "opens Legs 2")

        # Untracked sets are not counted
        vol0 = page.locator('[data-testid="volume-amt-0"]').inner_text()
        check(vol0.replace(" ", "") in ("0Kg", "0kg"), "untracked volume is 0Kg", vol0)

        # Unit-level compare: previous session is 52.5, not the older 60kg week
        logic = page.evaluate(
            """() => {
          const D = window.VELA_DATA;
          const w = D.workoutById('legs-2');
          const ex = w.exercises[0];
          const prev = D.previousSession(ex.key, w.sessionId);
          return {
            prevSession: prev && prev.sessionId,
            prevW0: prev && prev.sets[0].weight,
            up: D.compareSet({ reps: 8, weight: 55 }, { reps: 8, weight: 52.5 }),
            sameDec: D.compareSet({ reps: 8, weight: 52.5 }, { reps: 8, weight: '52.5' }),
            upReps: D.compareSet({ reps: 9, weight: 52.5 }, { reps: 7, weight: 52.5 }),
            down: D.compareSet({ reps: 8, weight: 50 }, { reps: 8, weight: 52.5 }),
            noPrior: D.compareSet({ reps: 8, weight: 52.5 }, undefined),
            parts: D.setsVolume([
              { done: true, reps: 8, weight: 55 },
              { done: true, reps: 8, weight: 52.5 },
              { done: true, reps: 9, weight: 52.5 }
            ]),
            untracked: D.setsVolume([
              { done: false, reps: 8, weight: 52.5 },
              { done: true, reps: 8, weight: 55 }
            ]),
            bw: D.setsVolume([
              { done: true, reps: 10, weight: null },
              { done: true, reps: 10, weight: null },
              { done: true, reps: 10, weight: null }
            ]),
          };
        }"""
        )
        check(logic["prevSession"] == "prior-w2", "previous session is last session of the exercise, not week 1", json.dumps(logic))
        check(logic["prevW0"] == 52.5, "previous set 1 weight is 52.5")
        check(logic["up"] == "up", "heavier weight → up")
        check(logic["sameDec"] == "same", "52.5 vs '52.5' is same; reps also equal")
        check(logic["upReps"] == "up", "same weight, more reps → up")
        check(logic["down"] == "down", "lighter weight → down")
        check(logic["noPrior"] is None, "missing previous set → no sign")
        check(logic["parts"]["kg"] == 1332.5, "worked example volume 8×55 + 8×52.5 + 9×52.5 = 1332.5", str(logic["parts"]))
        check(logic["untracked"]["kg"] == 440, "untracked suggested sets are not counted")
        check(logic["bw"]["kg"] == 0 and logic["bw"]["repsOnly"] == 30, "bodyweight volume is 30 reps, not 0Kg")

        track_one(page, 0, 0, 8, 55)
        chip0 = page.locator('[data-testid="set-chip-0-0"]')
        check(chip0.locator('[data-overload="up"]').count() == 1, "set 1 heavier than last session 52.5 → up")
        check("440Kg" in page.locator('[data-testid="volume-amt-0"]').inner_text(), "volume after one logged set is 440Kg, not 3× suggested")

        track_one(page, 0, 1, 8, 52.5)
        chip1 = page.locator('[data-testid="set-chip-0-1"]')
        check(chip1.locator('[data-overload="same"]').count() == 1, "set 2 same 52.5 kg and 8 reps → same")

        track_one(page, 0, 2, 9, 52.5)
        chip2 = page.locator('[data-testid="set-chip-0-2"]')
        check(chip2.locator('[data-overload="up"]').count() == 1, "set 3 same 52.5 kg, more reps → up")
        vol = page.locator('[data-testid="volume-amt-0"]').inner_text()
        check("1333Kg" in vol, "exercise volume rounds 1332.5 to 1333Kg", vol)
        vs = page.locator('[data-testid="volume-vs-last-0"]').inner_text()
        check("125" in vs and "last" in vs.lower(), "volume vs last session +125Kg (1332.5 − 1207.5)", vs)

        # Retrack must not double-count
        track_one(page, 0, 0, 8, 55)
        vol2 = page.locator('[data-testid="volume-amt-0"]').inner_text()
        check(vol2 == vol, "retracking the same set does not double-count volume", f"{vol} -> {vol2}")
        hist_count = page.evaluate("() => (window.VELA_DATA.get().history['seated-leg-curl'] || []).length")
        check(hist_count == 3, "history has prior-w2, prior-w1, and one current session (no duplicate)", str(hist_count))

        # Added set has no prior → no sign
        page.locator('button[data-action="add-set"][data-ex="0"]').tap()
        page.wait_for_selector('[data-testid="set-chip-0-3"]')
        track_one(page, 0, 3, 8, 52.5)
        chip3 = page.locator('[data-testid="set-chip-0-3"]')
        check(chip3.locator('[data-overload="none"]').count() == 1, "added 4th set has no overload sign")

        # First-ever exercise in this workout: Walking Lunge has no history
        # (index 3 after the three known lifts)
        names = page.evaluate("() => window.VELA_DATA.workoutById('legs-2').exercises.map(e => e.name)")
        check("Walking Lunge" in names, "Walking Lunge is in Legs 2", json.dumps(names))
        li = names.index("Walking Lunge")
        track_one(page, li, 0, 10, 16)
        lunge = page.locator(f'[data-testid="set-chip-{li}-0"]')
        check(lunge.locator('[data-overload="none"]').count() == 1, "first-ever session of Walking Lunge has no sign")
        check("First session" in page.locator(f'[data-testid="volume-vs-last-{li}"]').inner_text(), "first session volume label")

        # --- Library: swap / add / remove+undo ---
        page.locator('[data-action="alt"][data-ex="0"]').tap()
        page.wait_for_selector('[data-testid="exercise-picker"]')
        check(page.locator('[data-testid="cat-chip-Legs"].on').count() == 1, "swap picker defaults to Legs")
        check(page.locator('[data-testid="category-chips"]').count() == 1, "category chips present")
        check(page.locator('[data-testid="equipment-chips"]').count() == 1, "equipment chips present")
        shot(page, "picker-categories.png")
        page.locator('[data-testid="picker-item-standing-leg-curl"]').tap()
        page.wait_for_selector('[data-testid="exercise-picker"]', state="detached")
        check("Standing Leg Curl" in page.inner_text("body"), "swapped in Standing Leg Curl")
        check("Seated Leg Curl" not in page.locator('[data-testid="exercise-stack"]').inner_text(), "old exercise removed from slot")
        seated_hist = page.evaluate("() => (window.VELA_DATA.get().history['seated-leg-curl'] || []).length")
        check(seated_hist == 3, "swap keeps seated-leg-curl history for later overload", str(seated_hist))
        # Swapped-in exercise, first session of that name: no sign after logging
        track_one(page, 0, 0, 8, 40)
        check(page.locator('[data-testid="set-chip-0-0"] [data-overload="none"]').count() == 1, "swapped-in exercise first session has no sign")

        page.locator('[data-testid="add-exercise"]').tap()
        page.wait_for_selector('[data-testid="exercise-picker"]')
        page.locator('[data-testid="cat-chip-Core"]').tap()
        page.locator('[data-testid="picker-item-plank"]').tap()
        page.wait_for_selector('[data-testid="exercise-picker"]', state="detached")
        check(page.locator('[data-testid="exercise-card-plank"]').count() == 1, "added Plank")
        plank = page.evaluate(
            """() => {
          const ex = window.VELA_DATA.workoutById('legs-2').exercises.find(e => e.key === 'plank');
          return ex && { sets: ex.sets.length, reps: ex.suggestedReps };
        }"""
        )
        check(plank and plank["sets"] == 3 and plank["reps"] == 10, "added exercise defaults to 3×10", json.dumps(plank))

        page.locator('[data-testid="edit-workout"]').tap()
        check(page.locator('[data-testid="remove-exercise-0"]').count() >= 1, "edit mode shows Remove")
        shot(page, "workout-edit.png")
        plank_i = page.evaluate("() => window.VELA_DATA.workoutById('legs-2').exercises.findIndex(e => e.key === 'plank')")
        page.locator(f'[data-testid="remove-exercise-{plank_i}"]').tap()
        page.wait_for_selector(".dialog")
        page.locator(".dialog .btn.danger").tap()
        page.wait_for_selector('[data-testid="exercise-card-plank"]', state="detached")
        check(page.locator('[data-testid="exercise-card-plank"]').count() == 0, "Plank removed after confirm")
        page.locator("#toast button").tap()
        page.wait_for_selector('[data-testid="exercise-card-plank"]')
        check(page.locator('[data-testid="exercise-card-plank"]').count() == 1, "Undo restores Plank")

        # Persist across reload
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.reload(wait_until="networkidle")
        # days already chosen — should land on the plan, not setup
        check(page.locator('[data-testid="days-setup"]').count() == 0, "reload does not show days setup again")
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        check(page.locator('[data-testid="exercise-card-standing-leg-curl"]').count() == 1, "swap persists after reload")
        check(page.locator('[data-testid="exercise-card-plank"]').count() == 1, "added exercise persists after reload")
        check(page.evaluate("() => (window.VELA_DATA.get().history['seated-leg-curl'] || []).length") == 3, "history intact after reload")

        # --- Bodyweight volume on Chest Dip ---
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-chest"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        dip_i = page.evaluate("() => window.VELA_DATA.workoutById('chest').exercises.findIndex(e => e.key === 'chest-dip')")
        check(dip_i >= 0, "Chest Dip is in Chest")
        track_one(page, dip_i, 0, 10, None)
        track_one(page, dip_i, 1, 10, None)
        track_one(page, dip_i, 2, 10, None)
        dip_vol = page.locator(f'[data-testid="volume-amt-{dip_i}"]').inner_text()
        check("30 reps" in dip_vol and "0Kg" not in dip_vol, "bodyweight volume shows 30 reps, not 0Kg", dip_vol)
        dip_vs = page.locator(f'[data-testid="volume-vs-last-{dip_i}"]').inner_text()
        check("6" in dip_vs and "reps" in dip_vs, "bodyweight volume vs last is +6 reps (30 vs 24)", dip_vs)

        # --- 5-day layout ---
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-action="settings"]').tap()
        page.wait_for_selector('[data-testid="change-days"]')
        check("Bro Split" in page.inner_text("body"), "settings shows Bro Split")
        page.locator('[data-testid="change-days"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]')
        check(page.locator('[data-testid="days-option-4"].on').count() == 1, "settings setup highlights current 4x")
        page.locator('[data-testid="days-option-5"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.evaluate(
            """() => {
          const s = window.VELA_DATA.get();
          s.week = 3;
          window.VELA_DATA.saveNow();
          window.VELA_APP.render();
        }"""
        )
        plan = page.inner_text('[data-testid="week-plan"]')
        home = page.inner_text("body")
        check("Week 3 of 5" in home, "Week 3 of 5 on 5-day plan")
        check(page.locator('[data-testid="workout-tile-delts"]').count() == 1, "5-day adds Delts")
        check("Arms (Biceps & Triceps)" in home, "5-day arms title without Delts")
        check("Biceps, Triceps & Delts" not in plan, "old 4-day arms title gone")
        # User edits on Legs kept (standing curl + plank)
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        check(page.locator('[data-testid="exercise-card-standing-leg-curl"]').count() == 1, "5-day switch keeps Legs edits")
        check(page.locator('[data-testid="exercise-card-plank"]').count() == 1, "5-day switch keeps added Plank")
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-delts"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        delts = page.evaluate("() => window.VELA_DATA.workoutById('delts').exercises.map(e => e.name)")
        for need in ("Seated Dumbbell Shoulder Press", "Lateral Raise", "Rear Delt Fly", "Arnold Press", "Front Raise"):
            check(need in delts, f"Delts day includes {need}", json.dumps(delts))
        check(5 <= len(delts) <= 8, "Delts is a full day (~5–6 exercises)", str(len(delts)))
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-arms"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        arms = page.evaluate("() => window.VELA_DATA.workoutById('arms').exercises.map(e => e.name)")
        check("Seated Dumbbell Shoulder Press" not in arms, "shoulders moved off Arms day", json.dumps(arms))
        check("EZ-Bar Curl" in arms and "Tricep Rope Pushdown" in arms, "arms keeps biceps and triceps")
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        shot(page, "week-plan-5day.png")

        # --- End-of-cycle prompt ---
        page.evaluate(
            """() => {
          const s = window.VELA_DATA.get();
          s.week = 5;
          window.VELA_DATA.saveNow();
          window.VELA_APP.render();
        }"""
        )
        check("Week 5 of 5" in page.inner_text("body"), "Week 5 of 5 before advancing")
        page.locator('[data-testid="next-program"]').tap()
        page.wait_for_selector('[data-testid="cycle-prompt"]')
        prompt = page.inner_text('[data-testid="cycle-prompt"]')
        check("Continue" in prompt and "Reset" in prompt, "cycle prompt has Continue and Reset")
        check("history" in prompt.lower() or "overload" in prompt.lower(), "cycle prompt mentions history/overload kept")
        shot(page, "cycle-prompt.png")
        page.locator('[data-testid="cycle-continue"]').tap()
        page.wait_for_selector('[data-testid="cycle-prompt"]', state="detached")
        check("Week 6" in page.inner_text("body"), "Continue advances to week 6")
        check(page.evaluate("() => window.VELA_DATA.get().week") == 6, "week is 6")
        check(page.evaluate("() => (window.VELA_DATA.get().history['seated-leg-curl'] || []).length") >= 3, "Continue keeps history")

        # Reset from a cycle end, confirm history is kept, then days setup
        page.evaluate(
            """() => {
          const s = window.VELA_DATA.get();
          s.week = 5;
          window.VELA_DATA.saveNow();
          window.VELA_APP.render();
        }"""
        )
        page.locator('[data-testid="next-program"]').tap()
        page.wait_for_selector('[data-testid="cycle-prompt"]')
        page.locator('[data-testid="cycle-reset"]').tap()
        page.wait_for_selector(".dialog")
        dlg = page.inner_text(".dialog")
        check("history" in dlg.lower() or "overload" in dlg.lower(), "reset confirm says history/overload are kept", dlg)
        page.locator(".dialog .btn.danger").tap()
        page.wait_for_selector('[data-testid="days-setup"]')
        page.locator('[data-testid="days-option-5"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        check("Week 1 of 5" in page.inner_text("body"), "Reset starts Week 1 of 5")
        check(page.evaluate("() => window.VELA_DATA.get().week") == 1, "week is 1 after reset")
        check(page.locator('[data-testid="workout-tile-delts"]').count() == 1, "reset can keep 5-day layout")
        check(page.evaluate("() => (window.VELA_DATA.get().history['seated-leg-curl'] || []).length") >= 3, "Reset does not delete history")
        # Overload still compares to last session of that exercise
        still = page.evaluate(
            """() => {
          const D = window.VELA_DATA;
          const w = D.workoutById('legs-2');
          const ex = w.exercises.find(e => e.key === 'seated-leg-curl') || w.exercises.find(e => e.key === 'standing-leg-curl');
          const prev = D.previousSession('seated-leg-curl', w.sessionId);
          return { prev: prev && prev.sessionId, hasSeatedHist: !!(D.get().history['seated-leg-curl'] || []).length };
        }"""
        )
        check(still["hasSeatedHist"], "overload history for Seated Leg Curl still available after reset", json.dumps(still))

        # State version migrated safely
        ver = page.evaluate("() => window.VELA_DATA.get().version")
        check(ver == 4, "state version is 4", str(ver))

        browser.close()
    httpd.shutdown()

    print()
    if fails:
        print(f"{len(fails)} failed:")
        for f in fails:
            print(" -", f)
        sys.exit(1)
    print("all checks passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
