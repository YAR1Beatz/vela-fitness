"""VELA v28 (draft): Standing Barbell Shoulder Press suggests 6 reps + real demo photo."""
import functools, http.server, json, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", ROOT / "drafts"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, "" if ok else detail)
    if not ok: fails.append(label)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = os.environ.get("URL") or f"http://127.0.0.1:{httpd.server_address[1]}/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

# Make the store look like an existing v27 user (schema 8) on Max-OT who last logged
# 8 reps x 40 kg on the press, so the old suggestion was "8 reps".
SEED = """() => {
  const D = window.VELA_DATA;
  D.switchProgram('max-ot');
  const s = D.get();
  const w = s.workouts.find(x => x.id === 'maxot-shoulders');
  const ohp = w.exercises[0], sdp = w.exercises[1];
  ohp.suggestedReps = 8; ohp.suggestedWeight = 40; ohp.programReps = 8;
  sdp.suggestedReps = 8; sdp.suggestedWeight = 22;
  s.lastLogged['barbell-overhead-press'] = { reps: 8, weight: 40 };
  s.lastLogged['seated-dumbbell-shoulder-press'] = { reps: 8, weight: 22 };
  s.history['barbell-overhead-press'] = [{ sessionId: 'ses-old', date: '2026-11-10', datetime: '2026-11-10T08:00:00Z', sets: [{ reps: 8, weight: 40 }, { reps: 7, weight: 40 }, { reps: 6, weight: 40 }] }];
  s.version = 8;
  D.saveNow();
}"""

def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.evaluate(SEED)
    before = json.loads(page.evaluate("localStorage.getItem('vela-fitness-v1')"))
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(300)
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
    st = json.loads(page.evaluate("JSON.stringify(window.VELA_DATA.get())"))
    stored = json.loads(page.evaluate("localStorage.getItem('vela-fitness-v1')"))
    check(st["version"] >= 9, f"[{tag}] migrated to schema 9", st["version"])
    wk = [x for x in st["workouts"] if x["id"] == "maxot-shoulders"][0]
    ohp, sdp = wk["exercises"][0], wk["exercises"][1]
    check(ohp["name"] == "Standing Barbell Shoulder Press", f"[{tag}] first exercise is the press", ohp["name"])
    check(ohp["suggestedReps"] == 6 and ohp["programReps"] == 6, f"[{tag}] press now suggests 6 reps", (ohp["suggestedReps"], ohp["programReps"]))
    check(ohp["suggestedWeight"] == 40, f"[{tag}] suggested weight kept (40 kg)", ohp["suggestedWeight"])
    check(sdp["suggestedReps"] == 8, f"[{tag}] other exercises untouched", sdp["suggestedReps"])
    check(json.dumps(stored["history"], sort_keys=True) == json.dumps(before["history"], sort_keys=True), f"[{tag}] logged history untouched")
    check(json.dumps(stored["lastLogged"], sort_keys=True) == json.dumps(before["lastLogged"], sort_keys=True), f"[{tag}] last-logged untouched")
    sug = page.evaluate("window.VELA_DATA.suggestionFor('Standing Barbell Shoulder Press', 8, 30)")
    check(sug == {"reps": 6, "weight": 40}, f"[{tag}] next sessions also suggest 6 reps (weight from last log)", sug)
    sug2 = page.evaluate("window.VELA_DATA.suggestionFor('Barbell Overhead Press', 8, 30)")
    check(sug2["reps"] == 6, f"[{tag}] catalog name Barbell Overhead Press → 6 too", sug2)
    # open the workout
    page.locator('[data-testid="workout-tile-maxot-shoulders"]').tap()
    page.wait_for_selector('[data-testid="set-chip-0-0"]'); page.wait_for_timeout(400)
    chips = page.evaluate("[...document.querySelectorAll('[data-chips=\"0\"] .chip')].map(c => c.textContent.trim())")
    check(chips and all(t == "6 reps" for t in chips), f"[{tag}] set boxes show 6 reps", chips)
    src = page.evaluate("(document.querySelector('[data-testid=ex-demo-0] img') || {}).src || ''")
    check("barbell-overhead-press/0.webp" in src, f"[{tag}] thumbnail uses the new photo", src)
    page.wait_for_function("(() => { const i = document.querySelector('[data-testid=ex-demo-0] img'); return i && i.complete && i.naturalWidth > 0; })()")
    check(page.evaluate("document.querySelector('[data-testid=ex-demo-0] img').naturalWidth") == 600, f"[{tag}] photo loads")
    sfx = "" if tag == "440" else f"-{tag}"
    page.evaluate("document.querySelector('.content').scrollTop = 0"); page.wait_for_timeout(150)
    page.screenshot(path=str(SHOTS / f"shoulder-press-6reps{sfx}.png"))
    # demo sheet
    page.locator('[data-testid="ex-demo-0"]').tap(); page.wait_for_selector('[data-testid="exercise-demo"]'); page.wait_for_timeout(500)
    check(page.evaluate("[...document.querySelectorAll('[data-testid=exercise-demo] img')].some(i => i.src.includes('barbell-overhead-press') && i.naturalWidth > 0)"), f"[{tag}] demo sheet shows the photo")
    page.screenshot(path=str(SHOTS / f"shoulder-press-demo{sfx}.png"))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    if page.locator('[data-testid="exercise-demo"]').count():
        page.locator('[data-testid="exercise-demo"] .tracking-close').tap(); page.wait_for_timeout(300)
    # sets tracking: reps field placeholder 6, he can type over it
    page.locator('[data-testid="set-chip-0-0"]').tap(); page.wait_for_selector('[data-testid="sets-tracking"]'); page.wait_for_timeout(350)
    ph = page.locator('[data-testid="reps-input"]').first.get_attribute("placeholder")
    check(ph == "6", f"[{tag}] Sets Tracking reps suggestion is 6", ph)
    page.screenshot(path=str(SHOTS / f"shoulder-press-tracking{sfx}.png"))
    check(not errors, f"[{tag}] no page errors", errors)
    b.close()

with sync_playwright() as p:
    run(p, 440, 956, "440")
    if os.environ.get("BOTH", "1") == "1":
        run(p, 375, 812, "375")
print("FAILS:", fails)
