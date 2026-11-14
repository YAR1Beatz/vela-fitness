"""VELA v8: delete and edit history, with recompute and undo."""
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
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v8"))
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


def seed(page):
    return page.evaluate(
        """() => {
      const D = window.VELA_DATA;
      const s = D.get();
      const w = D.workoutById('legs-2');
      const curl = w.exercises[0];
      s.history = s.history || {};
      s.sessions = s.sessions || [];
      s.history['seated-leg-curl'] = [
        {
          date: '2026-11-07', datetime: '2026-11-07T18:00:00.000Z',
          workout: 'Legs 2', workoutId: 'legs-2', week: 2, programId: 'bro-split',
          sessionId: 'prior-week',
          sets: [{reps:8,weight:50},{reps:8,weight:50},{reps:8,weight:50}]
        },
        {
          date: '2026-10-31', datetime: '2026-10-31T18:00:00.000Z',
          workout: 'Legs 2', workoutId: 'legs-2', week: 1, programId: 'bro-split',
          sessionId: 'prior-old',
          sets: [{reps:8,weight:60},{reps:8,weight:60},{reps:8,weight:60}]
        }
      ];
      s.history['leg-extension'] = [{
        date: '2026-11-07', datetime: '2026-11-07T18:00:00.000Z',
        workout: 'Legs 2', workoutId: 'legs-2', week: 2, programId: 'bro-split',
        sessionId: 'prior-week',
        sets: [{reps:15,weight:70},{reps:15,weight:70},{reps:15,weight:70}]
      }];
      s.sessions = [
        { programId:'bro-split', workoutId:'legs-2', workoutName:'Legs 2', week:2,
          sessionId:'prior-week', date:'2026-11-07', datetime:'2026-11-07T18:00:00.000Z',
          durationMs: 50*60000, volumeKg: 50*8*3 + 70*15*3, completed:true },
        { programId:'bro-split', workoutId:'legs-2', workoutName:'Legs 2', week:1,
          sessionId:'prior-old', date:'2026-10-31', datetime:'2026-10-31T18:00:00.000Z',
          durationMs: 40*60000, volumeKg: 60*8*3, completed:true }
      ];
      const logged = [
        {reps:8, weight:55},
        {reps:8, weight:50},
        {reps:8, weight:48}
      ];
      curl.sets.forEach((st, i) => {
        st.done = true;
        st.reps = logged[i].reps;
        st.weight = logged[i].weight;
        st.repsText = String(logged[i].reps);
        st.weightText = String(logged[i].weight);
      });
      D.upsertSessionHistory(w);
      D.saveNow();
      return {
        sessionId: w.sessionId,
        signs: curl.sets.map((_, i) => D.setOverload(curl, i, w.sessionId)),
        prev: D.previousSession('seated-leg-curl', w.sessionId).sessionId
      };
    }"""
    )


def signs(page):
    return page.evaluate(
        """() => {
      const D = window.VELA_DATA;
      const w = D.workoutById('legs-2');
      const curl = w.exercises[0];
      const prev = D.previousSession('seated-leg-curl', w.sessionId);
      return {
        sessionId: w.sessionId,
        prev: prev && prev.sessionId,
        prevW: prev && prev.sets[0] && prev.sets[0].weight,
        signs: curl.sets.map((st, i) => st.done ? D.setOverload(curl, i, w.sessionId) : null),
        done: curl.sets.map((st) => !!st.done),
        weights: curl.sets.map((st) => st.weight),
        vol: D.exerciseVolume(curl),
        histLen: (D.getHistory('seated-leg-curl') || []).length,
        extLen: (D.getHistory('leg-extension') || []).length,
      };
    }"""
    )


def confirm_delete(page):
    page.wait_for_selector(".dialog")
    page.locator(".dialog .btn.danger").tap()


def in_history_edit(page):
    cls = page.locator('[data-testid="history-edit"]').get_attribute("class") or ""
    return " on" in f" {cls} " or cls.endswith(" on") or "on" in cls.split()


def enter_history_edit(page):
    if not in_history_edit(page):
        page.locator('[data-testid="history-edit"]').tap()
        page.wait_for_timeout(50)


