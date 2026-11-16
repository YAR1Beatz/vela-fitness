"""VELA v25: looping ChatGPT demo on Cable Push Down (Straight Bar) (Max-OT "Cable Pushdown"),
and the floating pill tab bar with a sliding active bubble."""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get("ROOT", Path(__file__).resolve().parent.parent))
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v25"))
SHOTS.mkdir(parents=True, exist_ok=True)
fails = []
TABS = ["home", "program", "progress", "checkin", "settings"]


def check(ok, label, detail=""):
    print(("ok  " if ok else "FAIL"), label, detail if not ok else "")
    if not ok:
        fails.append(label)


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{httpd.server_address[1]}/"
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")


def insets(page, bottom=34, top=62):
    page.add_style_tag(content=f":root {{ --safe-top: {top}px !important; --safe-bottom: {bottom}px !important; }}")


def open_app(p, w, h, reduced=False):
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome",
                          args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(viewport={"width": w, "height": h}, screen={"width": w, "height": h}, device_scale_factor=3,
                      is_mobile=True, has_touch=True, user_agent=UA, reduced_motion="reduce" if reduced else "no-preference")
    page = c.new_page()
    page.goto(URL, wait_until="networkidle")
    if page.locator('[data-testid="days-setup"]').count():
        page.locator('[data-testid="days-option-4"]').tap()
        page.wait_for_selector('[data-testid="days-setup"]', state="detached")
    insets(page)
    page.wait_for_timeout(150)
    return b, page


BAR_JS = """() => {
  const bar = document.querySelector('[data-testid="tab-bar"]');
  const ind = bar.querySelector('[data-testid="tab-indicator"]');
  const on = bar.querySelector('.tab-btn.on');
  const br = bar.getBoundingClientRect(), ir = ind.getBoundingClientRect(), orr = on ? on.getBoundingClientRect() : null;
  const cs = getComputedStyle(bar), ics = getComputedStyle(ind), ocs = on ? getComputedStyle(on) : null;
  const lab = on ? on.querySelector('span') : null;
  const labels = [...bar.querySelectorAll('.tab-btn span')].map(s => ({ t: s.textContent, tt: getComputedStyle(s).textTransform,
     over: s.scrollWidth > s.parentElement.clientWidth + 1 }));
  const content = document.querySelector('.content');
  return { bar: { l: br.left, r: br.right, t: br.top, b: br.bottom, h: br.height, w: br.width, radius: parseFloat(cs.borderTopLeftRadius),
      bg: cs.backgroundColor, shadow: cs.boxShadow, pos: cs.position },
    ind: { l: ir.left, r: ir.right, w: ir.width, t: ir.top, b: ir.bottom, bg: ics.backgroundColor, trans: ics.transitionDuration, prop: ics.transitionProperty },
    on: orr && { id: on.dataset.tab, l: orr.left, r: orr.right, color: ocs.color }, labels,
    offColor: getComputedStyle(bar.querySelector('.tab-btn:not(.on)')).color,
    vw: innerWidth, vh: innerHeight,
    contentPad: content ? parseFloat(getComputedStyle(content).paddingBottom) : null };
}"""


def bar_checks(page, tag, w, h, active):
    m = page.evaluate(BAR_JS)
    bar, ind, on = m["bar"], m["ind"], m["on"]
    check(bar["pos"] == "fixed", f"[{tag}] tab bar fixed")
    check(bar["l"] >= 12 and w - bar["r"] >= 12, f"[{tag}] pill inset from the edges", (bar["l"], w - bar["r"]))
    check(bar["radius"] >= bar["h"] / 2 - 0.5, f"[{tag}] pill fully rounded", bar["radius"])
    gap = h - bar["b"]
    check(26 <= gap <= 32, f"[{tag}] pill sits above the home indicator (safe 34)", gap)
    check("rgba" in bar["bg"] and bar["shadow"] != "none", f"[{tag}] translucent navy with soft shadow", (bar["bg"], bar["shadow"]))
    check(on and on["id"] == active, f"[{tag}] {active} tab active", on)
    check(on and abs(ind["l"] - on["l"]) <= 1.5 and abs(ind["r"] - on["r"]) <= 1.5, f"[{tag}] bubble under the {active} tab", (ind, on))
    check("30, 224, 200" in ind["bg"], f"[{tag}] teal bubble", ind["bg"])
    check(on and "4, 38, 31" in on["color"], f"[{tag}] dark icon/label on active", on and on["color"])
    check("126, 147, 171" in m["offColor"], f"[{tag}] muted inactive tabs", m["offColor"])
    check(all(l["tt"] == "uppercase" and not l["over"] for l in m["labels"]), f"[{tag}] uppercase labels fit", m["labels"])
    return m


