"""VELA v32: mid-session volume vs last compares only work logged so far."""
import functools, http.server, json, os, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", ROOT / "drafts"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []

def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, "" if ok else detail)
    if not ok:
        fails.append(label)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = os.environ.get("URL") or f"http://127.0.0.1:{httpd.server_address[1]}/"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

SEED = r"""() => {
  const D = window.VELA_DATA;
  const C = window.VELA_CATALOG;
  D.switchProgram('max-ot');
  const s = D.get();
  const key = (n) => C.canonicalKey(n);
  const prior = 'prior-chest';
  const stamp = '2026-11-16T17:00:00.000Z';
  const common = { workout: 'Chest & Triceps', workoutId: 'maxot-chest', week: 1, programId: 'max-ot', sessionId: prior, date: '2026-11-16', datetime: stamp };
  const row = (name, sets) => {
    const k = key(name);
    s.history[k] = (s.history[k] || []).filter(h => h.sessionId !== prior);
    s.history[k].unshift({ ...common, sets });
  };
  row('Incline Bench Press', [{reps:6,weight:65},{reps:6,weight:65},{reps:5,weight:70}]);
  row('Flat Barbell Bench Press', [{reps:6,weight:70},{reps:6,weight:70},{reps:6,weight:70}]);
  row('Weighted Dip', [{reps:6,weight:20}]);
  row('Incline Dumbbell Tricep Extension', [{reps:6,weight:20},{reps:6,weight:20}]);
  row('Lying Tricep Extension', [{reps:6,weight:25}]);
  row('Cable Pushdown', [{reps:6,weight:16}]);
  D.saveNow();
  return true;
}"""

def logic(page, sets, finished=False):
    return page.evaluate(
        """({ sets, finished }) => {
          const D = window.VELA_DATA;
          const w = D.get().workouts.find(x => x.id === 'maxot-chest');
          D.ensureSession(w);
          const ex = w.exercises[0];
          ex.sets = sets.map(s => ({
            reps: s.reps, weight: s.weight,
            repsText: String(s.reps), weightText: String(s.weight),
            done: !!s.done
          }));
          /* keep remaining empty sets if fewer than planned */
          while (ex.sets.length < 3) {
            ex.sets.push({ reps: null, weight: null, repsText: '', weightText: '', done: false });
          }
          if (finished) w.completedAt = new Date().toISOString();
          else w.completedAt = null;
          D.upsertSessionHistory(w);
          D.saveNow();
          const vol = D.exerciseVolume(ex);
          const prev = D.previousExerciseVolume(ex, w.sessionId);
          const wVol = D.workoutVolume(w);
          const prevW = D.previousWorkoutVolume(w);
          return {
            vol, prev, cmp: D.volumeCompare(vol, prev),
            wVol, prevW, wCmp: D.volumeCompare(wVol, prevW),
            sum: D.exerciseOverloadSummary(ex, w.sessionId),
            arrows: [0,1,2].map(i => D.setOverload(ex, i, w.sessionId)),
            finished: !!w.completedAt,
            cache: window.VELA_APP && window.VELA_APP.version,
          };
        }""",
        {"sets": sets, "finished": finished},
    )


