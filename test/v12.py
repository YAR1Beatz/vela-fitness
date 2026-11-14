"""VELA v12: clean read-only history sheet, Edit in header, ⋯ session menu."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v12"))
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


def choose_days_if_needed(page, days=4):
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")


def seed_bench(page):
    return page.evaluate(
        """() => {
      const D = window.VELA_DATA;
      const s = D.get();
      s.week = 2;
      s.history = s.history || {};
      s.sessions = [];
      const key = 'barbell-bench-press';
      s.history[key] = [];
      const add = (sessionId, week, date, workout, sets) => {
        s.history[key].unshift({
          date, datetime: date + 'T18:00:00.000Z',
          workout, workoutId: 'chest', week, programId: s.activeProgramId,
          sessionId, sets
        });
        const vol = sets.reduce((n, row) => n + (row.weight * row.reps), 0);
        s.sessions.unshift({
          programId: s.activeProgramId, workoutId: 'chest', workoutName: workout, week,
          sessionId, date, datetime: date + 'T18:00:00.000Z',
          durationMs: 40*60000, volumeKg: vol, completed: true
        });
      };
      add('ses-week1', 1, '2026-11-07', 'Chest', [{reps:8,weight:60}]);
      add('ses-week2', 2, '2026-11-14', 'Chest', [{reps:8,weight:60},{reps:8,weight:52.5}]);
      D.saveNow();
      return { n: s.history[key].length, fmt60: D.formatLogged(60, 8), fmt525: D.formatLogged(52.5, 8) };
    }"""
    )


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox"],
        )
        context = browser.new_context(
            viewport={"width": 440, "height": 956},
            screen={"width": 440, "height": 956},
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
        choose_days_if_needed(page, 4)
        page.wait_for_selector('[data-testid="week-plan"]')
        info = seed_bench(page)
        print("seed", info)
        check("60.00" not in info["fmt60"] and "60 kg × 8" in info["fmt60"], "60 formats without .00", info["fmt60"])
        check("52,5 kg × 8" in info["fmt525"] or "52.5 kg × 8" in info["fmt525"], "52.5 keeps one decimal", info["fmt525"])

        page.locator('[data-testid="tab-progress"]').tap()
        page.wait_for_selector('[data-testid="progress-ex-barbell-bench-press"], [data-testid="pb-row-barbell-bench-press"]')
        # history row preferred
        if page.locator('[data-testid="progress-ex-barbell-bench-press"]').count():
            page.locator('[data-testid="progress-ex-barbell-bench-press"]').tap()
        else:
            page.locator('[data-testid="pb-row-barbell-bench-press"]').tap()
        page.wait_for_selector('[data-testid="history-sheet"]')

        body = page.inner_text('[data-testid="history-sheet"]')
        print("normal body:\n", body)
        check("Barbell Bench Press" in body, "sheet title is the exercise")
        check(page.locator('[data-testid="history-edit"]').inner_text() == "Edit", "header has Edit, not Done")
        check(page.locator('.sheet-actions .btn.pri').inner_text() == "Done", "one Done at the bottom")
        check(page.locator(".hist-del").count() == 0, "no visible per-set Delete in read-only")
        check(page.locator('[data-testid^="edit-hist-set-"]').count() == 0, "no visible per-set Edit in read-only")
        # menu items exist but are hidden
        check(page.locator('[data-testid="delete-hist-exercise-ses-week2"]').count() == 1, "delete-exercise lives in ⋯ menu")
        check(page.locator('[data-testid="hist-menu-panel-ses-week2"]').evaluate("el => el.classList.contains('hidden')"), "⋯ menu is closed by default")
        check("Delete this exercise" not in body and "Delete entire session" not in body, "red session deletes are not visible by default", body)
        check("60.00" not in body, "no .00 on weights", body)
        check("60 kg × 8" in body, "set reads '60 kg × 8'", body)
        check("52,5 kg × 8" in body or "52.5 kg × 8" in body, "52.5 set is formatted", body)
        check("Set 1" in body, "set numbers shown")
        check(page.locator('[data-testid="hist-menu-ses-week2"]').count() == 1, "each session has a ⋯ button")
        # header should not contain a second Done
        head = page.locator(".hist-head").inner_text()
        check("Done" not in head, "header does not say Done", head)

        page.screenshot(path=str(SHOTS / "history-normal.png"), full_page=False)
        print("shot history-normal.png")

        # ⋯ menu
        page.locator('[data-testid="hist-menu-ses-week2"]').tap()
        page.wait_for_selector('[data-testid="hist-menu-panel-ses-week2"]:not(.hidden)')
        menu = page.inner_text('[data-testid="hist-menu-panel-ses-week2"]')
        check("View session" in menu, "menu has View session")
        check("Delete this exercise" in menu, "menu has Delete this exercise")
        check("Delete entire session" in menu, "menu has Delete entire session")
        page.screenshot(path=str(SHOTS / "history-menu.png"), full_page=False)
        print("shot history-menu.png")
        # close menu by tapping title
        page.locator(".hist-head h2").tap()
        page.wait_for_timeout(80)
        check(page.locator('[data-testid="hist-menu-panel-ses-week2"]').evaluate("el => el.classList.contains('hidden')"), "tapping outside closes the menu")

        # Edit mode
        page.locator('[data-testid="history-edit"]').tap()
        page.wait_for_timeout(80)
        cls = page.locator('[data-testid="history-edit"]').get_attribute("class") or ""
        check("on" in cls, "Edit is highlighted in edit mode", cls)
        check(page.locator('[data-testid="history-edit"]').inner_text() == "Edit", "header still says Edit in edit mode")
        check(page.locator(".hist-del").count() >= 2, "edit mode shows per-set Delete")
        check(page.locator('[data-testid^="edit-hist-set-"]').count() >= 2, "edit mode shows per-set Edit")
        body2 = page.inner_text('[data-testid="history-sheet"]')
        check("Delete this exercise" not in body2.split("View session")[0] or page.locator('[data-testid="hist-menu-panel-ses-week2"]').evaluate("el => el.classList.contains('hidden')"), "session deletes stay in the ⋯ menu in edit mode")
        check(page.locator('.sheet-actions .btn.pri').inner_text() == "Done", "bottom Done remains")
        page.screenshot(path=str(SHOTS / "history-edit.png"), full_page=False)
        print("shot history-edit.png")

        # Tap a set (read-only also): go back to read-only first? already in edit, use Edit button on set
        # Also verify tap-to-edit works in read-only
        page.locator('[data-testid="history-edit"]').tap()  # leave edit mode
        page.wait_for_timeout(80)
        check(page.locator(".hist-del").count() == 0, "leaving edit hides per-set actions")
        page.locator('[data-testid="history-set-ses-week2-1"]').tap()
        page.wait_for_selector('[data-testid="edit-hist-set-sheet"]')
        check(page.locator('[data-testid="hist-weight-input"]').input_value() in ("52,5", "52.5"), "tap set opens editor with 52,5")
        page.locator('[data-action="history-back"]').tap()
        page.wait_for_selector('[data-testid="history-sheet"]')

        # confirm + undo still work via ⋯
        page.locator('[data-testid="hist-menu-ses-week1"]').tap()
        page.locator('[data-testid="delete-hist-exercise-ses-week1"]').tap()
        page.wait_for_selector(".dialog")
        page.locator(".dialog .btn.danger").tap()
        page.wait_for_selector('[data-testid="history-sheet"]')
        check(page.locator('[data-testid="history-entry"]').count() == 1, "exercise entry deleted from week 1")
        check("undo" in page.locator("#toast").inner_text().lower() or "deleted" in page.locator("#toast").inner_text().lower(), "undo toast shown")
        page.locator("#toast button").tap()
        page.wait_for_timeout(200)
        check(page.locator('[data-testid="history-entry"]').count() == 2, "undo restores the entry")

        # version
        ver = page.evaluate("() => window.VELA_APP.version")
        check(ver == "12", "app version is 12", str(ver))

        browser.close()
    httpd.shutdown()
    print()
    if fails:
        print(f"{len(fails)} FAILED:", "; ".join(fails))
        sys.exit(1)
    print("all v12 checks passed")


if __name__ == "__main__":
    main()