def run(p, w, h, tag):
    b, page = open_app(p, w, h)
    # ---- tab bar on each tab
    m = bar_checks(page, tag, w, h, "home")
    check(m["ind"]["trans"] == "0.25s" and "transform" in m["ind"]["prop"], f"[{tag}] bubble slides with 250ms transform", m["ind"])
    # content scrolls under the bar with enough room: last element ends above the bar
    page.evaluate("document.querySelector('.content').scrollTop = 1e6")
    page.wait_for_timeout(120)
    last = page.evaluate("""() => { const c = document.querySelector('.content'); const kids = [...c.querySelectorAll('*')]
        .filter(e => e.offsetParent && getComputedStyle(e).position !== 'fixed' && e.getBoundingClientRect().height > 0);
        return Math.max(...kids.map(e => e.getBoundingClientRect().bottom)); }""")
    top = page.evaluate("document.querySelector('[data-testid=\"tab-bar\"]').getBoundingClientRect().top")
    check(last <= top - 6, f"[{tag}] home content ends above the pill when scrolled", (last, top))
    page.evaluate("document.querySelector('.content').scrollTop = 0")
    sfx = "" if tag == "440" else f"-{tag}"
    page.screenshot(path=str(SHOTS / f"tab-home{sfx}.png"))
    for t in TABS[1:]:
        page.locator(f'[data-testid="tab-{t}"]').tap()
        page.wait_for_timeout(80)
        mid = page.evaluate("""() => { const i = document.querySelector('[data-testid="tab-indicator"]');
            return getComputedStyle(i).transform; }""")
        page.wait_for_timeout(350)
        insets(page)
        bar_checks(page, tag, w, h, t)
        if t == "program":
            check(mid not in ("none",), f"[{tag}] bubble animating mid-switch", mid)
        page.evaluate("document.querySelector('.content') && (document.querySelector('.content').scrollTop = 1e6)")
        page.wait_for_timeout(120)
        last = page.evaluate("""() => { const c = document.querySelector('.content'); const kids = [...c.querySelectorAll('*')]
            .filter(e => e.offsetParent && getComputedStyle(e).position !== 'fixed' && e.getBoundingClientRect().height > 0);
            return kids.length ? Math.max(...kids.map(e => e.getBoundingClientRect().bottom)) : 0; }""")
        top = page.evaluate("document.querySelector('[data-testid=\"tab-bar\"]').getBoundingClientRect().top")
        check(last <= top - 6, f"[{tag}] {t} content ends above the pill when scrolled", (last, top))
        page.evaluate("document.querySelector('.content').scrollTop = 0")
        page.wait_for_timeout(60)
        page.screenshot(path=str(SHOTS / f"tab-{t}{sfx}.png"))
    check(page.locator('[data-testid="app-version"] b').inner_text() == "25", f"[{tag}] version 25")
    check("vela-v25" in page.locator('.settings-build').inner_text(), f"[{tag}] cache vela-v25")

    # ---- pushdown demo video
    meta = page.evaluate("""() => { const C = window.VELA_CATALOG;
      const a = C.photoFor('Cable Pushdown') || {}, b = C.photoFor('Cable Push Down (Straight Bar)') || {}, r = C.photoFor('Cable Rope Tricep Extension') || {};
      return { a: a.video, b: b.video, poster: b.poster, rope: r.video || null, ropeFrames: (r.frames || []).length }; }""")
    check(meta["a"] == meta["b"] == "img/exercises/cable-push-down-straight-bar/demo.mp4", f"[{tag}] video on straight-bar pushdown (+ Max-OT alias)", meta)
    check(meta["rope"] is None and meta["ropeFrames"] >= 1, f"[{tag}] rope extension keeps its photo, no video", meta)
    page.evaluate("() => { const D = window.VELA_DATA; if (D.get().activeProgramId !== 'max-ot') D.switchProgram('max-ot'); D.saveNow(); }")
    page.reload(wait_until="networkidle")
    insets(page)
    wid, idx = page.evaluate("""() => { const w = window.VELA_DATA.get().workouts.find(w => w.exercises.some(e => e.name === 'Cable Pushdown'));
        return [w.id, w.exercises.findIndex(e => e.name === 'Cable Pushdown')]; }""")
    page.locator('[data-testid="tab-home"]').tap()
    page.wait_for_timeout(200)
    page.locator(f'[data-testid="workout-tile-{wid}"]').tap()
    page.wait_for_selector(f'[data-testid="ex-demo-{idx}"]')
    page.evaluate(f"() => document.querySelector('[data-testid=\"ex-demo-{idx}\"]').scrollIntoView({{block: 'center'}})")
    page.wait_for_timeout(900)
    check(page.locator(f'[data-testid="ex-demo-{idx}"] [data-testid="ex-video"]').count() == 1, f"[{tag}] workout card shows the looping video")
    page.screenshot(path=str(SHOTS / f"pushdown-card{sfx}.png"))
    page.locator(f'[data-testid="ex-demo-{idx}"]').tap()
    page.wait_for_selector('[data-testid="exercise-demo"] [data-testid="ex-video"]')
    page.wait_for_timeout(1500)
    st = page.evaluate("""() => { const v = document.querySelector('[data-testid="exercise-demo"] [data-testid="ex-video"]');
      const box = v.closest('.demo-photo').getBoundingClientRect(); const r = v.getBoundingClientRect();
      return { paused: v.paused, t: v.currentTime, rs: v.readyState, vw: v.videoWidth, vh: v.videoHeight, loop: v.loop, muted: v.muted,
        inline: v.playsInline, src: v.currentSrc, boxW: box.width, boxH: box.height, right: r.right, W: innerWidth,
        title: document.querySelector('[data-testid="exercise-demo"] h2').textContent }; }""")
    print(st)
    check(not st["paused"] and st["t"] > 0.3 and st["rs"] >= 2, f"[{tag}] detail video playing", st)
    check(st["vw"] == 896 and st["vh"] == 672 and st["loop"] and st["muted"] and st["inline"], f"[{tag}] 896x672 loop muted inline", st)
    check(abs(st["boxW"] / st["boxH"] - 4 / 3) < 0.02 and st["right"] <= st["W"], f"[{tag}] 4:3 video fills the 4:3 detail box", st)
    check("Cable Pushdown" in st["title"] or "Straight Bar" in st["title"], f"[{tag}] detail title", st["title"])
    page.screenshot(path=str(SHOTS / f"pushdown-detail-playing{sfx}.png"))
    page.wait_for_timeout(700)
    page.screenshot(path=str(SHOTS / f"pushdown-detail-playing{sfx}-b.png"))
    t2 = page.evaluate("document.querySelector('[data-testid=\"exercise-demo\"] [data-testid=\"ex-video\"]').currentTime")
    check(t2 != st["t"], f"[{tag}] video time advances", (st["t"], t2))
    b.close()

    # reduced motion: bubble does not animate
    b, page = open_app(p, w, h, reduced=True)
    tr = page.evaluate("getComputedStyle(document.querySelector('[data-testid=\"tab-indicator\"]')).transitionDuration")
    check(tr in ("0s",), f"[{tag}] reduced motion: no bubble transition", tr)
    b.close()


with sync_playwright() as p:
    run(p, 440, 956, "440")
    run(p, 375, 812, "375")
httpd.shutdown()
print("FAILS:", fails)
sys.exit(1 if fails else 0)
