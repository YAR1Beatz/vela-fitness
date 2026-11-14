"""VELA v13: bigger overload badges, incline photos, history alias, image audit."""
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
SHOTS = Path(os.environ.get("SHOTS", "/workspace/design-ideas/gym-app/live-v13"))
SHOTS.mkdir(parents=True, exist_ok=True)
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


def choose_days_if_needed(page, days=4):
    sel = '[data-testid="days-setup"]'
    if page.locator(sel).count():
        page.locator(f'[data-testid="days-option-{days}"]').tap()
        page.wait_for_selector(sel, state="detached")


INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


def open_page(context, url, width=None, height=None):
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    page.add_style_tag(content=INSETS)
    choose_days_if_needed(page, 4)
    page.wait_for_selector('[data-testid="week-plan"]')
    return page


SEED = """() => {
  const D = window.VELA_DATA;
  D.switchProgram("max-ot");
  const s = D.get();
  s.week = 2;
  s.version = 5;
  s.history = s.history || {};
  s.sessions = s.sessions || [];
  // Old key + old display name, as a pre-v13 install would have stored them.
  const w = (s.workouts || []).find((wo) => wo.id === "maxot-chest");
  if (w) {
    (w.exercises || []).forEach((ex) => {
      if (ex.name === "Incline Dumbbell Tricep Extension" || ex.key === "incline-dumbbell-tricep-extension") {
        ex.name = "Incline Tricep Extension";
        ex.key = "incline-tricep-extension";
      }
    });
  }
  delete s.history["incline-dumbbell-tricep-extension"];
  s.history["incline-tricep-extension"] = [
    {
      date: "2026-11-14", datetime: "2026-11-14T18:00:00.000Z",
      workout: "Chest & Triceps", workoutId: "maxot-chest", week: 2,
      programId: "max-ot", sessionId: "ses-tricep-new",
      sets: [{reps:8,weight:25},{reps:8,weight:22.5}]
    },
    {
      date: "2026-11-07", datetime: "2026-11-07T18:00:00.000Z",
      workout: "Chest & Triceps", workoutId: "maxot-chest", week: 1,
      programId: "max-ot", sessionId: "ses-tricep-old",
      sets: [{reps:8,weight:22.5},{reps:8,weight:22.5}]
    }
  ];
  s.history["incline-barbell-press"] = [
    {
      date: "2026-11-14", datetime: "2026-11-14T18:00:00.000Z",
      workout: "Chest & Triceps", workoutId: "maxot-chest", week: 2,
      programId: "max-ot", sessionId: "ses-barbell-new",
      sets: [{reps:8,weight:65},{reps:8,weight:60},{reps:8,weight:55}]
    },
    {
      date: "2026-11-07", datetime: "2026-11-07T18:00:00.000Z",
      workout: "Chest & Triceps", workoutId: "maxot-chest", week: 1,
      programId: "max-ot", sessionId: "ses-barbell-old",
      sets: [{reps:8,weight:60},{reps:8,weight:60},{reps:8,weight:60}]
    }
  ];
  s.sessions.unshift({
    programId: "max-ot", workoutId: "maxot-chest", workoutName: "Chest & Triceps", week: 1,
    sessionId: "ses-barbell-old", date: "2026-11-07", datetime: "2026-11-07T18:00:00.000Z",
    durationMs: 40*60000, volumeKg: 60*8*3 + 22.5*8*2, completed: true
  });
  D.saveNow();
  return { version: s.version, histKeys: Object.keys(s.history) };
}"""

