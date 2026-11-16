"""VELA v24: Cable Rope Tricep Extension (rope photo) split from Cable Push Down (Straight Bar);
legacy pushdown history is migrated per program without losing entries."""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v24"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []


def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, str(detail).strip()[:300])
    if not ok:
        fails.append(label)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{httpd.server_address[1]}/"

# Turn a fresh v24 state back into the pre-v24 shape: both exercises on the shared old key.
MAKE_LEGACY = """() => {
  const D = window.VELA_DATA;
  D.switchProgram('max-ot'); D.saveNow(); D.switchProgram('bro-split'); D.saveNow();
  const s = JSON.parse(JSON.stringify(D.get()));
  const back = (wos, pid) => (wos || []).forEach(w => (w.exercises || []).forEach(ex => {
    if (ex.name === 'Cable Rope Tricep Extension') { ex.name = 'Tricep Rope Pushdown'; ex.key = 'tricep-rope-pushdown'; }
    if (ex.name === 'Cable Pushdown') ex.key = 'tricep-rope-pushdown';
  }));
  Object.keys(s.programs).forEach(id => back(s.programs[id].workouts, id));
  back(s.workouts, s.activeProgramId);
  const e = (sid, pid, w, day, reps) => ({ date: day, datetime: day + 'T10:00:00.000Z', workout: 'Arms', workoutId: 'x', week: 1,
    programId: pid, sessionId: sid, sets: [{ reps: reps, weight: w }, { reps: reps, weight: w }] });
  s.history['tricep-rope-pushdown'] = [e('ses-bro', 'bro-split', 22.5, '2026-11-10', 12), e('ses-max', 'max-ot', 30, '2026-11-12', 6)];
  const old = e('ses-old', undefined, 17.5, '2026-10-01', 10); delete old.programId;
  s.history['tricep-rope-pushdown'].push(old);
  s.history['cable-pushdown'] = [e('ses-max2', 'max-ot', 32.5, '2026-11-14', 5)];
  s.lastLogged['tricep-rope-pushdown'] = { reps: 6, weight: 30 };
  s.notes['tricep-rope-pushdown'] = 'elbows tucked';
  delete s.history['cable-rope-tricep-extension']; delete s.history['cable-push-down-straight-bar'];
  s.version = 7;
  return JSON.stringify(s);
}"""


def ctx(p, w, h):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=3, is_mobile=True, has_touch=True)
    return b, c


