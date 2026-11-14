"""VELA v14: slightly smaller overload badges (18px disc, ~12px arrow)."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v14"))
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


INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


SEED = """() => {
  const D = window.VELA_DATA;
  D.switchProgram("max-ot");
  const s = D.get();
  s.week = 2;
  s.history = s.history || {};
  s.history["incline-barbell-press"] = [{
    date: "2026-11-07", datetime: "2026-11-07T18:00:00.000Z",
    workout: "Chest & Triceps", workoutId: "maxot-chest", week: 1,
    programId: "max-ot", sessionId: "ses-barbell-old",
    sets: [{reps:8,weight:60},{reps:8,weight:60},{reps:8,weight:60}]
  }];
  const w = (s.workouts || []).find((wo) => wo.id === "maxot-chest");
  const barbell = w && w.exercises.find((ex) => ex.key === "incline-barbell-press");
  if (barbell) barbell.sets.forEach((st) => { st.done = true; st.weight = 70; st.reps = 8; });
  D.saveNow();
  return true;
}"""


MEASURE = """() => {
  const chip = document.querySelector('[data-testid="set-chip-0-0"]');
  const badge = chip && chip.querySelector('.badge');
  const label = chip && chip.querySelector('.chip-label');
  const svg = badge && badge.querySelector('svg');
  const vol = document.querySelector('[data-testid="volume-vs-last-0"] .badge');
  const line = document.querySelector('[data-testid="overload-summary-0"] .badge');
  const box = (el) => el && (() => {
    const r = el.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1), mid: +(r.top + r.height / 2).toFixed(1) };
  })();
  const br = box(badge), lr = box(label), sr = box(svg), vr = box(vol), or_ = box(line);
  const midDelta = (br && lr) ? Math.abs(br.mid - lr.mid) : null;
  return {
    cache: (self.registration && false) || document.documentElement.innerHTML.includes("vela-v"),
    badge: br, label: lr, svg: sr, vol: vr, overload: or_, midDelta,
    chipH: chip ? +chip.getBoundingClientRect().height.toFixed(1) : null,
    bg: badge ? getComputedStyle(badge).backgroundColor : null,
  };
}"""


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
        page.add_style_tag(content=INSETS)
        if page.locator('[data-testid="days-setup"]').count():
            page.locator('[data-testid="days-option-4"]').tap()
            page.wait_for_selector('[data-testid="days-setup"]', state="detached")
        page.wait_for_selector('[data-testid="week-plan"]')
        page.evaluate(SEED)
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.wait_for_selector('[data-testid="workout-tile-maxot-chest"]')
        page.locator('[data-testid="workout-tile-maxot-chest"]').tap()
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        m = page.evaluate(MEASURE)
        print("metrics", m)
        check(m["badge"] and 17 <= m["badge"]["w"] <= 20 and 17 <= m["badge"]["h"] <= 20, "badge disc is ~18px", str(m.get("badge")))
        check(m["svg"] and 11 <= m["svg"]["w"] <= 13 and 11 <= m["svg"]["h"] <= 13, "arrow is ~12px", str(m.get("svg")))
        check(m["midDelta"] is not None and m["midDelta"] <= 1.0, "badge is vertically centered with pill text", str(m.get("midDelta")))
        check(m["vol"] and 17 <= m["vol"]["w"] <= 20, "volume badge is ~18px", str(m.get("vol")))
        check(m["overload"] and 17 <= m["overload"]["w"] <= 20, "overload-line badge is ~18px", str(m.get("overload")))
        page.screenshot(path=str(SHOTS / "set-pills.png"), full_page=False)
        browser.close()
    httpd.shutdown()
    print("fails:", fails)
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
