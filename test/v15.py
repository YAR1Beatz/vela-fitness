"""VELA v15: Max-OT matches the AST source; Flat Barbell Bench Press rename + aliases."""
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
fails = []

# Expected Max-OT working-set lists, in order, from
# https://ast-ss.com/mass-provisions-training-schedule/ (fetched 2026-11-14).
# Display names use the app’s singular style.
EXPECTED = [
    ("maxot-shoulders", "Shoulders & Traps", "Monday", [
        ("Standing Barbell Shoulder Press", 3, "4-6"),
        ("Seated Dumbbell Press", 2, "4-6"),
        ("Side Lateral Dumbbell Raise", 2, "4-6"),
        ("Rear Lateral Dumbbell Raise", 2, "4-6"),
        ("Barbell Shrug", 3, "4-6"),
    ]),
    ("maxot-legs", "Calves & Legs", "Tuesday", [
        ("Calf Raises on Leg Press", 3, "6-8"),
        ("Seated Calf Raise", 2, "6-8"),
        ("Barbell Back Squat", 3, "4-6"),
        ("Front Squat", 2, "4-6"),
        ("Stiff-Leg Deadlift", 2, "4-6"),
    ]),
    ("maxot-back", "Abs & Back", "Wednesday", [
        ("Swiss Ball Leg Raise", 2, "15-20"),
        ("Cable Crunch", 3, "8-12"),
        ("Swiss Ball Crunch", 2, "15-20"),
        ("Cable Row", 2, "4-6"),
        ("Lat Pulldown", 2, "4-6"),
        ("Row Machine", 2, "4-6"),
        ("Pull-Up", 2, "to positive failure"),
    ]),
    ("maxot-chest", "Chest & Triceps", "Thursday", [
        ("Incline Bench Press", 3, "4-6"),
        ("Flat Barbell Bench Press", 3, "4-6"),
        ("Weighted Dip", 1, "4-6"),
        ("Incline Dumbbell Tricep Extension", 2, "4-6"),
        ("Lying Tricep Extension", 1, "4-6"),
        ("Cable Pushdown", 1, "4-6"),
    ]),
    ("maxot-arms", "Biceps & Forearms", "Friday", [
        ("Barbell Curl", 2, "4-6"),
        ("Dumbbell Alternate Curl", 2, "4-6"),
        ("Hammer Curl", 2, "4-6"),
        ("Barbell Wrist Curl", 2, "6-8"),
        ("Standing Dumbbell Wrist Curl", 2, "6-8"),
    ]),
]


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


