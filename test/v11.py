"""VELA v11: flush tab bar on real iPhone sizes; Settings version; no body:fixed."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v11"))
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


# name, width, height, safe-top, safe-bottom, dpr
DEVICES = [
    ("16-pro-max", 440, 956, 62, 34, 3),  # primary: iPhone 16 Pro Max
    ("16-pro", 402, 874, 62, 34, 3),
    ("16", 393, 852, 59, 34, 3),
    ("se", 375, 667, 20, 0, 2),
    ("pro-max-old", 430, 932, 59, 34, 3),
]


def launch(p, w, h, dpr):
    browser = p.chromium.launch(
        executable_path="/usr/bin/google-chrome",
        args=["--no-sandbox"],
    )
    context = browser.new_context(
        viewport={"width": w, "height": h},
        screen={"width": w, "height": h},
        device_scale_factor=dpr,
        is_mobile=True,
        has_touch=True,
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        ),
    )
    return browser, context


def insets(page, top, bottom):
    page.add_style_tag(content=(
        f":root {{ --safe-top: {top}px !important; --safe-bottom: {bottom}px !important; }}"
    ))


def choose_days_if_needed(page, days=4):
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")


def metrics(page, vh):
    return page.evaluate(
        """(vh) => {
          const app = document.getElementById('app');
          const header = document.querySelector('.header');
          const row = document.querySelector('.header-row');
          const word = document.querySelector('.header .word');
          const content = document.querySelector('.content');
          const bar = document.querySelector('[data-testid="tab-bar"]');
          const label = bar && bar.querySelector('.tab-btn span');
          const tiles = [...document.querySelectorAll('.dash-tile')];
          const bodyCs = getComputedStyle(document.body);
          const htmlCs = getComputedStyle(document.documentElement);
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
          const workoutTiles = [...document.querySelectorAll(
            '[data-testid="week-plan"] .swipe-row, [data-testid="week-plan"] .tile'
          )];
          const last = workoutTiles.at(-1);
          return {
            version: window.VELA_APP && window.VELA_APP.version,
            cache: window.VELA_APP && window.VELA_APP.cache,
            appHeightVar: htmlCs.getPropertyValue('--app-height').trim(),
            shift: htmlCs.getPropertyValue('--viewport-bottom-shift').trim(),
            bodyPosition: bodyCs.position,
            htmlMinHeight: htmlCs.minHeight,
            app: {
              top: appR.top, bottom: appR.bottom, height: appR.height,
              overflow: appCs.overflow, position: appCs.position,
              heightCss: appCs.height,
            },
            header: {
              paddingTop: parseFloat(headerCs.paddingTop),
              rowTop: rowR.top, wordTop: wordR.top,
              bg: headerCs.backgroundColor,
            },
            content: {
              overflowY: contentCs.overflowY,
              paddingBottom: parseFloat(contentCs.paddingBottom),
              paddingLeft: parseFloat(contentCs.paddingLeft),
            },
            tabbar: {
              position: barCs.position,
              y: barR.top, bottom: barR.bottom, height: barR.height,
              paddingBottom: parseFloat(barCs.paddingBottom),
              background: barCs.backgroundColor,
              labelBottom: labelR.bottom,
              iconPad: vh - labelR.bottom,
              gapBelow: vh - barR.bottom,
            },
            tiles: tiles.map((el) => {
              const r = el.getBoundingClientRect();
              const n = el.querySelector('b').getBoundingClientRect();
              const s = el.querySelector('span').getBoundingClientRect();
              return {
                w: r.width, h: r.height, numY: n.y, labY: s.y,
                label: (el.querySelector('span') || {}).textContent,
                wrapped: s.height > 16,
              };
            }),
            lastTile: last ? last.getBoundingClientRect() : null,
          };
        }""",
        vh,
    )


def run_device(page, url, name, w, h, top, bottom, primary):
    tag = f"{name} {w}x{h}"
    page.goto(url, wait_until="networkidle")
    insets(page, top, bottom)
    choose_days_if_needed(page, 4)
    page.wait_for_selector('[data-testid="week-plan"]')
    page.evaluate("() => window.VELA_APP && window.VELA_APP.syncShellViewport && window.VELA_APP.syncShellViewport()")
    page.wait_for_timeout(80)

    m = metrics(page, h)
    print(f"\n=== {tag} insets {top}/{bottom} ===")
    print("version", m["version"], m["cache"], "appH", m["appHeightVar"], "shift", m["shift"])
    print("body", m["bodyPosition"], "tabbar", m["tabbar"])
    print("tiles", m["tiles"])

    check(m["version"] == "11", f"{tag} VELA_APP.version is 11", str(m["version"]))
    check(m["cache"] == "vela-v11", f"{tag} cache id is vela-v11", str(m["cache"]))
    check(m["bodyPosition"] in ("static", "relative"), f"{tag} body is not position:fixed", m["bodyPosition"])
    check(m["tabbar"]["position"] == "fixed", f"{tag} tab bar is position:fixed", m["tabbar"]["position"])
    check("fill-available" in (m["htmlMinHeight"] or "") or "px" in (m["appHeightVar"] or ""),
          f"{tag} html uses fill-available or --app-height", f"{m['htmlMinHeight']} / {m['appHeightVar']}")

    check(abs(m["app"]["top"]) <= 1, f"{tag} app top at 0", str(m["app"]["top"]))
    # app should fill the viewport (Playwright viewport == layout viewport here)
    check(abs(m["app"]["bottom"] - h) <= 2, f"{tag} app fills viewport bottom", f"{m['app']['bottom']} vs {h}")

    check(abs(m["header"]["paddingTop"] - top) <= 1, f"{tag} header padding-top == safe-top",
          f"{m['header']['paddingTop']} vs {top}")
    check(m["header"]["rowTop"] + 0.5 >= top, f"{tag} header row below status bar",
          f"rowTop={m['header']['rowTop']} safeTop={top}")
    check("7, 17, 31" in m["header"]["bg"], f"{tag} header solid navy", m["header"]["bg"])

    tb = m["tabbar"]
    check(abs(tb["gapBelow"]) <= 1.5, f"{tag} tab bar flush to bottom", f"gap={tb['gapBelow']}")
    check(abs(tb["iconPad"] - bottom) <= 4, f"{tag} ~{bottom}px under tab labels", f"iconPad={tb['iconPad']:.1f}")
    check(abs(tb["paddingBottom"] - bottom) <= 1, f"{tag} tabbar padding-bottom == safe-bottom",
          f"{tb['paddingBottom']} vs {bottom}")
    check("7, 17, 31" in (tb["background"] or ""), f"{tag} tab bar navy covers the safe area", tb["background"])

    check(m["content"]["paddingLeft"] >= 15, f"{tag} 16px screen edge", str(m["content"]["paddingLeft"]))
    check(m["content"]["overflowY"] in ("auto", "scroll", "overlay"), f"{tag} content is the scroll/clip layer",
          m["content"]["overflowY"])

    page.evaluate("document.querySelector('.content').scrollTop = 20000")
    page.wait_for_timeout(50)
    m2 = metrics(page, h)
    last = m2["lastTile"]
    check(last is not None, f"{tag} last workout tile present")
    if last:
        gap = m2["tabbar"]["y"] - last["bottom"]
        check(gap >= 8, f"{tag} last workout card sits above the tab bar", f"gap={gap:.1f}")
    page.evaluate("document.querySelector('.content').scrollTop = 0")
    page.wait_for_timeout(40)

    tiles = m["tiles"]
    check(len(tiles) == 4, f"{tag} four dashboard tiles", str(len(tiles)))
    if tiles:
        heights = [round(t["h"], 1) for t in tiles]
        numYs = [round(t["numY"], 1) for t in tiles]
        check(max(heights) - min(heights) <= 1, f"{tag} equal tile heights", str(heights))
        check(max(numYs) - min(numYs) <= 1, f"{tag} tile numbers share a baseline", str(numYs))
        # At 375, labels may wrap to two lines but must stay inside the tile and not overflow width
        check(all(t["w"] > 50 for t in tiles), f"{tag} tiles have usable width", str([t["w"] for t in tiles]))
        check(all(t["h"] >= 60 for t in tiles), f"{tag} tiles tall enough for labels", str(heights))

    page.screenshot(path=str(SHOTS / f"home-{name}.png"), full_page=False)
    print("shot", SHOTS / f"home-{name}.png")
    if primary:
        page.screenshot(
            path=str(SHOTS / "home-16-pro-max-top.png"),
            clip={"x": 0, "y": 0, "width": w, "height": 220},
        )
        page.screenshot(
            path=str(SHOTS / "home-16-pro-max-bottom.png"),
            clip={"x": 0, "y": max(0, h - 240), "width": w, "height": min(240, h)},
        )
        page.locator('[data-testid="tab-program"]').tap()
        page.wait_for_timeout(200)
        page.screenshot(path=str(SHOTS / "program-16-pro-max.png"), full_page=False)
        page.locator('[data-testid="tab-settings"]').tap()
        page.wait_for_selector('[data-testid="app-version"]')
        ver = page.locator('[data-testid="app-version"]').inner_text()
        check("11" in ver, f"{tag} Settings shows version 11", ver)
        page.screenshot(path=str(SHOTS / "settings-16-pro-max.png"), full_page=False)
        print("shot settings", ver.replace("\n", " | "))
        page.locator('[data-testid="tab-home"]').tap()
        page.wait_for_timeout(60)


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        for i, (name, w, h, top, bottom, dpr) in enumerate(DEVICES):
            browser, context = launch(p, w, h, dpr)
            page = context.new_page()
            run_device(page, url, name, w, h, top, bottom, primary=(i == 0))
            browser.close()
    httpd.shutdown()
    print()
    if fails:
        print(f"{len(fails)} FAILED:", "; ".join(fails))
        sys.exit(1)
    print("all v11 checks passed")


if __name__ == "__main__":
    main()
