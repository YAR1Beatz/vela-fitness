"""VELA v16: Body weight card and chart under the consistency streak."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v16"))
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
    { id: "cin-a", date: "2026-07-15", weight: 84, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null },
    { id: "cin-b", date: "2026-08-15", weight: 83.2, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null },
    { id: "cin-c", date: "2026-09-15", weight: 82.8, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null },
    { id: "cin-d", date: "2026-10-15", weight: 82.5, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null },
    { id: "cin-e", date: "2026-11-01", weight: 82.1, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null },
    { id: "cin-f", date: "2026-11-14", weight: 81.6, waist: null, chest: null, arms: null, thighs: null, note: "", photo: null }
  ];
  s.weightChartRange = "All";
  D.saveNow();
  const series = D.bodyWeightSeries("All");
  return {
    n: series.all.length,
    current: series.current && series.current.weight,
    vsPrev: series.vsPrev,
    vsFirst: series.vsFirst,
    fmt: window.VELA_CATALOG.formatNumber(81.6),
    fmtInt: window.VELA_CATALOG.formatNumber(84),
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
        page.wait_for_selector('[data-testid="stats-card"]')

        # Empty state before seeding
        check(page.locator('[data-testid="weight-card"]').count() == 1, "weight card sits on Home")
        # card should be immediately after the streak/stats card
        order = page.evaluate("""() => {
          const kids = [...document.querySelector('#content').children];
          return kids.map((el) => el.getAttribute('data-testid') || el.className.split(' ')[0]);
        }""")
        print("home children", order)
        si = next((i for i, k in enumerate(order) if k == "stats-card"), -1)
        wi = next((i for i, k in enumerate(order) if k == "weight-card"), -1)
        check(si >= 0 and wi == si + 1, "weight card is directly under the streak/stats card", str(order))
        check(page.locator('[data-testid="weight-empty"]').count() == 1, "empty state when fewer than 2 entries")
        check(page.locator('[data-testid="weight-chart"]').count() == 0, "no chart in empty state")
        check(page.locator('[data-testid="log-weight"]').count() == 1, "empty state still has Log weight")

        seed = page.evaluate(SEED)
        print("seed", seed)
        check(seed["fmt"] == "81,6", "81.6 formats as 81,6 without extra decimals", str(seed["fmt"]))
        check(seed["fmtInt"] == "84", "84 has no trailing .00", str(seed["fmtInt"]))
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.wait_for_selector('[data-testid="weight-card"]')

        cur = page.inner_text('[data-testid="weight-current"]')
        print("current", cur)
        check("81,6" in cur and "kg" in cur, "current weight shows 81,6 kg", cur)
        check("81,60" not in cur and "81.60" not in cur and "81.00" not in cur, "no trailing zeros", cur)
        delta = page.inner_text('[data-testid="weight-delta"]')
        print("delta", delta)
        check("vs last" in delta and "vs start" in delta, "shows vs last and vs start", delta)
        check("−0,5 kg" in delta or "-0,5 kg" in delta, "vs last is −0,5 kg", delta)
        check("−2,4 kg" in delta or "-2,4 kg" in delta, "vs start is −2,4 kg", delta)
        # both deltas should be the 'down' (loss = green) class
        cls = page.get_attribute('[data-testid="weight-delta-prev"]', "class")
        check(cls and "down" in cls, "weight loss is the green/down class", str(cls))

        check(page.locator('[data-testid="weight-chart"]').count() == 1, "chart is rendered")
        chart = page.evaluate("""() => {
          const svg = document.querySelector('[data-testid="weight-chart"]');
          if (!svg) return null;
          const line = svg.querySelector('path.line');
          const area = svg.querySelector('path.area');
          const dots = svg.querySelectorAll('circle').length;
          const box = svg.getBoundingClientRect();
          const card = document.querySelector('[data-testid="weight-card"]').getBoundingClientRect();
          return {
            d: line && line.getAttribute('d'),
            hasC: !!(line && line.getAttribute('d') && line.getAttribute('d').includes('C')),
            area: !!(area && area.getAttribute('d')),
            dots,
            w: Math.round(box.width),
            overflow: box.right > card.right + 2 || box.left < card.left - 2,
            stroke: line && getComputedStyle(line).stroke,
          };
        }""")
        print("chart", {k: chart[k] for k in chart if k != "d"})
        check(chart and chart["hasC"], "line is a smooth (cubic) path")
        check(chart and chart["area"], "area fill is present")
        check(chart and chart["dots"] == 6, "All range shows 6 points", str(chart and chart["dots"]))
        check(chart and not chart["overflow"], "chart stays inside the card at 440")

        # Range toggles
        page.locator('[data-testid="weight-range-1M"]').tap()
        page.wait_for_timeout(80)
        n1 = page.locator('[data-testid="weight-chart"] circle').count()
        print("1M dots", n1)
        check(n1 >= 2 and n1 <= 5, "1M shows a shorter series (with possible carry-in)", str(n1))
        page.locator('[data-testid="weight-range-3M"]').tap()
        page.wait_for_timeout(80)
        n3 = page.locator('[data-testid="weight-chart"] circle').count()
        print("3M dots", n3)
        check(n3 >= n1, "3M has at least as many points as 1M", f"{n3} vs {n1}")
        page.locator('[data-testid="weight-range-All"]').tap()
        page.wait_for_timeout(80)
        check(page.locator('[data-testid="weight-chart"] circle').count() == 6, "All returns to 6 points")
        check("on" in (page.get_attribute('[data-testid="weight-range-All"]', "class") or ""), "All toggle is active")

        # Screenshot at the top so the card sits under the streak, as on Home
        page.evaluate("() => { const c = document.querySelector('#content'); if (c) c.scrollTop = 0; }")
        page.wait_for_timeout(80)
        page.screenshot(path=str(SHOTS / "weight-graph.png"), full_page=False)

        # Quick log
        page.locator('[data-testid="log-weight"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]')
        page.fill('[data-testid="log-weight-input"]', "81,4")
        page.locator('[data-testid="save-log-weight"]').tap()
        page.wait_for_selector('[data-testid="log-weight-sheet"]', state="detached")
        cur = page.inner_text('[data-testid="weight-current"]')
        check("81,4" in cur, "quick log updates current weight", cur)
        check(page.locator('[data-testid="weight-chart"] circle').count() == 7, "new point appears on the chart")

        # 375 width overflow
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_timeout(50)
        layout = page.evaluate("""() => {
          const card = document.querySelector('[data-testid="weight-card"]');
          const svg = document.querySelector('[data-testid="weight-chart"]');
          const cr = card.getBoundingClientRect();
          const sr = svg.getBoundingClientRect();
          const head = card.querySelector('.weight-head').getBoundingClientRect();
          return {
            vw: window.innerWidth,
            cardW: Math.round(cr.width),
            svgW: Math.round(sr.width),
            overflow: sr.right > cr.right + 2 || head.right > cr.right + 2,
          };
        }""")
        print("375", layout)
        check(layout and not layout["overflow"], "card/chart fit at 375", str(layout))

        browser.close()
    httpd.shutdown()
    print("fails:", fails)
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