INSETS = ":root { --safe-top: 62px !important; --safe-bottom: 34px !important; }"


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
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        if page.locator('[data-testid="days-setup"]').count():
            page.locator('[data-testid="days-option-4"]').tap()
            page.wait_for_selector('[data-testid="days-setup"]', state="detached")
        page.wait_for_selector('[data-testid="week-plan"]')

        # Seed a pre-v15 install: old Max-OT names + old bench/skull keys.
        pre = page.evaluate(
            """() => {
          const D = window.VELA_DATA;
          D.switchProgram("max-ot");
          const s = D.get();
          s.version = 6;
          s.history = s.history || {};
          s.history["barbell-bench-press"] = [{
            date: "2026-11-07", datetime: "2026-11-07T18:00:00.000Z",
            workout: "Chest & Triceps", workoutId: "maxot-chest", week: 1,
            programId: "max-ot", sessionId: "ses-bench-old",
            sets: [{reps:6,weight:60}]
          }];
          s.history["skull-crusher"] = [{
            date: "2026-11-07", datetime: "2026-11-07T18:00:00.000Z",
            workout: "Chest & Triceps", workoutId: "maxot-chest", week: 1,
            programId: "max-ot", sessionId: "ses-skull-old",
            sets: [{reps:6,weight:25}]
          }];
          delete s.history["flat-barbell-bench-press"];
          delete s.history["lying-tricep-extension"];
          const w = (s.workouts || []).find((wo) => wo.id === "maxot-chest");
          if (w) {
            (w.exercises || []).forEach((ex) => {
              if (ex.name === "Lying Tricep Extension") {
                ex.name = "Skull Crusher";
                ex.key = "skull-crusher";
              }
              if (ex.name === "Flat Barbell Bench Press") {
                ex.name = "Barbell Bench Press";
                ex.key = "barbell-bench-press";
              }
            });
          }
          D.saveNow();
          return { version: s.version, names: (w && w.exercises || []).map((e) => e.name) };
        }"""
        )
        print("seed", pre)
        page.reload(wait_until="networkidle")
        page.add_style_tag(content=INSETS)
        page.wait_for_selector('[data-testid="week-plan"]')

        info = page.evaluate(
            """() => {
          const D = window.VELA_DATA;
          const C = window.VELA_CATALOG;
          const s = D.get();
          const programs = window.VELA_PROGRAMS;
          const maxot = programs["max-ot"];
          const days = (maxot.workouts || []).map((w) => ({
            id: w.id, name: w.name, dayLabel: w.dayLabel,
            exercises: (w.exercises || []).map((ex) => ({
              name: ex.name, sets: ex.sets, repsRange: ex.repsRange, reps: ex.reps,
            })),
          }));
          const chest = (s.workouts || []).find((w) => w.id === "maxot-chest");
          const bro = (s.programs && s.programs["bro-split-4"] && s.programs["bro-split-4"].workouts)
            || (s.programs && s.programs["bro-split"] && s.programs["bro-split"].workouts)
            || [];
          const broNames = bro.flatMap((w) => (w.exercises || []).map((e) => e.name));
          // If bro slot not built yet, read template
          const broTpl = (programs["bro-split"].workouts || []).flatMap((w) => (w.exercises || []).map((e) => e.name));
          return {
            version: s.version,
            rest: s.restSeconds,
            cycle: maxot.cycleWeeks,
            recovery: !!maxot.recoveryWeek,
            days,
            histKeys: Object.keys(s.history || {}),
            benchHist: (D.getHistory("flat-barbell-bench-press") || []).length,
            benchOld: (D.getHistory("barbell-bench-press") || []).length,
            lyingHist: (D.getHistory("lying-tricep-extension") || []).length,
            skullHist: (D.getHistory("skull-crusher") || []).length,
            chestNames: (chest && chest.exercises || []).map((e) => ({name: e.name, key: e.key})),
            broNames: broNames.length ? broNames : broTpl,
            canonBench: C.canonicalKey("Barbell Bench Press"),
            canonSkull: C.canonicalKey("Skull Crusher"),
            photoFlat: !!(C.photoFor("Flat Barbell Bench Press") && C.photoFor("Flat Barbell Bench Press").frames.length),
            photoOldBench: !!(C.photoFor("Barbell Bench Press") && C.photoFor("Barbell Bench Press").frames.length),
            photoLying: !!(C.photoFor("Lying Tricep Extension") && C.photoFor("Lying Tricep Extension").frames.length),
            photoIncline: !!(C.photoFor("Incline Bench Press") && C.photoFor("Incline Bench Press").frames.length),
          };
        }"""
        )
        print("info", json.dumps({k: info[k] for k in info if k != "days"}, indent=2))

        check(info["version"] >= 7, "migrated to state version 7", str(info["version"]))
        check(info["rest"] == 180, "Max-OT rest is 3 minutes", str(info["rest"]))
        check(info["cycle"] == 8 and info["recovery"], "8-week cycle + recovery week")
        check(info["canonBench"] == "flat-barbell-bench-press", "bench canonical key")
        check(info["canonSkull"] == "lying-tricep-extension", "skull-crusher aliases to lying tricep extension")
        check(info["benchHist"] >= 1 and info["benchOld"] >= 1, "bench history follows the alias", f"{info['benchHist']}/{info['benchOld']}")
        check(info["lyingHist"] >= 1 and info["skullHist"] >= 1, "skull-crusher history follows into lying tricep extension", f"{info['lyingHist']}/{info['skullHist']}")
        check("barbell-bench-press" not in info["histKeys"], "old bench key removed after migrate", str(info["histKeys"]))
        check("skull-crusher" not in info["histKeys"], "old skull-crusher key removed after migrate", str(info["histKeys"]))
        check(any(e["name"] == "Lying Tricep Extension" for e in info["chestNames"]), "stored Max-OT workout renamed off Skull Crusher", str(info["chestNames"]))
        check(any(e["name"] == "Flat Barbell Bench Press" for e in info["chestNames"]), "stored Max-OT workout uses Flat Barbell Bench Press", str(info["chestNames"]))
        check("Skull Crusher" not in [e["name"] for e in info["chestNames"]], "Skull Crusher is gone from Max-OT chest")
        check("Skull Crusher" in info["broNames"], "Bro Split still lists Skull Crusher")
        check("Flat Barbell Bench Press" in info["broNames"], "Bro Split uses Flat Barbell Bench Press")
        check("Barbell Bench Press" not in info["broNames"], "old bench name is gone from Bro Split")
        check(info["photoFlat"] and info["photoOldBench"], "flat / old bench names both resolve photos")
        check(info["photoLying"] and info["photoIncline"], "lying tricep + incline bench photos resolve")

        # Exact template audit
        days = {d["id"]: d for d in info["days"]}
        check(len(info["days"]) == 5, "Max-OT has 5 training days")
        for wid, name, label, exercises in EXPECTED:
            d = days.get(wid)
            check(bool(d), f"has workout {wid}")
            if not d:
                continue
            check(d["name"] == name, f"{wid} name is {name}", d["name"])
            check(d["dayLabel"] == label, f"{wid} is {label}", d["dayLabel"])
            got = [(e["name"], e["sets"], e["repsRange"]) for e in d["exercises"]]
            want = list(exercises)
            check(got == want, f"{wid} exercises/sets/reps match AST", json.dumps(got, indent=2))
            names = [e["name"] for e in d["exercises"]]
            check("Skull Crusher" not in names, f"{wid} does not include Skull Crusher")

        # UI: open Thursday, confirm names
        page.wait_for_selector('[data-testid="workout-tile-maxot-chest"]')
        page.locator('[data-testid="workout-tile-maxot-chest"]').tap()
        page.wait_for_selector('[data-testid="set-chip-0-0"]')
        body = page.inner_text("#content")
        check("Incline Bench Press" in body, "UI shows Incline Bench Press")
        check("Flat Barbell Bench Press" in body, "UI shows Flat Barbell Bench Press")
        check("Lying Tricep Extension" in body, "UI shows Lying Tricep Extension")
        check("Cable Pushdown" in body, "UI shows Cable Pushdown")
        check("Skull Crusher" not in body, "UI does not show Skull Crusher on Max-OT Thursday")
        check("Weighted Dip" in body, "UI shows Weighted Dip")
        page.screenshot(path="/workspace/design-ideas/gym-app/live-v15/maxot-chest.png", full_page=False)

        browser.close()
    httpd.shutdown()
    print("fails:", fails)
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    Path("/workspace/design-ideas/gym-app/live-v15").mkdir(parents=True, exist_ok=True)
    main()
