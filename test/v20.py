"""VELA v20: counts match the checks (Mix day, partial + stray sessions), touch Delete works."""
import functools, http.server, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v20"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, str(detail if detail is not None else "").strip())
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


# Week 2 of Max-OT with a "Mix" day: Chest finished, Shoulders started (sets logged, not
# finished, timer left running 10 h), a stray finished session for a deleted workout and a
# legacy duplicate session tagged week 2.
SEED = """() => {
  const D = window.VELA_DATA;
  D.switchProgram('max-ot');
  D.resetCycle();
  D.advanceWeek();
  D.addWorkout({ name: 'Mix', minutes: 60, exercises: [] });
  const s = D.get();
  const chest = s.workouts.find(w => w.id === 'maxot-chest');
  D.updateSet(chest.id, 0, 0, { reps: 6, weight: 100, done: true });
  chest.timerAccumMs = 55 * 60000;
  D.finishWorkout(chest.id);
  const sh = s.workouts.find(w => w.id === 'maxot-shoulders');
  D.trackSets(sh.id, 0, [0], 6, 40);
  sh.timerPaused = false; sh.timerStartedAt = Date.now() - 10 * 3600000;
  const now = new Date().toISOString();
  s.sessions.unshift({ programId: 'max-ot', workoutId: 'wo-deleted', workoutName: 'Old day', week: 2,
    sessionId: 'ses-stray', date: now.slice(0,10), datetime: now, durationMs: 3600000, completed: true, finished: true });
  s.sessions.unshift({ programId: 'max-ot', workoutId: 'maxot-back', workoutName: 'Abs & Back', week: 2,
    sessionId: 'ses-legacy', date: now.slice(0,10), datetime: now, durationMs: 1800000, completed: true });
  D.saveNow();
  return { week: s.week, n: s.workouts.length, mix: s.workouts.find(w => w.name === 'Mix').id };
}"""


def touch_swipe(page, cdp, sel, dist=130):
    box = page.locator(sel).bounding_box()
    y = box["y"] + box["height"] / 2
    x0 = box["x"] + box["width"] - 30
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
    for i in range(1, 14):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 - i * dist / 13, "y": y}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(350)


def visible_deletes(page):
    return page.evaluate("""() => [...document.querySelectorAll('.swipe-actions')]
      .filter(b => getComputedStyle(b).visibility !== 'hidden').length""")