AFTER_RELOAD = """() => {
  const D = window.VELA_DATA;
  const C = window.VELA_CATALOG;
  const s = D.get();
  const w = (s.workouts || []).find((wo) => wo.id === "maxot-chest");
  const names = (w && w.exercises || []).map((ex) => ({name: ex.name, key: ex.key}));
  const tricepHist = (D.getHistory("incline-dumbbell-tricep-extension") || []).length;
  const tricepOld = (D.getHistory("incline-tricep-extension") || []).length;
  if (w) {
    const barbell = w.exercises.find((ex) => ex.key === "incline-barbell-press");
    const tricep = w.exercises.find((ex) => ex.key === "incline-dumbbell-tricep-extension");
    if (barbell) barbell.sets.forEach((st) => { st.done = true; st.weight = 70; st.reps = 8; });
    if (tricep) tricep.sets.forEach((st) => { st.done = true; st.weight = 25; st.reps = 8; });
    D.saveNow();
  }
  const photoB = C.photoFor("Incline Barbell Press");
  const photoT = C.photoFor("Incline Dumbbell Tricep Extension");
  const photoOld = C.photoFor("Incline Tricep Extension");
  return {
    version: s.version,
    histKeys: Object.keys(s.history || {}),
    names,
    tricepHist,
    tricepOld,
    photoB: photoB && { frames: photoB.frames, author: photoB.author, kind: photoB.kind || "photo" },
    photoT: photoT && { frames: photoT.frames, author: photoT.author, kind: photoT.kind || "photo" },
    photoOldFrames: photoOld && photoOld.frames,
    canon: C.canonicalKey("Incline Tricep Extension"),
  };
}"""

AUDIT = """async () => {
  const C = window.VELA_CATALOG;
  const programs = window.VELA_PROGRAMS || {};
  const names = new Set();
  const inProgram = new Set();
  Object.values(programs).forEach((prog) => {
    (prog.workouts || []).forEach((w) => {
      (w.exercises || []).forEach((ex) => {
        names.add(ex.name);
        inProgram.add(ex.name);
        if (ex.alt) names.add(ex.alt);
      });
    });
  });
  (C.EXERCISES || []).forEach((ex) => names.add(ex.name));
  const rows = [];
  const load = (src) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ src, ok: im.naturalWidth > 0, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => resolve({ src, ok: false, w: 0, h: 0 });
    im.src = src;
  });
  for (const name of [...names].sort()) {
    const photo = C.photoFor(name);
    const frames = photo && photo.frames ? photo.frames : [];
    const loaded = [];
    for (const src of frames) loaded.push(await load(src));
    rows.push({
      name,
      key: C.canonicalKey(name),
      hasPhoto: !!(photo && frames.length),
      kind: (photo && (photo.kind || (photo.author === "Everkinetic" ? "illustration" : "photo"))) || "thumbnail",
      match: photo && photo.match,
      author: photo && photo.author,
      note: photo && photo.note,
      frames: loaded,
      broken: loaded.some((f) => !f.ok),
      inProgram: inProgram.has(name),
    });
  }
  return rows;
}"""


def badge_metrics(page, selector):
    return page.evaluate(
        """(sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      const color = style.color;
      const svg = el.querySelector("svg");
      const sr = svg ? svg.getBoundingClientRect() : null;
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        bg, color,
        svg: sr ? { w: Math.round(sr.width), h: Math.round(sr.height) } : null,
        radius: style.borderRadius,
      };
    }""",
        selector,
    )


def contrast_ok(bg, fg):
    """Rough relative luminance contrast from rgb() strings."""
    def parse(c):
        c = c.strip()
        if c.startswith("rgb"):
            nums = [int(x) for x in c[c.find("(") + 1 : c.find(")")].split(",")[:3]]
            return nums
        return None

    def lum(rgb):
        def f(v):
            v = v / 255.0
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        r, g, b = [f(x) for x in rgb]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    a, b = parse(bg), parse(fg)
    if not a or not b:
        return False, 0
    L1, L2 = lum(a), lum(b)
    hi, lo = max(L1, L2), min(L1, L2)
    ratio = (hi + 0.05) / (lo + 0.05)
    return ratio >= 3.0, round(ratio, 2)


