"""VELA should feel like a native iPhone app: no zoom, no rubber-band, 16px inputs."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
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


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
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
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        page.wait_for_selector('[data-testid="week-plan"]')

        vp = page.locator('meta[name="viewport"]').get_attribute("content") or ""
        check("maximum-scale=1" in vp, "viewport maximum-scale=1", vp)
        check("user-scalable=no" in vp, "viewport user-scalable=no", vp)
        check("viewport-fit=cover" in vp, "viewport-fit=cover", vp)

        check(
            page.locator('meta[name="apple-mobile-web-app-capable"]').get_attribute("content") == "yes",
            "apple-mobile-web-app-capable",
        )
        check(
            page.locator('meta[name="mobile-web-app-capable"]').get_attribute("content") == "yes",
            "mobile-web-app-capable",
        )
        check(
            page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').get_attribute("content")
            == "black-translucent",
            "status-bar-style black-translucent",
        )
        check(
            page.locator('meta[name="apple-mobile-web-app-title"]').get_attribute("content") == "VELA",
            "apple-mobile-web-app-title is VELA",
        )
        icon = page.locator('link[rel="apple-touch-icon"]').get_attribute("href") or ""
        check("apple-touch-icon" in icon, "apple-touch-icon present", icon)

        manifest = page.evaluate("""async () => {
          const href = document.querySelector('link[rel=manifest]').href;
          const m = await (await fetch(href)).json();
          return m;
        }""")
        check(manifest.get("display") == "standalone", "manifest display standalone", str(manifest.get("display")))
        check(manifest.get("name") == "VELA" or manifest.get("short_name") == "VELA", "manifest name VELA")

        styles = page.evaluate("""() => {
          const body = getComputedStyle(document.body);
          const html = getComputedStyle(document.documentElement);
          const app = getComputedStyle(document.getElementById('app'));
          return {
            bodyTouch: body.touchAction,
            htmlTouch: html.touchAction,
            bodySelect: body.webkitUserSelect || body.userSelect,
            bodyCallout: body.webkitTouchCallout,
            bodyTap: body.webkitTapHighlightColor,
            bodyOverscroll: body.overscrollBehavior || body.overscrollBehaviorY,
            htmlOverflow: html.overflow,
            bodyOverflow: body.overflow,
            appOverflow: app.overflow,
            appOverscroll: app.overscrollBehavior || app.overscrollBehaviorY,
          };
        }""")
        print("styles", styles)
        check("manipulation" in (styles["bodyTouch"] or "") or styles["bodyTouch"] == "manipulation",
              "body touch-action is manipulation", styles["bodyTouch"])
        check("manipulation" in (styles["htmlTouch"] or ""), "html touch-action is manipulation", styles["htmlTouch"])
        check("none" in (styles["bodySelect"] or ""), "body user-select none", styles["bodySelect"])
        check((styles["bodyCallout"] or "none") in ("none", ""), "touch-callout none", styles["bodyCallout"])
        check("none" in (styles["bodyOverscroll"] or styles["htmlOverflow"] or ""), "overscroll-behavior none on body", str(styles["bodyOverscroll"]))
        check("hidden" in (styles["bodyOverflow"] or "") and "hidden" in (styles["htmlOverflow"] or ""),
              "html/body overflow hidden (no rubber-band on body)", f"{styles['htmlOverflow']}/{styles['bodyOverflow']}")

        # Open tracking sheet and check input font-size >= 16 and card still at the top
        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]')
        card = page.locator('[data-testid="sets-tracking"]').bounding_box()
        check(card and card["y"] < 220, "tracking card still at the top", str(card and card["y"]))

        fonts = page.evaluate("""() => {
          const nodes = [...document.querySelectorAll('input, textarea')];
          return nodes.map((el) => {
            const s = getComputedStyle(el);
            return { testid: el.getAttribute('data-testid'), fontSize: parseFloat(s.fontSize), userSelect: s.webkitUserSelect || s.userSelect };
          });
        }""")
        print("inputs", fonts)
        too_small = [f for f in fonts if f["fontSize"] < 16]
        check(len(fonts) >= 1, "found inputs in the tracking card")
        check(not too_small, "all inputs font-size >= 16px", str(too_small))
        check(all("text" in (f["userSelect"] or "") or f["userSelect"] == "auto" for f in fonts) or
              all(f["userSelect"] != "none" for f in fonts),
              "inputs remain selectable", str(fonts))

        # gesture handlers preventDefault
        prevented = page.evaluate("""() => {
          const ev = new Event('gesturestart', { bubbles: true, cancelable: true });
          document.dispatchEvent(ev);
          return ev.defaultPrevented;
        }""")
        check(prevented is True, "gesturestart is preventDefaulted", str(prevented))

        # simulated keyboard still leaves Track Reps visible
        page.evaluate("() => window.VELA_APP.applyTrackingViewport(470, 0)")
        page.wait_for_timeout(50)
        btn = page.locator("[data-testid='track-reps']").bounding_box()
        check(btn and btn["y"] + btn["height"] <= 472, "Track Reps still above a 470px keyboard viewport", str(btn))

        overflow = page.evaluate("""() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1""")
        check(not overflow, "no horizontal overflow")

        browser.close()

    if fails:
        print("\nFAILED:", ", ".join(fails))
        sys.exit(1)
    print("\nAll native-feel checks passed.")


if __name__ == "__main__":
    main()
