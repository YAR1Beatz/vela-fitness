"""VELA v22: Row Machine (Max-OT) shows a plate-loaded seated row machine photo."""
import functools, http.server, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v22"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []


def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, str(detail).strip())
    if not ok:
        fails.append(label)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{httpd.server_address[1]}/"


def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True).new_page()
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    wid = page.evaluate("""() => { const D = window.VELA_DATA; D.switchProgram('max-ot'); D.saveNow();
        const w = D.get().workouts.find(w => w.exercises.some(e => e.name === 'Row Machine')); return w && w.id; }""")
    check(bool(wid), f"[{tag}] a Max-OT day has Row Machine", wid)
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    page.locator(f'[data-testid="workout-tile-{wid}"]').tap()
    page.wait_for_timeout(400)
    img = page.locator('img[src*="chest-supported-row/0.webp"]')
    check(img.count() >= 1, f"[{tag}] Row Machine card uses the new photo")
    page.evaluate("() => { const i = document.querySelector('img[src*=\"chest-supported-row\"]'); i.closest('[data-ex-block], .card').scrollIntoView({block: 'center'}); }")
    page.wait_for_timeout(500)
    ok = page.evaluate("() => { const i = document.querySelector('img[src*=\"chest-supported-row\"]'); return i.complete && i.naturalWidth === 600; }")
    check(ok, f"[{tag}] photo loads (600px wide)")
    name = page.evaluate("() => document.querySelector('img[src*=\"chest-supported-row\"]').closest('[data-ex-block], .card').querySelector('h2, h3').textContent")
    check("Row Machine" in name, f"[{tag}] card title is Row Machine", name)
    page.screenshot(path=str(SHOTS / f"row-machine{tag}.png"))
    page.locator('[data-testid="tab-settings"]').tap()
    page.wait_for_timeout(200)
    check(page.locator('[data-testid="app-version"] b').inner_text() >= "22", f"[{tag}] version >= 22")
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "")
    run(p, 375, 812, "-375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