def run(p, width, height, tag):
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=3,
                              is_mobile=True, has_touch=True)
    page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    info = page.evaluate(SEED)
    check(info["week"] == 2 and info["n"] == 6, f"[{tag}] seeded week 2 with 6 days incl. Mix", info)
    page.reload(wait_until="networkidle")
    page.add_style_tag(content=INSETS)

    # Home dashboard
    wk = page.locator('[data-testid="tile-workouts"]').inner_text()
    sub = page.locator('[data-testid="streak-subtitle"]').inner_text()
    hrs = page.locator('[data-testid="tile-hours"]').inner_text()
    segs = page.evaluate("() => document.querySelectorAll('[data-testid=streak-bar] i').length")
    check(wk.strip().split()[0] == "1" or "\n1" in wk or wk.strip().startswith("1"), f"[{tag}] Home workouts completed = 1", wk)
    check("5 more" in sub, f"[{tag}] streak says 5 more this week", sub)
    check(segs == 6, f"[{tag}] streak bar has 6 segments", segs)
    check("0:55" in hrs, f"[{tag}] hours = finished workout only (0:55)", hrs)
    page.screenshot(path=str(SHOTS / f"home{tag}.png"))

    # Program overview and week page
    page.locator('[data-testid="tab-program"]').tap()
    page.wait_for_selector('[data-testid="week-list"]')
    p2 = page.locator('[data-testid="week-pct-2"]').inner_text()
    tot = page.locator('[data-testid="program-stat-workouts"]').inner_text()
    check(p2.startswith("17%"), f"[{tag}] overview week 2 = 17% (1/6)", p2)
    check(tot.split()[0].startswith("1/"), f"[{tag}] Program total done = 1", tot)
    page.screenshot(path=str(SHOTS / f"program{tag}.png"))
    page.locator('[data-testid="week-card-2"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    hdr = page.locator('[data-testid="week-detail-pct"]').inner_text()
    checks = page.evaluate("() => [...document.querySelectorAll('[data-testid=week-plan] .tile.done')].map(t => t.closest('.swipe-row').dataset.id)")
    check("17%" in hdr, f"[{tag}] week page header 17%", hdr)
    check(checks == ["maxot-chest"], f"[{tag}] only Chest & Triceps is checked", checks)
    check(visible_deletes(page) == 0, f"[{tag}] Delete hidden at rest")
    page.screenshot(path=str(SHOTS / f"week2{tag}.png"))

    # Swipe the Mix row with real touch events
    mix = f'.swipe-row[data-id="{info["mix"]}"]'
    touch_swipe(page, cdp, mix)
    is_open = page.evaluate(f"() => document.querySelector('{mix}').classList.contains('open')")
    check(is_open, f"[{tag}] Mix row opens on touch swipe")
    title = page.evaluate(f"""() => {{ const r = document.querySelector('{mix}'); const h = r.querySelector('h2');
        const rb = r.getBoundingClientRect(), hb = h.getBoundingClientRect();
        return {{ text: h.textContent, left: hb.left, rowLeft: rb.left, w: hb.width }}; }}""")
    check(title["text"] == "Mix" and title["left"] >= title["rowLeft"] and title["w"] > 10,
          f"[{tag}] Mix title stays visible when swiped", title)
    check(visible_deletes(page) == 1, f"[{tag}] Delete visible after swipe")
    page.screenshot(path=str(SHOTS / f"mix-swiped{tag}.png"))

    # Tap Delete with touch, confirm
    page.locator(f'{mix} .swipe-actions').tap()
    page.wait_for_timeout(300)
    dialog = page.locator('.dialog')
    check(dialog.count() == 1 and "Mix" in dialog.inner_text(), f"[{tag}] touch-tap Delete opens confirm",
          dialog.inner_text() if dialog.count() else "no dialog")
    page.screenshot(path=str(SHOTS / f"delete-confirm{tag}.png"))
    page.locator('[data-confirm=ok]').tap()
    page.wait_for_timeout(400)
    gone = page.locator(mix).count() == 0
    n_after = page.evaluate("() => window.VELA_DATA.get().workouts.length")
    check(gone and n_after == 5, f"[{tag}] Mix deleted from the plan", n_after)
    hdr = page.locator('[data-testid="week-detail-pct"]').inner_text()
    check("20%" in hdr, f"[{tag}] header updates live to 20% (1/5)", hdr)
    page.screenshot(path=str(SHOTS / f"after-delete{tag}.png"))

    # Tap on a closed row still opens it; a tap on an open row only closes it
    touch_swipe(page, cdp, '.swipe-row[data-id="maxot-arms"]')
    page.locator('[data-testid="workout-tile-maxot-arms"]').tap()
    page.wait_for_timeout(250)
    still = page.locator('[data-testid="week-plan"]').count() == 1
    closed = page.evaluate("() => !document.querySelector('.swipe-row[data-id=maxot-arms]').classList.contains('open')")
    check(still and closed, f"[{tag}] tap on an open row closes it without opening the workout")

    # Home updates after the delete
    page.locator('[data-testid="tab-home"]').tap()
    page.wait_for_timeout(250)
    sub = page.locator('[data-testid="streak-subtitle"]').inner_text()
    check("4 more" in sub, f"[{tag}] Home updates after delete (4 more)", sub)

    # Past week: advance, week 2 shows exactly its rows; the stray finished session is shown as a row
    page.evaluate("() => window.VELA_DATA.advanceWeek()")
    page.locator('[data-testid="tab-program"]').tap()
    page.wait_for_selector('[data-testid="week-list"]')
    p2 = page.locator('[data-testid="week-pct-2"]').inner_text()
    page.locator('[data-testid="week-card-2"]').tap()
    page.wait_for_selector('[data-testid="week-plan"]')
    rows = page.evaluate("() => [...document.querySelectorAll('[data-testid=week-plan] .swipe-row')].map(r => [r.dataset.id, r.dataset.weekState])")
    done = [r for r in rows if r[1] == "logged"]
    hdr = page.locator('[data-testid="week-detail-pct"]').inner_text()
    pct = round(100 * len(done) / len(rows))
    check(f"{pct}%" in hdr and p2.startswith(f"{pct}%"), f"[{tag}] past week % matches its logged rows", (rows, hdr, p2))
    check(pct == 20 and len(done) == 1, f"[{tag}] closed week keeps the same 20% it showed while current", rows)
    check(["maxot-shoulders", "partial"] in rows, f"[{tag}] unfinished Shoulders shows as started, not done", rows)
    page.screenshot(path=str(SHOTS / f"week2-past{tag}.png"))
    page.locator('[data-testid="tab-settings"]').tap()
    page.wait_for_timeout(200)
    ver = page.locator('[data-testid="app-version"] b').inner_text()
    check(int(ver) >= 20, f"[{tag}] version 20+", ver)
    browser.close()


def run_timers(p, width, height, tag):
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=3,
                              is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.add_init_script("""(() => { const real = Date.now.bind(Date);
        const get = () => Number(sessionStorage.getItem('__off') || 0);
        Object.defineProperty(window, '__off', { get, set: (v) => sessionStorage.setItem('__off', String(v)) });
        Date.now = () => real() + get(); })()""")
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
    page.add_style_tag(content=INSETS)
    page.locator('[data-testid="workout-tile-chest"]').tap()
    page.wait_for_selector('[data-testid="reset-timer"]')
    # Session timer reset
    page.evaluate("() => { window.__off += 754000; }")
    page.wait_for_timeout(1100)
    before = page.locator('[data-timer-clock]').inner_text()
    page.locator('[data-testid="reset-timer"]').tap()
    page.wait_for_selector('.dialog')
    check("0:00" in page.locator('.dialog').inner_text(), f"[{tag}] reset asks to confirm", page.locator('.dialog').inner_text())
    page.screenshot(path=str(SHOTS / f"timer-reset-confirm{tag}.png"))
    page.locator('[data-confirm=ok]').tap()
    page.wait_for_timeout(300)
    after = page.locator('[data-timer-clock]').inner_text()
    check(before.count(":") and after.endswith(("0:00", "0:01")) and before != after, f"[{tag}] timer resets to 0:00", (before, after))
    # Rest timer is timestamp-based
    page.locator('[data-testid="set-chip-0-0"]').tap()
    page.wait_for_selector('[data-testid="sets-tracking"]')
    page.locator('[data-testid="reps-input"]').fill("8")
    page.locator('[data-testid="weight-input"]').fill("60")
    page.locator('[data-testid="track-reps"]').tap()
    page.wait_for_selector('[data-testid="rest-timer"]')
    start = page.locator('[data-rest-clock]').inner_text()
    # Simulate iOS suspending JS for 40 s: jump the clock and fire visibilitychange in one go
    jumped = page.evaluate("""() => { window.__off += 40000;
        document.dispatchEvent(new Event('visibilitychange'));
        return document.querySelector('[data-rest-clock]').textContent; }""")
    check(start in ("1:30", "1:29") and jumped in ("0:50", "0:49"), f"[{tag}] rest catches up after app switch", (start, jumped))
    page.screenshot(path=str(SHOTS / f"rest-after-switch{tag}.png"))
    saved = page.evaluate("() => JSON.parse(localStorage.getItem('vela-rest-v1') || 'null')")
    check(bool(saved and saved.get("endsAt")), f"[{tag}] rest end time is saved", saved)
    # Reload (iOS killed the app): rest comes back with the right time left
    page.reload(wait_until="networkidle")
    page.wait_for_selector('[data-testid="rest-timer"]')
    t = page.locator('[data-rest-clock]').inner_text()
    check(t in ("0:50", "0:49", "0:48"), f"[{tag}] rest survives a reload", t)
    # Finished while away: shows done, then closes
    done = page.evaluate("""() => { window.__off += 120000;
        document.dispatchEvent(new Event('visibilitychange'));
        const el = document.querySelector('[data-testid=rest-timer]');
        return el ? [el.classList.contains('rest-done'), el.querySelector('.rest-lbl').textContent, document.querySelector('[data-rest-clock]').textContent] : null; }""")
    check(done and done[0] and done[1] == "Rest done" and done[2] == "0:00", f"[{tag}] rest finished while away shows done", done)
    page.screenshot(path=str(SHOTS / f"rest-done{tag}.png"))
    page.wait_for_timeout(1800)
    check(page.locator('[data-testid="rest-timer"]').count() == 0, f"[{tag}] rest sheet closes after done")
    check(page.evaluate("() => localStorage.getItem('vela-rest-v1')") is None, f"[{tag}] saved rest cleared")
    # Machine Chest Press photo
    ph = page.evaluate("() => window.VELA_CATALOG.photoFor('Machine Chest Press')")
    check(ph and ph["frames"] == ["img/exercises/machine-chest-press/0.webp"] and ph["match"] == "exact",
          f"[{tag}] Machine Chest Press uses the new machine photo", ph and ph.get("frames"))
    browser.close()


httpd, URL = start_server()
with sync_playwright() as p:
    run(p, 440, 956, "")
    run(p, 375, 812, "-375")
    run_timers(p, 440, 956, "")
    run_timers(p, 375, 812, "-375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
