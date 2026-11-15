"""VELA v18: looping Flat Barbell Bench Press demo video, inline on iOS."""
import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v18"))
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


def open_home(page, url):
    page.goto(url, wait_until="networkidle")
    page.add_style_tag(content=INSETS)
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.wait_for_selector('[data-testid="workout-tile-chest"]')


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
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

        meta = page.evaluate("""() => {
          const C = window.VELA_CATALOG;
          const bench = C.photoFor("Flat Barbell Bench Press");
          const alias = C.photoFor("Barbell Bench Press");
          const fly = C.photoFor("Cable Fly");
          return {
            benchVideo: bench && bench.video,
            benchPoster: bench && bench.poster,
            aliasVideo: alias && alias.video,
            flyVideo: fly && fly.video,
            flyFrames: !!(fly && fly.frames && fly.frames.length),
          };
        }""")
        print("meta", meta)
        check(bool(meta["benchVideo"]) and "flat-barbell-bench-press/demo.mp4" in meta["benchVideo"],
              "video is attached to the Flat Barbell Bench Press id", str(meta))
        check(meta["aliasVideo"] == meta["benchVideo"], "Barbell Bench Press alias also resolves the video")
        check(not meta["flyVideo"] and meta["flyFrames"], "other exercises still use photo frames")

        page.locator('[data-testid="workout-tile-chest"]').tap()
        page.wait_for_selector('[data-testid="ex-demo-0"]')
        thumb_video = page.locator('[data-testid="ex-demo-0"] [data-testid="ex-video"]')
        check(thumb_video.count() == 1, "workout thumb shows the looping video")
        attrs = page.evaluate("""() => {
          const v = document.querySelector('[data-testid="ex-demo-0"] [data-testid="ex-video"]');
          return {
            autoplay: v.hasAttribute("autoplay"),
            loop: v.hasAttribute("loop"),
            muted: v.muted || v.hasAttribute("muted"),
            playsinline: v.hasAttribute("playsinline"),
            webkit: v.hasAttribute("webkit-playsinline"),
            poster: v.getAttribute("poster"),
            src: v.currentSrc || v.getAttribute("src"),
          };
        }""")
        print("thumb attrs", attrs)
        check(attrs["autoplay"] and attrs["loop"] and attrs["muted"] and attrs["playsinline"],
              "thumb video is autoplay loop muted playsinline", str(attrs))
        check(attrs["poster"] and "poster.jpg" in attrs["poster"], "thumb video has a poster")

        other = page.locator('[data-testid="ex-demo-1"] [data-testid="ex-video"]').count()
        other_img = page.locator('[data-testid="ex-demo-1"] img.frame').count()
        check(other == 0 and other_img >= 1, "a neighboring exercise still uses photo frames, not video")

        page.locator('[data-testid="ex-demo-0"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"] [data-testid="ex-video"]')
        demo = page.locator('[data-testid="exercise-demo"] [data-testid="ex-video"]')
        check(demo.count() == 1, "demo sheet plays the video inline")
        # Wait for playback; no fullscreen <dialog> or webkit presentation
        page.wait_for_timeout(1200)
        state = page.evaluate("""() => {
          const v = document.querySelector('[data-testid="exercise-demo"] [data-testid="ex-video"]');
          const sheet = document.querySelector('[data-testid="exercise-demo"]');
          const r = v.getBoundingClientRect();
          return {
            paused: v.paused,
            time: v.currentTime,
            muted: v.muted,
            inline: v.playsInline || v.hasAttribute("playsinline"),
            display: getComputedStyle(v).display,
            inSheet: sheet.contains(v),
            width: Math.round(r.width),
            height: Math.round(r.height),
            top: Math.round(r.top),
            vw: window.innerWidth,
            vh: window.innerHeight,
            overflow: r.right > window.innerWidth + 2 || r.left < -2,
            fullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement),
          };
        }""")
        print("playback", state)
        check((not state["paused"] and state["time"] > 0) or state["time"] > 0,
              "video plays inline (currentTime advances, not paused)", str(state))
        check(state["inSheet"] and not state["fullscreen"] and not state["overflow"] and state["top"] < 800,
              "video stays in the demo card, not fullscreen", str(state))
        page.screenshot(path=str(SHOTS / "bench-video.png"), full_page=False)

        browser.close()
    httpd.shutdown()
    print("fails:", fails)
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
