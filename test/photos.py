"""VELA exercise photos: real stills, start/end crossfade, larger demo, tracking still works."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOT = Path("/workspace/design-ideas/gym-app/live-v5")
SHOT.mkdir(parents=True, exist_ok=True)
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
        page.screenshot(path=str(SHOT / "home.png"), full_page=False)

        vp = page.locator('meta[name="viewport"]').get_attribute("content") or ""
        check("maximum-scale=1" in vp and "user-scalable=no" in vp, "zoom lock still in viewport", vp)

        page.locator('[data-testid="workout-tile-legs-2"]').tap()
        page.wait_for_selector('[data-testid="exercise-stack"]')
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOT / "workout-list.png"), full_page=False)

        photos = page.locator('[data-testid="ex-photo"]')
        check(photos.count() >= 5, "workout cards show exercise photos", str(photos.count()))

        first = page.locator('[data-testid="exercise-card-seated-leg-curl"] [data-testid="ex-photo"]')
        check(first.count() == 1, "Seated Leg Curl has a photo")
        frames = first.locator("img.frame")
        check(frames.count() == 2, "Seated Leg Curl has start/end frames", str(frames.count()))
        src0 = frames.nth(0).get_attribute("src") or ""
        src1 = frames.nth(1).get_attribute("src") or ""
        check("seated-leg-curl/0.webp" in src0, "frame 0 src", src0)
        check("seated-leg-curl/1.webp" in src1, "frame 1 src", src1)
        # images actually loaded
        loaded = page.evaluate("""() => {
          const imgs = [...document.querySelectorAll('[data-testid=ex-photo] img')];
          return {
            total: imgs.length,
            complete: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
            minW: Math.min(...imgs.filter(i => i.naturalWidth>0).map(i => i.naturalWidth), 9999),
          };
        }""")
        print("loaded", loaded)
        check(loaded["complete"] >= 8, "photo files loaded", str(loaded))

        anim = page.evaluate("""() => {
          const el = document.querySelector('[data-testid=exercise-card-seated-leg-curl] [data-testid=ex-photo]');
          if (!el) return null;
          return el.getAttribute('data-frames') === '2' &&
            getComputedStyle(el.querySelector('.frame-a')).animationName.includes('exFade');
        }""")
        check(anim is True, "start/end crossfade animation is active", str(anim))

        # Larger demo
        page.locator('[data-testid="ex-demo-0"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"]')
        demo = page.locator('[data-testid="exercise-demo"]').bounding_box()
        check(demo and demo["y"] < 300, "demo card sits near the top", str(demo and round(demo["y"],1)))
        large = page.locator('[data-testid="exercise-demo"] [data-testid="ex-photo"]')
        box = large.bounding_box()
        check(box and box["width"] >= 250 and box["height"] >= 160, "demo photo is larger than the thumb", str(box))
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOT / "exercise-demo.png"), full_page=False)
        page.locator('[data-testid="close-demo"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"]', state="detached")

        # Tracking card still works
        page.locator('[data-testid="set-chip-0-0"]').tap()
        page.wait_for_selector('[data-testid="sets-tracking"]')
        card = page.locator('[data-testid="sets-tracking"]').bounding_box()
        check(card and card["y"] < 220, "tracking card still at the top", str(card and round(card["y"],1)))
        page.evaluate("() => window.VELA_APP.applyTrackingViewport(470, 0)")
        page.wait_for_timeout(50)
        btn = page.locator("[data-testid='track-reps']").bounding_box()
        check(btn and btn["y"] + btn["height"] <= 472, "Track Reps still above keyboard viewport", str(btn and round(btn["y"]+btn["height"],1)))
        page.locator('[data-testid="close-tracking"]').tap()

        # Settings credits
        page.locator('button[aria-label="Settings"]').tap()
        page.wait_for_selector('[data-testid="photo-credits"]')
        cred = page.locator('[data-testid="photo-credits"]').inner_text()
        check("CC BY-SA" in cred and "Goulart" in cred, "settings credits line present", cred[:120])

        # Dumbbell Pullover (an alternative, not a primary card) has no licensed photo
        missing = page.evaluate("() => !window.VELA_PHOTOS['dumbbell-pullover']")
        check(missing is True, "Dumbbell Pullover has no photo entry (illustrated fallback)")
        page.locator('.sheet-actions .btn.pri').tap()
        page.wait_for_selector('[data-testid="photo-credits"]', state="detached")

        browser.close()

    print("screenshots:", SHOT)
    if fails:
        print("\nFAILED:", ", ".join(fails))
        sys.exit(1)
    print("\nAll photo checks passed.")


if __name__ == "__main__":
    main()
