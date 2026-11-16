"""VELA v23: machine/cable exercise photos replaced or removed; contact sheet of the new photos."""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v23"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []

NEW = {
    "Pec Deck": ("pec-deck", 1), "Incline Machine Press": ("incline-machine-press", 1),
    "Overhead Rope Extension": ("overhead-rope-extension", 1), "T-Bar Row": ("t-bar-row", 2),
    "Tricep Rope Pushdown": ("tricep-rope-pushdown", 1), "Cable Pushdowns": ("tricep-rope-pushdown", 1),
    "Overhead Cable Crossover": ("overhead-cable-crossover", 1), "Lying Leg Curl": ("lying-leg-curl", 2),
    "Hack Squat": ("hack-squat", 2), "Cable Kickback": ("cable-kickback", 1),
    "Preacher Curl": ("preacher-curl", 2), "Cable Curl": ("cable-curl", 1),
}
NONE = ["Straight-Arm Pulldown", "Reverse Hyper", "Cable Lateral Raise", "Single-Leg Leg Press Calf Raise",
        "Calf Raises on Leg Press", "Low Cable Fly", "Cable Crunch", "Pallof Press"]


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


def run(p, w, h, tag, sheet=False):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True).new_page()
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    info = page.evaluate("""(names) => { const C = window.VELA_CATALOG; const out = {};
        for (const n of names) { const p = C.photoFor(n); out[n] = p ? {frames: p.frames, match: p.match, license: p.license, author: p.author} : null; }
        return out; }""", list(NEW) + NONE)
    for n, (key, cnt) in NEW.items():
        ph = info.get(n)
        ok = bool(ph) and len(ph["frames"]) == cnt and all(f"/{key}/" in f for f in ph["frames"]) and ph["match"] == "exact" and ph["license"] and ph["author"]
        check(ok, f"[{tag}] {n} -> {key} ({cnt} frame)", ph and ph["frames"])
    for n in NONE:
        check(info.get(n) is None, f"[{tag}] {n} has no (wrong) photo")
    frames = sorted({f for n in NEW for f in info[n]["frames"]} if all(info[n] for n in NEW) else [])
    loaded = page.evaluate("""async (srcs) => Promise.all(srcs.map(s => new Promise(r => { const i = new Image(); i.onload = () => r([s, i.naturalWidth]); i.onerror = () => r([s, 0]); i.src = s; })))""", frames)
    bad = [s for s, wdt in loaded if not wdt]
    check(not bad, f"[{tag}] all {len(frames)} new frames load", bad)
    # Exercise library mini thumbs render a photo for a new one and an icon for a removed one
    html = page.evaluate("() => [window.VELA_CATALOG.photoMarkup('Hack Squat', {mini: true}), window.VELA_CATALOG.photoMarkup('Cable Crunch', {mini: true})]")
    check("hack-squat/0.webp" in html[0], f"[{tag}] Hack Squat mini thumb is the photo")
    check("<img" not in html[1], f"[{tag}] Cable Crunch falls back to the icon")
    if sheet:
        tiles = "".join(
            f'<figure><img src="{info[n]["frames"][0]}"><figcaption>{n if n != "Cable Pushdowns" else ""}<small>{info[n]["author"]} · {info[n]["license"]}</small></figcaption></figure>'
            for n in NEW if n != "Cable Pushdowns")
        page.set_content(f"""<html><head><base href="{URL}"><style>
          body {{ margin:0; padding:24px; background:#0f1a2b; color:#fff; font:600 18px -apple-system,Segoe UI,Arial; width:1352px; }}
          h1 {{ font-size:26px; margin:0 0 18px; }} .g {{ display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; }}
          figure {{ margin:0; background:#18263d; border-radius:14px; overflow:hidden; }}
          img {{ width:100%; height:240px; object-fit:cover; display:block; }}
          figcaption {{ padding:10px 12px 12px; }} small {{ display:block; font-weight:400; font-size:13px; color:#9fb3cf; margin-top:4px; }}
        </style></head><body><h1>VELA v23 — new exercise photos</h1><div class="g">{tiles}</div></body></html>""")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)
        page.set_viewport_size({"width": 1400, "height": 900})
        page.screenshot(path=str(SHOTS / "photo-sheet.png"), full_page=True)
        page.goto(URL, wait_until="networkidle")
    page.locator('[data-testid="tab-settings"]').tap()
    page.wait_for_timeout(200)
    check(page.locator('[data-testid="app-version"] b').inner_text() == "23", f"[{tag}] version 23")
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "", sheet=True)
    run(p, 375, 812, "-375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
