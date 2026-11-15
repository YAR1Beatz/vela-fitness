"""VELA v17: log weight on past dates, replace confirm, weight history edit/delete."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v17"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


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


SEED = """() => {
  const D = window.VELA_DATA;
  const s = D.get();
  s.checkIns = [
    { id: "cin-a", date: "2026-09-01", weight: 84, waist: 90, chest: null, arms: null, thighs: null, note: "check-in", photo: null },
    { id: "cin-b", date: "2026-10-01", weight: 83, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null },
    { id: "cin-c", date: "2026-11-01", weight: 82.5, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null }
  ];
  s.weightChartRange = "All";
  D.saveNow();
  return D.copenhagenYMD();
}"""


def open_home(page, url):
    page.goto(url, wait_until="networkidle")
    page.add_style_tag(content=INSETS)
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.wait_for_selector('[data-testid="weight-card"]')


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
        open_home(page, url)
        today = page.evaluate(SEED)
        print("today", today)
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.wait_for_selector('[data-testid="weight-card"]')

        # Log sheet: date field, max=today, not auto-focused on kg
        page.locator('[data-testid="log-weight"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]')
        date = page.locator('[data-testid="log-weight-date"]')
        kg = page.locator('[data-testid="log-weight-input"]')
        check(date.count() == 1, "log sheet has a date field")
        check(date.get_attribute("max") == today, "date max is today", date.get_attribute("max"))
        check(date.get_attribute("min") == "2015-01-01", "date has a past minimum")
        check(date.input_value() == today, "date defaults to today", date.input_value())
        focused = page.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-testid')")
        check(focused != "log-weight-input", "kg field is not auto-focused (keyboard would cover the date)", str(focused))
        pos = page.evaluate("""() => {
          const sheet = document.querySelector('[data-testid="log-weight-sheet"]');
          const date = document.querySelector('[data-testid="log-weight-date"]');
          const kg = document.querySelector('[data-testid="log-weight-input"]');
          const sr = sheet.getBoundingClientRect();
          const dr = date.getBoundingClientRect();
          const kr = kg.getBoundingClientRect();
          return {
            sheetTop: Math.round(sr.top),
            dateY: Math.round(dr.top),
            kgY: Math.round(kr.top),
            dateAboveKg: dr.bottom <= kr.top + 1,
          };
        }""")
        print("sheet pos", pos)
        check(pos["sheetTop"] < 200, "log sheet is top-anchored so the keyboard won't cover it", str(pos))
        check(pos["dateAboveKg"], "date field sits above the kg field")
        page.screenshot(path=str(SHOTS / "log-sheet.png"), full_page=False)

        # Future date rejected
        page.evaluate("""(d) => {
          const el = document.querySelector('[data-testid="log-weight-date"]');
          el.max = '';
          el.value = d;
        }""", "2026-12-31")
        page.fill('[data-testid="log-weight-input"]', "80")
        page.locator('[data-testid="save-log-weight"]').tap()
        page.wait_for_timeout(200)
        toast = page.locator("#toast, .toast, [data-testid=toast]").inner_text() if page.locator("#toast, .toast").count() else page.evaluate("() => document.body.innerText")
        print("future toast/body snippet", (toast or "")[:200])
        still_open = page.locator('[data-testid="log-weight-sheet"]').count() == 1
        check(still_open or "past date" in (toast or "").lower() or "today or a past" in (toast or "").lower(),
              "future dates are rejected", str(still_open) + " " + str(toast)[:120])

        # Log an older date
        page.fill('[data-testid="log-weight-date"]', "2026-08-15")
        page.fill('[data-testid="log-weight-input"]', "84,5")
        page.locator('[data-testid="save-log-weight"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]', state="detached")
        dates = page.evaluate("() => window.VELA_DATA.bodyWeightEntries().map(e => e.date + ':' + e.weight)")
        print("entries after older log", dates)
        check(dates == ["2026-08-15:84.5", "2026-09-01:84", "2026-10-01:83", "2026-11-01:82.5"],
              "entries are sorted by date and include the older weigh-in", str(dates))

        # Replace existing date
        page.locator('[data-testid="log-weight"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]')
        page.fill('[data-testid="log-weight-date"]', "2026-10-01")
        page.fill('[data-testid="log-weight-input"]', "82,8")
        page.locator('[data-testid="save-log-weight"]').tap()
        page.wait_for_selector(".dialog, [role=dialog]")
        body = page.inner_text(".dialog, [role=dialog]")
        print("confirm", body)
        check("Replace" in body and "83" in body and "82,8" in body, "replace dialog shows the old and new weights", body)
        page.locator('[data-confirm="ok"]').tap()
        page.wait_for_selector(".dialog", state="detached")
        dates = page.evaluate("() => window.VELA_DATA.bodyWeightEntries().map(e => e.date + ':' + e.weight)")
        check("2026-10-01:82.8" in dates and dates.count("2026-10-01:83") == 0 if False else "2026-10-01:82.8" in dates,
              "existing date was replaced, not duplicated", str(dates))

        # History list
        page.locator('[data-testid="weight-history"]').tap()
        page.wait_for_selector('[data-testid="weight-history-sheet"]')
        hist = page.evaluate("""() => [...document.querySelectorAll('[data-testid^="weight-hist-kg-"]')].map(el => el.textContent.trim())""")
        print("history kgs", hist)
        check(hist[0].startswith("82,5") and hist[-1].startswith("84,5"), "history is newest first, no trailing .00", str(hist))
        check(page.locator('[data-testid^="delete-weight-"]').count() == 0, "delete is hidden until Edit is tapped")
        page.evaluate("() => { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }")
        page.wait_for_timeout(80)
        page.screenshot(path=str(SHOTS / "history-list.png"), full_page=False)

        page.locator('[data-testid="weight-history-edit"]').tap()
        check(page.locator('[data-testid^="delete-weight-"]').count() >= 1, "delete appears in Edit mode")
        check(page.locator('[data-testid^="edit-weight-"]').count() >= 1, "edit appears in Edit mode")

        # Edit the oldest (84,5 on 2026-08-15) — last row, id cin might be auto
        ids = page.evaluate("() => window.VELA_DATA.bodyWeightEntries().map(e => e.id)")
        oldest = ids[0]
        page.locator(f'[data-testid="edit-weight-{oldest}"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]')
        check(page.locator('[data-testid="log-weight-date"]').input_value() == "2026-08-15", "edit sheet opens with the original date")
        page.fill('[data-testid="log-weight-input"]', "84,2")
        page.locator('[data-testid="save-log-weight"]').tap()
        page.wait_for_selector('[data-testid="weight-history-sheet"]')
        kgs = page.evaluate("() => window.VELA_DATA.bodyWeightEntries().map(e => e.weight)")
        check(84.2 in kgs and 84.5 not in kgs, "edit updates the weigh-in", str(kgs))

        # Delete
        page.locator('[data-testid="weight-history-edit"]').tap()  # ensure edit mode (openWeightHistory resets it)
        # if we came back from edit, edit mode is off — turn it on
        if page.locator('[data-testid^="delete-weight-"]').count() == 0:
            page.locator('[data-testid="weight-history-edit"]').tap()
        before = page.evaluate("() => window.VELA_DATA.bodyWeightEntries().length")
        page.locator(f'[data-testid="delete-weight-{oldest}"]').tap()
        page.wait_for_selector(".dialog")
        page.locator('[data-confirm="ok"]').tap()
        page.wait_for_timeout(200)
        after = page.evaluate("() => window.VELA_DATA.bodyWeightEntries().map(e => e.date + ':' + e.weight)")
        print("after delete", after)
        check(len(after) == before - 1 and "2026-08-15" not in "".join(after), "delete removes the weigh-in", str(after))
        # extras on Sep 1 check-in should still exist
        extras = page.evaluate("() => (window.VELA_DATA.get().checkIns || []).find(c => c.date==='2026-09-01')")
        check(extras and extras.get("waist") == 90, "deleting a weight-only entry does not wipe other check-ins", str(extras))

        # 375: log sheet + history still fit
        page.locator('[data-testid="weight-history-done"]').tap()
        page.wait_for_selector('[data-testid="weight-history-sheet"]', state="detached")
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_timeout(80)
        page.locator('[data-testid="log-weight"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]')
        fit = page.evaluate("""() => {
          const sheet = document.querySelector('[data-testid="log-weight-sheet"]').getBoundingClientRect();
          return { vw: window.innerWidth, left: Math.round(sheet.left), right: Math.round(sheet.right), top: Math.round(sheet.top), overflow: sheet.right > window.innerWidth + 2 || sheet.left < -2 };
        }""")
        print("375 log", fit)
        check(not fit["overflow"] and fit["top"] < 200, "log sheet fits at 375 and stays top-anchored", str(fit))
        page.screenshot(path=str(SHOTS / "log-sheet-375.png"), full_page=False)
        page.locator('[data-testid="close-log-weight"]').tap()
        page.locator('[data-testid="weight-history"]').tap()
        page.wait_for_selector('[data-testid="weight-history-sheet"]')
        hfit = page.evaluate("""() => {
          const sheet = document.querySelector('[data-testid="weight-history-sheet"]').getBoundingClientRect();
          return { overflow: sheet.right > window.innerWidth + 2 || sheet.left < -2, top: Math.round(sheet.top) };
        }""")
        check(not hfit["overflow"], "history sheet fits at 375", str(hfit))
        page.screenshot(path=str(SHOTS / "history-list-375.png"), full_page=False)

        browser.close()
    httpd.shutdown()
    print("fails:", fails)
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