def run(p, w, h, tag):
    b, c = ctx(p, w, h)
    page = c.new_page()
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    legacy = page.evaluate(MAKE_LEGACY)
    b.close()

    b, c = ctx(p, w, h)
    c.add_init_script(f"""if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('vela-fitness-v1', {json.dumps(legacy)}); sessionStorage.setItem('seeded', '1'); }}""")
    page = c.new_page()
    page.goto(URL, wait_until="networkidle")
    r = page.evaluate("""() => { const D = window.VELA_DATA, C = window.VELA_CATALOG, s = D.get();
      const ids = (k) => (s.history[k] || []).map(h => h.sessionId).sort();
      const names = (pid) => ((s.programs[pid] || {}).workouts || []).flatMap(w => w.exercises.map(e => e.name + '|' + e.key));
      return { rope: ids('cable-rope-tricep-extension'), bar: ids('cable-push-down-straight-bar'), old: ['tricep-rope-pushdown','cable-pushdown'].filter(k => s.history[k]),
        ropeHist: D.getHistory('Cable Rope Tricep Extension').map(h => h.sessionId).sort(),
        barHist: D.getHistory('Cable Pushdown').map(h => h.sessionId).sort(),
        barHist2: D.getHistory('Cable Push Down (Straight Bar)').map(h => h.sessionId).sort(),
        oldNameHist: D.getHistory('Tricep Rope Pushdown').map(h => h.sessionId).sort(),
        backup: s.migrationBackups && s.migrationBackups.v8Pushdown && Object.keys(s.migrationBackups.v8Pushdown.history).map(k => k + ':' + s.migrationBackups.v8Pushdown.history[k].length),
        lastRope: s.lastLogged['cable-rope-tricep-extension'], lastBar: s.lastLogged['cable-push-down-straight-bar'],
        noteRope: s.notes['cable-rope-tricep-extension'], noteBar: s.notes['cable-push-down-straight-bar'], version: s.version,
        bro: names('bro-split').filter(n => /push|rope/i.test(n)), max: names('max-ot').filter(n => /push|rope/i.test(n)),
        ropePhoto: (C.photoFor('Cable Rope Tricep Extension') || {}).frames, barPhoto: (C.photoFor('Cable Pushdown') || {}).frames,
        barPhoto2: (C.photoFor('Cable Push Down (Straight Bar)') || {}).frames, barEx: (C.findExercise('Cable Pushdowns') || {}).name,
        ropeEx: (C.findExercise('Tricep Rope Pushdown') || {}).name };
    }""")
    check(r["version"] == 8, f"[{tag}] state migrated to v8", r["version"])
    check(r["rope"] == ["ses-bro", "ses-old"], f"[{tag}] Bro Split + legacy logs -> rope", r["rope"])
    check(r["bar"] == ["ses-max", "ses-max2"], f"[{tag}] Max-OT logs -> straight bar", r["bar"])
    check(not r["old"], f"[{tag}] old keys emptied after move", r["old"])
    check(r["ropeHist"] == ["ses-bro", "ses-old"] and r["oldNameHist"] == ["ses-bro", "ses-old"], f"[{tag}] rope history readable by new + old name")
    check(r["barHist"] == ["ses-max", "ses-max2"] == r["barHist2"], f"[{tag}] straight-bar history readable by AST + new name")
    check(r["backup"] and sorted(r["backup"]) == ["cable-pushdown:1", "tricep-rope-pushdown:3"], f"[{tag}] untouched backup kept", r["backup"])
    check(r["lastRope"] == {"reps": 12, "weight": 22.5} and r["lastBar"] == {"reps": 5, "weight": 32.5}, f"[{tag}] last logged per exercise", (r["lastRope"], r["lastBar"]))
    check(r["noteRope"] == "elbows tucked" == r["noteBar"], f"[{tag}] note kept on both")
    check(r["bro"] == ["Cable Rope Tricep Extension|cable-rope-tricep-extension"], f"[{tag}] Bro Split uses Cable Rope Tricep Extension", r["bro"])
    check(r["max"] == ["Cable Pushdown|cable-push-down-straight-bar"], f"[{tag}] Max-OT keeps AST name, straight-bar key", r["max"])
    check(r["ropePhoto"] == ["img/exercises/cable-rope-tricep-extension/0.webp"], f"[{tag}] rope photo on rope exercise")
    check(r["barPhoto"] == r["barPhoto2"] == ["img/exercises/cable-push-down-straight-bar/0.webp", "img/exercises/cable-push-down-straight-bar/1.webp"], f"[{tag}] straight-bar photo")
    check(r["barEx"] == "Cable Push Down (Straight Bar)" and r["ropeEx"] == "Cable Rope Tricep Extension", f"[{tag}] catalog names")
    page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")

    def shoot(program, exname, fname):
        page.evaluate(f"() => {{ const D = window.VELA_DATA; if (D.get().activeProgramId !== '{program}') D.switchProgram('{program}'); D.saveNow(); }}")
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }")
        wid, idx = page.evaluate(f"""() => {{ const w = window.VELA_DATA.get().workouts.find(w => w.exercises.some(e => e.name === '{exname}'));
            return [w.id, w.exercises.findIndex(e => e.name === '{exname}')]; }}""")
        page.locator(f'[data-testid="workout-tile-{wid}"]').tap()
        page.wait_for_timeout(400)
        btn = page.locator(f'[data-testid="ex-demo-{idx}"]')
        btn.scroll_into_view_if_needed()
        page.evaluate(f"() => document.querySelector('[data-testid=\"ex-demo-{idx}\"]').closest('[data-ex-block], .card').scrollIntoView({{block: 'center'}})")
        page.wait_for_timeout(400)
        title = page.evaluate(f"() => document.querySelector('[data-testid=\"ex-demo-{idx}\"]').closest('[data-ex-block], .card').querySelector('h2, h3').textContent")
        check(exname in title, f"[{tag}] card title {exname}", title)
        page.screenshot(path=str(SHOTS / f"{fname}-card{tag}.png"))
        btn.tap()
        page.wait_for_timeout(700)
        src = page.evaluate("() => { const i = document.querySelector('.demo-photo img'); return i ? [i.getAttribute('src'), i.complete && i.naturalWidth] : null; }")
        check(bool(src) and src[1], f"[{tag}] {exname} detail photo loads", src)
        page.screenshot(path=str(SHOTS / f"{fname}-detail{tag}.png"))
        return src

    s1 = shoot("bro-split", "Cable Rope Tricep Extension", "cable-rope-tricep-extension")
    check(s1 and "cable-rope-tricep-extension" in s1[0], f"[{tag}] rope detail uses rope photo")
    s2 = shoot("max-ot", "Cable Pushdown", "cable-push-down-straight-bar")
    check(s2 and "cable-push-down-straight-bar" in s2[0], f"[{tag}] Max-OT Cable Pushdown detail uses straight-bar photo")
    page.keyboard.press("Escape")
    page.reload(wait_until="networkidle")
    page.locator('[data-testid="tab-settings"]').tap()
    page.wait_for_timeout(200)
    check(page.locator('[data-testid="app-version"] b').inner_text() >= "24", f"[{tag}] version >= 24")
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "")
    run(p, 375, 812, "-375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