def run(p, w, h, tag):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h},
                      device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    page = c.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    page.evaluate(SEED)
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="workout-tile-maxot-chest"]')
    page.locator('[data-testid="workout-tile-maxot-chest"]').tap()
    page.wait_for_selector('[data-testid="add-exercise"]')

    ver = page.evaluate("() => window.VELA_APP && window.VELA_APP.version")
    check(ver == "32", f"[{tag}] app version 32", ver)
    sw = Path(ROOT / "sw.js").read_text()
    check('const CACHE = "vela-v32"' in sw, f"[{tag}] service worker cache is vela-v32")

    # Mid-exercise: only set 1 logged (70x4 vs last week's 65x6 = 280 vs 390)
    r = logic(page, [{"reps": 4, "weight": 70, "done": True}])
    check(r["vol"]["kg"] == 280, f"[{tag}] mid-exercise volume is 280kg", r["vol"])
    check(r["prev"] and r["prev"]["kg"] == 390, f"[{tag}] mid-exercise vs last uses only set 1 (65x6=390), not the full 1130", r["prev"])
    check(r["cmp"] and r["cmp"]["delta"] == -110, f"[{tag}] mid-exercise -110kg vs last", r["cmp"])
    check(r["prevW"] and r["prevW"]["kg"] == 390, f"[{tag}] mid-workout mid-exercise workout vs last is also 390, not 2996", r["prevW"])
    check(r["wCmp"] and r["wCmp"]["delta"] == -110, f"[{tag}] workout mid-exercise -110kg vs last", r["wCmp"])

    # All 3 incline sets done, rest of the workout not started (Morten's case)
    r = logic(page, [
        {"reps": 4, "weight": 70, "done": True},
        {"reps": 4, "weight": 70, "done": True},
        {"reps": 4, "weight": 70, "done": True},
    ])
    page.evaluate("() => window.VELA_APP.render()")
    page.wait_for_timeout(200)
    check(r["vol"]["kg"] == 840, f"[{tag}] completed incline volume 840kg", r["vol"])
    check(r["prev"] and r["prev"]["kg"] == 1130, f"[{tag}] exercise previous is last week's 1130kg", r["prev"])
    check(r["cmp"] and r["cmp"]["delta"] == -290, f"[{tag}] exercise -290kg vs last (fewer reps, not a bad baseline)", r["cmp"])
    check(r["sum"] and r["sum"]["sign"] == "up" and "3.33" in r["sum"]["text"], f"[{tag}] +3.33 kg vs last week unchanged", r["sum"])
    check(r["arrows"] == ["up", "up", "down"], f"[{tag}] set arrows up, up, down unchanged", r["arrows"])
    check(r["wVol"]["kg"] == 840, f"[{tag}] workout volume still 840kg (logged work only)", r["wVol"])
    check(r["prevW"] and r["prevW"]["kg"] == 1130, f"[{tag}] in-progress workout vs last uses only started exercises (1130), not the full 2996", r["prevW"])
    check(r["wCmp"] and r["wCmp"]["delta"] == -290, f"[{tag}] workout vs last matches the exercise (-290), not -2156", r["wCmp"])

    wv = page.locator('[data-testid="workout-volume-vs"]').inner_text()
    ev = page.locator('[data-testid="volume-vs-last-0"]').inner_text()
    check("290" in wv and "2156" not in wv, f"[{tag}] UI workout vs last shows 290, not 2156", wv)
    check("290" in ev, f"[{tag}] UI exercise vs last still 290", ev)
    check("+3.33" in page.locator('[data-testid="overload-summary-0"]').inner_text(), f"[{tag}] UI still shows +3.33 kg vs last week")

    if tag == "440":
        page.evaluate("() => { const el = document.querySelector('[data-testid=workout-volume]'); if (el) el.scrollIntoView({block:'start'}); }")
        page.wait_for_timeout(200)
        page.screenshot(path=str(SHOTS / "volume-after.png"))

    # Finished workout still compares the full previous session
    r = logic(page, [
        {"reps": 4, "weight": 70, "done": True},
        {"reps": 4, "weight": 70, "done": True},
        {"reps": 4, "weight": 70, "done": True},
    ], finished=True)
    check(r["finished"] is True, f"[{tag}] marked finished")
    check(r["prevW"] and r["prevW"]["kg"] == 2996, f"[{tag}] finished workout still compares against the full previous session (2996)", r["prevW"])
    check(r["wCmp"] and r["wCmp"]["delta"] == -2156, f"[{tag}] finished workout with only incline logged is -2156 vs last (skipped the rest)", r["wCmp"])

    check(not errors, f"[{tag}] no page errors", errors)
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "440")
    if os.environ.get("BOTH", "1") == "1":
        run(p, 375, 812, "375")
print("FAILS:", fails)
if fails:
    raise SystemExit(1)
