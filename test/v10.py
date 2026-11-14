"""VELA v10: tab bar flush + safe-area, content padding, header blur fix, even tiles."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v10"))
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


INSETS = {
    (390, 844): (47, 34),
    (430, 932): (59, 34),
}


def launch(p, w, h):
    browser = p.chromium.launch(
        executable_path="/usr/bin/google-chrome",
        args=["--no-sandbox"],
    )
    context = browser.new_context(
        viewport={"width": w, "height": h},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ),
    )
    top, bottom = INSETS[(w, h)]
    context.add_init_script(
        f"""
        (() => {{
          const s = document.createElement("style");
          s.setAttribute("data-vela-insets", "1");
          s.textContent = `:root {{ --safe-top: {top}px !important; --safe-bottom: {bottom}px !important; }}`;
          document.documentElement.appendChild(s);
        }})();
        """
    )
    return browser, context, top, bottom


def choose_days_if_needed(page, days=4):
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")


def metrics(page, vh, safe_top, safe_bottom):
    return page.evaluate(
        """({ vh, safeTop, safeBottom }) => {
          const app = document.getElementById('app');
          const header = document.querySelector('header.header, .header');
          const row = document.querySelector('.header-row');
          const word = document.querySelector('.header .word');
          const content = document.querySelector('.content');
          const bar = document.querySelector('[data-testid="tab-bar"]');
          const label = bar && bar.querySelector('.tab-btn span');
          const tiles = [...document.querySelectorAll('.dash-tile')];
          const nums = tiles.map(t => t.querySelector('b'));
          const labels = tiles.map(t => t.querySelector('span'));
          const workoutTiles = [...document.querySelectorAll('[data-testid="week-plan"] .swipe-row, [data-testid="week-plan"] .tile')];
          const appCs = getComputedStyle(app);
          const headerCs = getComputedStyle(header);
          const contentCs = getComputedStyle(content);
          const barCs = getComputedStyle(bar);
          const appR = app.getBoundingClientRect();
          const headerR = header.getBoundingClientRect();
          const rowR = row.getBoundingClientRect();
          const wordR = word.getBoundingClientRect();
          const barR = bar.getBoundingClientRect();
          const labelR = label.getBoundingClientRect();
          const contentR = content.getBoundingClientRect();
          const last = workoutTiles.at(-1);
          return {
            app: {
              top: appR.top, bottom: appR.bottom, height: appR.height,
              overflow: appCs.overflow, overflowY: appCs.overflowY,
              position: appCs.position, heightCss: appCs.height,
              transform: appCs.transform, filter: appCs.filter,
              backdrop: appCs.backdropFilter || appCs.webkitBackdropFilter,
            },
            header: {
              top: headerR.top, bottom: headerR.bottom,
              rowTop: rowR.top, wordTop: wordR.top,
              bg: headerCs.backgroundColor,
              backdrop: headerCs.backdropFilter || headerCs.webkitBackdropFilter,
              filter: headerCs.filter, transform: headerCs.transform,
              overflow: headerCs.overflow,
              paddingTop: parseFloat(headerCs.paddingTop),
            },
            content: {
              overflowY: contentCs.overflowY,
              paddingBottom: parseFloat(contentCs.paddingBottom),
              paddingTop: parseFloat(contentCs.paddingTop),
              paddingLeft: parseFloat(contentCs.paddingLeft),
              top: contentR.top, bottom: contentR.bottom,
            },
            tabbar: {
              y: barR.top, bottom: barR.bottom, height: barR.height,
              paddingBottom: parseFloat(barCs.paddingBottom),
              position: barCs.position,
              labelBottom: labelR.bottom,
              iconPad: vh - labelR.bottom,
              gapBelow: vh - barR.bottom,
            },
            tiles: tiles.map((t, i) => {
              const r = t.getBoundingClientRect();
              const n = nums[i].getBoundingClientRect();
              const s = labels[i].getBoundingClientRect();
              return { y: r.y, h: r.height, numY: n.y, numBottom: n.bottom, labY: s.y, labH: s.height };
            }),
            lastTile: last ? last.getBoundingClientRect() : null,
            tabbarSpace: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-space').trim(),
            tabbarH: getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim(),
          };
        }""",
        {"vh": vh, "safeTop": safe_top, "safeBottom": safe_bottom},
    )


def run_size(page, url, w, h, top, bottom, take_shots):
    tag = f"{w}x{h}"
    page.goto(url, wait_until="networkidle")
    page.add_style_tag(content=(
        f":root {{ --safe-top: {top}px !important; --safe-bottom: {bottom}px !important; }}"
    ))
    choose_days_if_needed(page, 4)
    page.wait_for_selector('[data-testid="week-plan"]')
    page.wait_for_timeout(80)
    # confirm CSS variables took
    got = page.evaluate("""() => ({
      top: getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
      bottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'),
    })""")
    print("injected vars", got)

    m = metrics(page, h, top, bottom)
    print(f"\n=== {tag} insets {top}/{bottom} ===")
    print("app", m["app"])
    print("header", m["header"])
    print("content pad", m["content"])
    print("tabbar", m["tabbar"])
    print("tiles", m["tiles"])
    print("space", m["tabbarSpace"], "h", m["tabbarH"])

    # Shell fills the viewport; no 100dvh shortfall pattern
    check(abs(m["app"]["top"]) <= 1, f"{tag} app top at 0", str(m["app"]["top"]))
    check(abs(m["app"]["bottom"] - h) <= 1, f"{tag} app fills viewport bottom", f"{m['app']['bottom']} vs {h}")
    check(m["app"]["overflow"] in ("visible", "auto"), f"{tag} app overflow not hidden", m["app"]["overflow"])
    check("100dvh" not in (m["app"]["heightCss"] or ""), f"{tag} app height is not 100dvh", m["app"]["heightCss"])
    check(m["app"]["transform"] in ("none", "matrix(1, 0, 0, 1, 0, 0)"), f"{tag} app no transform", m["app"]["transform"])
    check((m["app"]["backdrop"] or "none") in ("none", ""), f"{tag} app no backdrop-filter", m["app"]["backdrop"])

    # Header below status bar, solid navy, no blur filters
    check(abs(m["header"]["paddingTop"] - top) <= 1, f"{tag} header padding-top == safe-top", f"{m['header']['paddingTop']} vs {top}")
    check(m["header"]["rowTop"] + 0.5 >= top, f"{tag} header row below status bar", f"rowTop={m['header']['rowTop']} safeTop={top}")
    check(m["header"]["wordTop"] + 0.5 >= top, f"{tag} VELA wordmark below status bar", f"wordTop={m['header']['wordTop']}")
    bg = m["header"]["bg"]
    # rgb(7, 17, 31) = #07111F
    check("7, 17, 31" in bg or "7,17,31" in bg, f"{tag} header solid navy", bg)
    check((m["header"]["backdrop"] or "none") in ("none", ""), f"{tag} header no backdrop-filter", m["header"]["backdrop"])
    check((m["header"]["filter"] or "none") in ("none", ""), f"{tag} header no filter", m["header"]["filter"])

    # Tab bar flush to the bottom, only safe-bottom under icons
    tb = m["tabbar"]
    check(abs(tb["gapBelow"]) <= 1.5, f"{tag} tab bar flush to bottom", f"gap={tb['gapBelow']} bottom={tb['bottom']} vh={h}")
    check(abs(tb["iconPad"] - bottom) <= 4, f"{tag} ~{bottom}px under tab labels", f"iconPad={tb['iconPad']:.1f}")
    check(abs(tb["paddingBottom"] - bottom) <= 1, f"{tag} tabbar padding-bottom == safe-bottom", f"{tb['paddingBottom']} vs {bottom}")
    check(tb["position"] in ("absolute", "fixed"), f"{tag} tabbar is taken out of flow", tb["position"])

    # Content reserves tab bar + safe area + ~16px
    pb = m["content"]["paddingBottom"]
    check(pb >= 16 + 50 + bottom - 4, f"{tag} content padding-bottom reserves tab bar + safe + 16", f"paddingBottom={pb}")
    check(m["content"]["overflowY"] in ("auto", "scroll", "overlay"), f"{tag} content is the scrolling/clipping layer", m["content"]["overflowY"])
    check(abs(m["content"]["paddingLeft"] - 16) <= 1 or m["content"]["paddingLeft"] >= 16, f"{tag} 16px screen edge", str(m["content"]["paddingLeft"]))
    check(m["content"]["paddingTop"] >= 15, f"{tag} 16px below header before first card", str(m["content"]["paddingTop"]))

    # Last workout card not covered after scrolling to the end
    page.evaluate("document.querySelector('.content').scrollTop = 20000")
    page.wait_for_timeout(60)
    m2 = metrics(page, h, top, bottom)
    last = m2["lastTile"]
    check(last is not None, f"{tag} last workout tile present")
    if last:
        gap = m2["tabbar"]["y"] - last["bottom"]
        check(gap >= 8, f"{tag} last workout card sits above the tab bar", f"gap={gap:.1f} tileBottom={last['bottom']:.1f} barTop={m2['tabbar']['y']:.1f}")
        check(last["bottom"] <= h - bottom + 1, f"{tag} last card not in the home-indicator band", f"bottom={last['bottom']}")
    # scroll back for shots
    page.evaluate("document.querySelector('.content').scrollTop = 0")
    page.wait_for_timeout(40)

    # Dashboard tiles: numbers share a baseline, equal heights, labels top-aligned
    tiles = m["tiles"]
    check(len(tiles) == 4, f"{tag} four dashboard tiles", str(len(tiles)))
    if tiles:
        heights = [round(t["h"], 1) for t in tiles]
        numYs = [round(t["numY"], 1) for t in tiles]
        labYs = [round(t["labY"], 1) for t in tiles]
        check(max(heights) - min(heights) <= 1, f"{tag} equal tile heights", str(heights))
        check(max(numYs) - min(numYs) <= 1, f"{tag} tile numbers share a baseline", str(numYs))
        check(max(labYs) - min(labYs) <= 1, f"{tag} tile labels top-aligned", str(labYs))
        check(all(t["labY"] > t["numBottom"] - 0.5 for t in tiles), f"{tag} labels sit under the numbers")

    if take_shots:
        page.screenshot(path=str(SHOTS / "home-after.png"), full_page=False)
        page.screenshot(
            path=str(SHOTS / "home-top.png"),
            clip={"x": 0, "y": 0, "width": w, "height": 220},
        )
        print("shot", SHOTS / "home-after.png")
        print("shot", SHOTS / "home-top.png")
        page.locator('[data-testid="tab-program"]').tap()
        page.wait_for_timeout(200)
        page.screenshot(path=str(SHOTS / "program-tab.png"), full_page=False)
        print("shot", SHOTS / "program-tab.png")
        # also a tight crop of the program status-bar area
        page.screenshot(
            path=str(SHOTS / "program-top.png"),
            clip={"x": 0, "y": 0, "width": w, "height": 180},
        )
        page.locator('[data-testid="tab-home"]').tap()
        page.wait_for_timeout(80)


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        for i, (w, h) in enumerate(((390, 844), (430, 932))):
            browser, context, top, bottom = launch(p, w, h)
            page = context.new_page()
            run_size(page, url, w, h, top, bottom, take_shots=(i == 0))
            browser.close()
    httpd.shutdown()
    print()
    if fails:
        print(f"{len(fails)} FAILED:", "; ".join(fails))
        sys.exit(1)
    print("all v10 checks passed")


if __name__ == "__main__":
    main()