def main():
    httpd, url = start_server()
    print("serving", url)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox"],
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
        page = open_page(context, url)
        pre = page.evaluate(SEED)
        print("seed", pre)
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        info = page.evaluate(AFTER_RELOAD)
        print("after", json.dumps(info, indent=2)[:2000])
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.wait_for_selector('[data-testid="week-plan"]')

        check(info["version"] >= 6, "migrated to state version 6", str(info["version"]))
        check("incline-dumbbell-tricep-extension" in info["histKeys"], "history moved to new key", str(info["histKeys"]))
        check("incline-tricep-extension" not in info["histKeys"], "old history key removed after migrate", str(info["histKeys"]))
        check(info["canon"] == "incline-dumbbell-tricep-extension", "canonicalKey maps the old name")
        check(info["tricepHist"] >= 1 and info["tricepOld"] >= 1, "getHistory works for new and old names", f"{info['tricepHist']}/{info['tricepOld']}")
        check(any(n["name"] == "Incline Dumbbell Tricep Extension" and n["key"] == "incline-dumbbell-tricep-extension" for n in info["names"]), "workout uses the new name and key", str(info["names"]))
        check(info["photoB"] and len(info["photoB"]["frames"]) == 2, "Incline Barbell Press has 2 frames", str(info["photoB"]))
        check(info["photoT"] and len(info["photoT"]["frames"]) == 2, "Incline Dumbbell Tricep Extension has 2 frames", str(info["photoT"]))
        check(info["photoT"] and info["photoT"]["kind"] == "illustration", "tricep uses illustration fallback")
        check(info["photoOldFrames"] and len(info["photoOldFrames"]) == 2, "old name still resolves photos")

        # Image audit (all programs + catalog)
        rows = page.evaluate(AUDIT)
        (SHOTS / "image-audit.json").write_text(json.dumps(rows, indent=2))
        missing = [r for r in rows if not r["hasPhoto"]]
        missing_prog = [r for r in missing if r.get("inProgram")]
        missing_lib = [r for r in missing if not r.get("inProgram")]
        broken = [r for r in rows if r["broken"]]
        illustrations = [r for r in rows if r["kind"] == "illustration"]
        print("AUDIT exercises", len(rows), "missing", len(missing), "program-missing", len(missing_prog), "broken", len(broken), "illustrations", len(illustrations))
        for r in missing_prog:
            print("  missing program/alt:", r["name"])
        for r in missing_lib:
            print("  missing library only:", r["name"])
        for r in broken:
            print("  BROKEN:", r["name"], r["frames"])
        for r in illustrations:
            print("  illustration:", r["name"])
        check(len(broken) == 0, "no broken image URLs in programs or catalog")
        barbell = next((r for r in rows if r["name"] == "Incline Barbell Press"), None)
        tricep = next((r for r in rows if r["name"] == "Incline Dumbbell Tricep Extension"), None)
        check(barbell and barbell["hasPhoto"] and not barbell["broken"], "Incline Barbell Press image loads")
        check(tricep and tricep["hasPhoto"] and not tricep["broken"], "Incline Dumbbell Tricep Extension image loads")

        # Open Max-OT chest workout — tiles should be present
        page.wait_for_selector('[data-testid="workout-tile-maxot-chest"]')
        page.locator('[data-testid="workout-tile-maxot-chest"]').tap()
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        title = page.inner_text("h1, .workout-title, [data-testid='workout-title']")
        body = page.inner_text("#content")
        print("workout body snippet:", body[:500])
        check("Incline Barbell Press" in body, "workout shows Incline Barbell Press")
        check("Incline Dumbbell Tricep Extension" in body, "workout shows renamed tricep exercise")
        check("Incline Tricep Extension" not in body or "Incline Dumbbell Tricep Extension" in body, "old standalone name is gone")

        # Photos visible on cards
        photos = page.locator('[data-testid="ex-photo"] img.frame-a')
        check(photos.count() >= 2, "exercise cards show photos", str(photos.count()))
        # first card is incline barbell
        src0 = page.locator('[data-testid="ex-demo-0"] img.frame-a').get_attribute("src")
        check(src0 and "incline-barbell-press" in src0, "card 0 uses barbell press stills", src0 or "")
        # find tricep card
        tricep_src = page.evaluate("""() => {
          const cards = [...document.querySelectorAll('[data-testid^="ex-demo-"]')];
          for (const c of cards) {
            const img = c.querySelector('img.frame-a');
            if (img && img.src.includes('incline-dumbbell-tricep-extension')) return img.getAttribute('src');
          }
          return null;
        }""")
        check(bool(tricep_src), "tricep card uses new illustration stills", tricep_src or "")

        # Overload badges on set pills
        badge = page.locator('[data-testid="set-chip-0-0"] .badge.up')
        check(badge.count() == 1, "first logged set has green up badge")
        metrics = badge_metrics(page, '[data-testid="set-chip-0-0"] .badge.up')
        print("badge metrics", metrics)
        if metrics:
            check(metrics["w"] >= 22 and metrics["h"] >= 22, "badge is at least 22px", str(metrics))
            check(metrics["svg"] and metrics["svg"]["w"] >= 14, "arrow inside badge is visibly large", str(metrics.get("svg")))
            ok, ratio = contrast_ok(metrics["bg"], metrics["color"])
            check(ok, f"green badge contrast on fill is >= 3:1 ({ratio})", f"bg={metrics['bg']} fg={metrics['color']}")
        # layout: chips stay in the card at 440
        overflow = page.evaluate("""() => {
          const chips = [...document.querySelectorAll('[data-testid^="set-chip-0-"]')];
          const row = document.querySelector('[data-chips="0"]');
          if (!row || !chips.length) return {ok:false, reason:'missing'};
          const rr = row.getBoundingClientRect();
          const card = row.closest('.card, .ex-card, article, section') || row.parentElement;
          const cr = card.getBoundingClientRect();
          const overflowChip = chips.some(c => {
            const r = c.getBoundingClientRect();
            return r.right > cr.right + 1 || r.left < cr.left - 1;
          });
          return {
            ok: !overflowChip,
            rowW: Math.round(rr.width),
            cardW: Math.round(cr.width),
            chipWidths: chips.map(c => Math.round(c.getBoundingClientRect().width)),
            chipTops: chips.map(c => Math.round(c.getBoundingClientRect().top)),
          };
        }""")
        print("chip layout 440", overflow)
        check(overflow.get("ok"), "set pills do not overflow the card at 440", str(overflow))

        # volume badge
        vol_badge = page.locator('[data-testid="volume-vs-last-0"] .badge')
        check(vol_badge.count() == 1, "volume compare shows a badge")

        page.screenshot(path=str(SHOTS / "set-pills.png"), full_page=False)

        # Demo sheets for both exercises
        page.locator('[data-testid="ex-demo-0"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"]')
        demo = page.inner_text('[data-testid="exercise-demo"]')
        check("Incline Barbell Press" in demo, "demo title is Incline Barbell Press")
        check("Goulart" in demo and "CC BY-SA 4.0" in demo, "barbell demo credit", demo)
        demo_ok = page.evaluate("""() => {
          const im = document.querySelector('[data-testid="exercise-demo"] img.frame-a');
          return !!(im && im.naturalWidth > 0);
        }""")
        check(demo_ok, "barbell demo image decoded")
        page.screenshot(path=str(SHOTS / "incline-barbell-press.png"), full_page=False)
        page.locator('[data-testid="close-demo"]').tap()
        page.wait_for_selector('[data-testid="exercise-demo"]', state="detached")

        # tricep demo — find index
        t_idx = page.evaluate("""() => {
          const els = [...document.querySelectorAll('[data-testid^="ex-demo-"]')];
          for (const el of els) {
            const id = el.getAttribute('data-testid');
            const img = el.querySelector('img.frame-a');
            if (img && img.src.includes('incline-dumbbell-tricep-extension')) return Number(id.replace('ex-demo-',''));
          }
          return -1;
        }""")
        check(t_idx >= 0, "found tricep demo index", str(t_idx))
        if t_idx >= 0:
            page.locator(f'[data-testid="ex-demo-{t_idx}"]').tap()
            page.wait_for_selector('[data-testid="exercise-demo"]')
            demo = page.inner_text('[data-testid="exercise-demo"]')
            check("Incline Dumbbell Tricep Extension" in demo, "demo title is the new name")
            check("Everkinetic" in demo, "tricep demo credits Everkinetic", demo)
            page.screenshot(path=str(SHOTS / "incline-dumbbell-tricep-extension.png"), full_page=False)
            page.locator('[data-testid="close-demo"]').tap()
            page.wait_for_selector('[data-testid="exercise-demo"]', state="detached")

        # History row with badge
        page.locator('[data-testid="tab-progress"]').tap()
        # close workout if still open? tab might work
        page.wait_for_timeout(300)
        # prefer the renamed key
        sel_new = '[data-testid="progress-ex-incline-dumbbell-tricep-extension"]'
        sel_old = '[data-testid="progress-ex-incline-tricep-extension"]'
        page.wait_for_timeout(200)
        # list what's on progress
        prog = page.evaluate("""() => [...document.querySelectorAll('[data-testid^="progress-ex-"],[data-testid^="pb-row-"]')].map(e => e.getAttribute('data-testid'))""")
        print("progress rows", prog)
        if page.locator(sel_new).count():
            page.locator(sel_new).tap()
        elif page.locator(sel_old).count():
            page.locator(sel_old).tap()
        else:
            # maybe need to scroll or the list uses another testid
            print("no tricep progress row visible")
        if page.locator('[data-testid="history-sheet"]').count() or page.locator(sel_new).count() or page.locator(sel_old).count():
            page.wait_for_selector('[data-testid="history-sheet"]')
            hbody = page.inner_text('[data-testid="history-sheet"]')
            print("history body:\n", hbody)
            check("22,5 kg × 8" in hbody or "22.5 kg × 8" in hbody, "aliased history sets are visible", hbody)
            check("25 kg × 8" in hbody, "newer progressed session is visible", hbody)
            n_up = page.locator('[data-testid="history-sheet"] .badge.up').count()
            n_same = page.locator('[data-testid="history-sheet"] .badge.same').count()
            check(n_up >= 1, "history row shows a progressed badge", str(n_up))
            check(n_same >= 1, "history row shows a maintained badge", str(n_same))
            page.screenshot(path=str(SHOTS / "history-row.png"), full_page=False)

        # 375 width layout
        page.close()
        context2 = browser.new_context(
            viewport={"width": 375, "height": 812},
            screen={"width": 375, "height": 812},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = open_page(context2, url, 375, 812)
        # state persists in a new context? NO - new context is fresh storage.
        # Seed again.
        page.evaluate(SEED)
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.evaluate(AFTER_RELOAD)
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.wait_for_selector('[data-testid="workout-tile-maxot-chest"]')
        page.locator('[data-testid="workout-tile-maxot-chest"]').tap()
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        layout375 = page.evaluate("""() => {
          const chips = [...document.querySelectorAll('[data-testid^="set-chip-0-"]')];
          const row = document.querySelector('[data-chips="0"]');
          const card = row && (row.closest('.card, .ex-card, article, section') || row.parentElement);
          const cr = card.getBoundingClientRect();
          const overflowChip = chips.some(c => {
            const r = c.getBoundingClientRect();
            return r.right > cr.right + 1 || r.left < cr.left - 1;
          });
          return {
            ok: !overflowChip,
            vw: window.innerWidth,
            cardW: Math.round(cr.width),
            chipWidths: chips.map(c => Math.round(c.getBoundingClientRect().width)),
            chipH: chips.map(c => Math.round(c.getBoundingClientRect().height)),
            badge: (() => {
              const b = document.querySelector('[data-testid="set-chip-0-0"] .badge');
              const r = b.getBoundingClientRect();
              return {w: Math.round(r.width), h: Math.round(r.height)};
            })(),
          };
        }""")
        print("chip layout 375", layout375)
        check(layout375.get("ok"), "set pills do not overflow the card at 375", str(layout375))
        check(layout375.get("badge", {}).get("w", 0) >= 22, "badge stays large at 375", str(layout375.get("badge")))
        page.screenshot(path=str(SHOTS / "set-pills-375.png"), full_page=False)

        browser.close()
    httpd.shutdown()
    print("fails:", fails)
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
