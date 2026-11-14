"""Sets Tracking must sit at the top and stay visible above a simulated iOS keyboard."""
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
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v3"))
SHOTS.mkdir(parents=True, exist_ok=True)

fails = []

def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, (detail or "").strip())
    if not ok:
        fails.append(label)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass



def choose_days_if_needed(page, days=4):
    """First-launch Bro Split setup must be dismissed so older tests reach the plan."""
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")
        page.wait_for_selector('[data-testid="week-plan"]')

def start_server():
    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def visible_in_band(page, selector, top, bottom, slop=2):
    box = page.locator(selector).bounding_box()
    if not box:
        return False, "missing"
    y0, y1 = box["y"], box["y"] + box["height"]
    ok = y0 >= top - slop and y1 <= bottom + slop
    return ok, f"y={y0:.1f}-{y1:.1f} band={top}-{bottom}"


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
        choose_days_if_needed(page)
        page.wait_for_selector('[data-testid="week-plan"]')
        page.locator('[data-testid="workout-tile-chest"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')

        scroll0 = page.evaluate("() => document.getElementById('content').scrollTop")
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]')

        # Card should be near the top, not the bottom
        card = page.locator('[data-testid="sets-tracking"]').bounding_box()
        check(card is not None, "tracking card is present")
        check(card["y"] < 220, "card sits in the upper half (below the header)", f"y={card['y']:.1f}")
        check(card["y"] + card["height"] < 700, "card is not a bottom sheet", f"bottom={card['y']+card['height']:.1f}")
        check(page.locator('[data-testid="close-tracking"]').count() == 1, "Done/close control present")

        scroll1 = page.evaluate("() => document.getElementById('content').scrollTop")
        check(abs(scroll1 - scroll0) < 40, "no page scroll jump opening the card", f"{scroll0}->{scroll1}")

        # Full-height screenshot of the top-anchored card
        page.screenshot(path=str(SHOTS / "tracking-top.png"), full_page=False)

        # Simulate iOS keyboard: visible visual viewport shrinks to ~470px
        page.evaluate("""() => { window.VELA_APP.applyTrackingViewport(470, 0); }""")
        # Give layout a tick
        page.wait_for_timeout(50)

        band_top, band_bottom = 0, 470
        controls = {
            "title / card": "[data-testid='sets-tracking']",
            "Set 1 pill": "[data-testid='track-set-pill-0']",
            "Select All": "[data-testid='select-all-sets']",
            "Reps field": "[data-testid='reps-input']",
            "Weight field": "[data-testid='weight-input']",
            "Track Reps": "[data-testid='track-reps']",
            "Done/close": "[data-testid='close-tracking']",
        }
        # For the card itself, just the top must be in view; body can be max-height clipped
        # but all listed controls must be fully visible in the 470px band.
        for name, sel in controls.items():
            if name == "title / card":
                box = page.locator(sel).bounding_box()
                ok = box and box["y"] < 220 and (box["y"] + min(box["height"], 1)) < 470
                check(ok, "card top stays in the 470px viewport", f"y={box and box['y']}")
                mh = page.evaluate("() => document.querySelector('[data-testid=sets-tracking]').style.maxHeight")
                mh_px = float((mh or "0").replace("px", "") or 0)
                check(mh_px > 0 and mh_px <= 470, "max-height fits 470px viewport", mh)
                continue
            ok, detail = visible_in_band(page, sel, band_top, band_bottom)
            check(ok, f"{name} visible above simulated keyboard", detail)

        # All controls still usable: Track Reps clickable within the band
        btn = page.locator("[data-testid='track-reps']").bounding_box()
        check(btn and btn["y"] + btn["height"] <= 470 + 2, "Track Reps sits above the keyboard line", json.dumps(btn))

        scroll2 = page.evaluate("() => document.getElementById('content').scrollTop")
        check(abs(scroll2 - scroll0) < 40, "no page scroll jump after viewport pin", f"{scroll0}->{scroll2}")

        # Done closes the card
        page.locator('[data-testid="close-tracking"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]', state="detached")
        check(page.locator('[data-testid="sets-tracking"]').count() == 0, "Done closes the tracking card")

        browser.close()

    if fails:
        print("\nFAILED:", ", ".join(fails))
        sys.exit(1)
    print("\nAll tracking-top checks passed.")
    print("screenshot:", SHOTS / "tracking-top.png")


if __name__ == "__main__":
    main()