def open_hist_menu(page, menu_id):
    page.locator(f'[data-testid="hist-menu-{menu_id}"]').tap()
    page.wait_for_selector(f'[data-testid="hist-menu-panel-{menu_id}"]:not(.hidden)')


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser, context = launch_context(p)
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        choose_days_if_needed(page)
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')

        info = seed(page)
        page.evaluate("() => window.VELA_APP.render()")
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        print("seed", json.dumps(info))
        check(info["signs"] == ["up", "same", "down"], "current signs vs 50kg prior are up/same/down", json.dumps(info))
        check(info["prev"] == "prior-week", "previous session is prior-week, not the older 60kg week")

        # Open history, screenshot in edit mode
        page.locator('[data-action="history"][data-ex="0"]').tap()
        page.wait_for_selector('[data-testid="history-sheet"]')
        check(page.locator('[data-testid="history-entry"]').count() >= 2, "history lists current and prior sessions")
        page.locator('[data-testid="history-edit"]').tap()
        page.wait_for_selector('[data-testid="history-edit"]')
        check(in_history_edit(page) and page.locator('[data-testid="history-edit"]').inner_text() == "Edit", "Edit mode is on (header stays Edit)")
        check(page.locator('[data-action="delete-hist-set"]').count() >= 3, "edit mode shows per-set delete")
        # Session-level deletes live in the ⋯ menu
        open_hist_menu(page, "prior-week")
        check(page.locator('[data-testid="delete-hist-session-prior-week"]').count() == 1, "⋯ menu can delete an entire session")
        shot(page, "history-delete.png")

        # Delete the immediate prior exercise entry (50kg). Signs should fall back to 60kg week.
        page.locator('[data-testid="delete-hist-exercise-prior-week"]').tap()
        confirm_delete(page)
        page.wait_for_selector('[data-testid="history-sheet"]')
        st = signs(page)
        print("after delete prior entry", json.dumps(st))
        check(st["prev"] == "prior-old" and st["prevW"] == 60, "overload falls back to the next older session (60kg)", json.dumps(st))
        check(st["signs"] == ["down", "down", "down"], "all current sets are now down vs 60kg")
        check(page.locator("#toast").inner_text().lower().find("undo") >= 0 or "deleted" in page.locator("#toast").inner_text().lower(), "undo toast after delete")
        # Undo restores the 50kg session and original signs
        page.locator("#toast button").tap()
        page.wait_for_timeout(200)
        st = signs(page)
        check(st["prev"] == "prior-week" and st["signs"] == ["up", "same", "down"], "undo restores prior session and original signs", json.dumps(st))

        # Delete a single set from the current session → un-grey that chip
        # Re-enter edit if undo re-rendered
        enter_history_edit(page)
        sid = st["sessionId"]
        page.locator(f'[data-testid="delete-hist-set-seated-leg-curl-{sid}-0"]').tap()
        confirm_delete(page)
        page.wait_for_selector('[data-testid="history-sheet"]')
        st = signs(page)
        print("after delete current set 1", json.dumps(st))
        check(st["done"][0] is False, "current set 1 is un-greyed (not done)")
        check(st["done"][1] is True and st["done"][2] is True, "other current sets stay logged")
        check("chip pending" in (page.locator('[data-testid="set-chip-0-0"]').get_attribute("class") or ""), "set 1 chip is pending/un-greyed")
        check(st["vol"]["kg"] == 50 * 8 + 48 * 8, "exercise volume no longer includes the deleted set", str(st["vol"]))

        # Undo the set delete
        page.locator("#toast button").tap()
        page.wait_for_timeout(200)
        st = signs(page)
        check(st["done"][0] is True and st["signs"][0] == "up", "undo restores the deleted current set", json.dumps(st))

        # Edit set 2 of the current session: 50 → 52.5, same 8 reps → up
        enter_history_edit(page)
        page.locator(f'[data-testid="edit-hist-set-seated-leg-curl-{st["sessionId"]}-1"]').tap()
        page.wait_for_selector('[data-testid="edit-hist-set-sheet"]')
        page.locator('[data-testid="hist-reps-input"]').fill("8")
        page.locator('[data-testid="hist-weight-input"]').fill("52,5")
        page.locator('[data-testid="save-hist-set"]').tap()
        page.wait_for_selector('[data-testid="history-sheet"]')
        st = signs(page)
        print("after edit set 2", json.dumps(st))
        check(st["weights"][1] == 52.5, "current set 2 weight is 52.5")
        check(st["signs"][1] == "up", "set 2 is now up (52.5 > 50)")
        chip = page.locator('[data-testid="set-chip-0-1"]').inner_text()
        check("52.50" in chip or "52,5" in chip or "52.5" in chip, "greyed chip shows edited weight", chip)

        # Session view + delete entire prior-week session (curl + extension)
        open_hist_menu(page, "prior-week")
        page.locator('[data-testid="open-hist-session-prior-week"]').tap()
        page.wait_for_selector('[data-testid="history-back"]')
        body = page.inner_text('[data-testid="history-sheet"]')
        check("Seated Leg Curl" in body and "Leg Extension" in body, "session view lists both exercises")
        open_hist_menu(page, "session")
        page.locator('[data-testid="delete-hist-session"]').tap()
        confirm_delete(page)
        page.wait_for_selector('[data-testid="history-sheet"]')
        st = signs(page)
        print("after delete prior session", json.dumps(st))
        check(st["prev"] == "prior-old", "after deleting the whole session, previous is the older 60kg week")
        check(st["extLen"] == 0, "leg-extension history for that session is gone")
        # Current signs vs 60
        check(st["signs"][0] == "down", "current set 1 is down vs 60kg after session delete")

        # Delete entire current session → un-grey all current curl sets
        if page.locator('[data-testid="history-back"]').count():
            page.locator('[data-testid="history-back"]').tap()
        curr = signs(page)["sessionId"]
        open_hist_menu(page, curr)
        page.locator(f'[data-testid="delete-hist-session-{curr}"]').tap()
        confirm_delete(page)
        page.wait_for_selector('[data-testid="history-sheet"]')
        st = signs(page)
        print("after delete current session", json.dumps(st))
        check(st["done"] == [False, False, False], "all current sets un-greyed after deleting today's session")
        check(st["vol"]["kg"] == 0, "current exercise volume is 0 after session delete")
        check(st["histLen"] == 1, "only the older 60kg session remains for this exercise", str(st["histLen"]))

        # Persist across reload
        page.locator('[data-action="close-sheet"]').tap()
        page.locator('[data-action="back"]').tap()
        page.wait_for_selector('[data-testid="week-plan"]')
        page.reload(wait_until="networkidle")
        choose_days_if_needed(page)
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        st = signs(page)
        check(st["done"] == [False, False, False], "un-greyed sets persist after reload")
        check(st["histLen"] == 1 and st["prev"] == "prior-old", "deleted session stays gone after reload", json.dumps(st))

        browser.close()
    httpd.shutdown()
    print()
    if fails:
        print(f"{len(fails)} failed:")
        for f in fails:
            print(" -", f)
        sys.exit(1)
    print("all v8 checks passed")
    sys.exit(0)


if __name__ == "__main__":
    main()
