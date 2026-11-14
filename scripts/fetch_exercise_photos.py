#!/usr/bin/env python3
"""Download freely licensed exercise photos/video stills, compress, and write photos.js.

Sources used (NOT yuhonas/free-exercise-db — those images were scraped and
are not freely licensed):
  * wger.de videos by Goulart, CC BY-SA 4.0
  * Wikimedia Commons start/end composites by George Stepanek, CC BY-SA 3.0
  * Additional Commons photos as listed in ATTRIBUTION.md
"""
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace/fitness-app")
OUT = ROOT / "img" / "exercises"
TMP = Path("/tmp/vela-media")
VID = TMP / "videos"
STILL = TMP / "stills"
FRAMES = TMP / "frames"
UA = {"User-Agent": "VELA-fitness/1.0 (workout PWA; attribution in-app)"}

WGER = "https://wger.de/media/exercise-video"
GOULART = {
    "author": "Goulart",
    "source": "wger.de",
    "source_url": "https://wger.de/",
    "license": "CC BY-SA 4.0",
    "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
}
STEPANEK = {
    "author": "George Stepanek",
    "source": "Wikimedia Commons",
    "source_url": "https://commons.wikimedia.org/",
    "license": "CC BY-SA 3.0",
    "license_url": "https://creativecommons.org/licenses/by-sa/3.0/",
}

# Prefer exact Goulart videos (real start/end stills). 1920p when available.
VIDEOS = {
    "barbell-bench-press": {
        "url": f"{WGER}/73/cfb72002-898f-443a-a124-a0bce8a2e6ad.MP4",
        "wger_name": "Bench Press",
        "match": "exact",
        **GOULART,
    },
    "incline-dumbbell-press": {
        "url": f"{WGER}/537/b9c937e9-daeb-42a9-be8e-7a77e368478c.MOV",
        "wger_name": "Incline Bench Press - Dumbbell",
        "match": "exact",
        **GOULART,
    },
    "incline-barbell-press": {
        "url": f"{WGER}/538/4349a6f6-4cee-4c09-828b-c5e7fc2c1ff1.MOV",
        "wger_name": "Incline Bench Press",
        "match": "exact",
        **GOULART,
    },
    "chest-dip": {
        "url": f"{WGER}/194/d039ec90-474d-47a9-a3ad-bf0b00828c82.MP4",
        "wger_name": "Dips",
        "match": "exact",
        **GOULART,
    },
    "decline-bench-press": {
        "url": f"{WGER}/73/cfb72002-898f-443a-a124-a0bce8a2e6ad.MP4",
        "wger_name": "Bench Press",
        "match": "closest",
        "note": "Flat bench press video used; no freely licensed decline-bench demo was found.",
        **GOULART,
    },
    "machine-chest-press": {
        "url": f"{WGER}/73/cfb72002-898f-443a-a124-a0bce8a2e6ad.MP4",
        "wger_name": "Bench Press",
        "match": "closest",
        "note": "Barbell bench press video used; no clear machine-chest-press demo was found.",
        **GOULART,
    },
    "close-grip-bench-press": {
        "url": f"{WGER}/73/cfb72002-898f-443a-a124-a0bce8a2e6ad.MP4",
        "wger_name": "Bench Press",
        "match": "closest",
        "note": "Standard bench press video used; grip width may not be close-grip.",
        **GOULART,
    },
    "incline-machine-press": {
        "url": f"{WGER}/537/b9c937e9-daeb-42a9-be8e-7a77e368478c.MOV",
        "wger_name": "Incline Bench Press - Dumbbell",
        "match": "closest",
        "note": "Incline dumbbell press video used; equipment is dumbbells, not a machine.",
        **GOULART,
    },
    "seated-leg-curl": {
        "url": f"{WGER}/366/43df4b79-d4c3-4fbf-bcb5-e0d825b84120.MOV",
        "wger_name": "Leg Curls (sitting)",
        "match": "exact",
        **GOULART,
    },
    "standing-leg-curl": {
        "url": f"{WGER}/367/e8113ae4-a0b4-42a2-8eaa-3263de64622e.MOV",
        "wger_name": "Leg Curls (standing)",
        "match": "exact",
        **GOULART,
    },
    "leg-press-machine": {
        "url": f"{WGER}/371/6aae16b4-01b9-4eb4-935c-3250f84d2c59.MOV",
        "wger_name": "Leg Press",
        "match": "exact",
        **GOULART,
    },
    "romanian-deadlift": {
        "url": f"{WGER}/507/6b6054b5-9236-4a63-8392-6ea7a9010ca6.MOV",
        "wger_name": "Romanian Deadlift",
        "match": "exact",
        **GOULART,
    },
    "smith-machine-squat": {
        "url": f"{WGER}/341/0cbfeace-dda9-4166-8424-f51358e88a4f.MOV",
        "wger_name": "Squats on Multipress",
        "match": "exact",
        **GOULART,
    },
    "walking-lunge": {
        "url": f"{WGER}/206/47a65c45-6fd1-4181-b71a-3a6c882e516b.MOV",
        "wger_name": "Dumbbell Lunges Walking",
        "match": "exact",
        **GOULART,
    },
    "bulgarian-split-squat": {
        "url": f"{WGER}/205/c167ac34-ddbc-4e1b-8edf-1192e9d00e22.MOV",
        "wger_name": "Dumbbell Lunges Standing",
        "match": "closest",
        "note": "Standing dumbbell lunge video used; not a rear-foot-elevated split squat.",
        **GOULART,
    },
    "hip-thrust": {
        "url": f"{WGER}/294/45bacf4b-1bb6-4d47-8bd1-9f00eddd4019.MOV",
        "wger_name": "Hip Thrust",
        "match": "exact",
        **GOULART,
    },
    "glute-bridge": {
        "url": f"{WGER}/294/45bacf4b-1bb6-4d47-8bd1-9f00eddd4019.MOV",
        "wger_name": "Hip Thrust",
        "match": "closest",
        "note": "Hip thrust video used (bench-supported); not a floor glute bridge.",
        **GOULART,
    },
    "standing-calf-raise": {
        "url": f"{WGER}/622/35b7b625-77fd-4c09-8c57-3ad0f2f23175.MOV",
        "wger_name": "Standing Calf Raises",
        "match": "exact",
        **GOULART,
    },
    "seated-calf-raise": {
        "url": f"{WGER}/590/a325ae2e-686b-4a1f-aff2-ba37fa3fa157.MOV",
        "wger_name": "Sitting Calf Raises",
        "match": "exact",
        **GOULART,
    },
    "pull-up": {
        "url": f"{WGER}/475/83067ffe-ccb9-4e22-8507-5131b211ce74.MOV",
        "wger_name": "Pull-ups",
        "match": "exact",
        **GOULART,
    },
    "seated-cable-row": {
        "url": f"{WGER}/512/fff4c294-93f0-4926-b3a2-bf59ad4afaa5.MOV",
        "wger_name": "Rowing seated, narrow grip",
        "match": "exact",
        **GOULART,
    },
    "face-pull": {
        "url": f"{WGER}/222/245a824b-cd39-45f2-b251-2c0b7efead0d.MOV",
        "wger_name": "Facepull",
        "match": "exact",
        **GOULART,
    },
    "seated-dumbbell-shoulder-press": {
        "url": f"{WGER}/567/64f33c19-1d96-4b7c-af17-6c6a4941c614.MOV",
        "wger_name": "Shoulder Press, Dumbbells",
        "match": "exact",
        **GOULART,
    },
    "machine-shoulder-press": {
        "url": f"{WGER}/543/dbfd396b-1aab-4a64-a50b-2c31ff0a2cf7.MOV",
        "wger_name": "Shoulder Press, on Machine",
        "match": "exact",
        **GOULART,
    },
    "lateral-raise": {
        "url": f"{WGER}/348/de69928a-8a35-4096-821c-1f46de5e0e03.MOV",
        "wger_name": "Lateral Raises",
        "match": "exact",
        **GOULART,
    },
    "cable-lateral-raise": {
        "url": f"{WGER}/348/de69928a-8a35-4096-821c-1f46de5e0e03.MOV",
        "wger_name": "Lateral Raises",
        "match": "closest",
        "note": "Dumbbell lateral raise video used; not a cable raise.",
        **GOULART,
    },
    "rear-delt-fly": {
        "url": f"{WGER}/82/7cfe6d04-5e59-4d0b-937b-b8f4ee10602d.MOV",
        "wger_name": "Bent-over Lateral Raises",
        "match": "exact",
        **GOULART,
    },
    "dumbbell-curl": {
        "url": f"{WGER}/92/8bfb917c-3d0d-49b9-8073-5d7e01c1b894.MOV",
        "wger_name": "Biceps Curls With Dumbbell",
        "match": "exact",
        **GOULART,
    },
    "incline-dumbbell-curl": {
        "url": f"{WGER}/92/8bfb917c-3d0d-49b9-8073-5d7e01c1b894.MOV",
        "wger_name": "Biceps Curls With Dumbbell",
        "match": "closest",
        "note": "Seated/standing dumbbell curl video used; not an incline-bench curl.",
        **GOULART,
    },
    "hammer-curl": {
        "url": f"{WGER}/272/df069052-2173-4f24-855f-a0eebe729f24.MOV",
        "wger_name": "Hammer Curls",
        "match": "exact",
        **GOULART,
    },
    "ez-bar-curl": {
        "url": f"{WGER}/91/483f4bff-e108-41f1-8e7b-0caf24952552.MOV",
        "wger_name": "Biceps Curls With Barbell",
        "match": "closest",
        "note": "Straight barbell curl video used; not an EZ-bar.",
        **GOULART,
    },
    "tricep-rope-pushdown": {
        "url": f"{WGER}/659/be0b1bec-7d82-4a1d-85d6-84efa633ef3c.MOV",
        "wger_name": "Triceps Extensions on Cable",
        "match": "closest",
        "note": "Cable triceps extension video used; attachment may be a bar rather than a rope.",
        **GOULART,
    },
    "skull-crusher": {
        "url": f"{WGER}/246/75eb8c88-922e-45c5-8be3-ac073f62b63f.MP4",
        "wger_name": "Skullcrusher SZ-bar",
        "match": "exact",
        **GOULART,
    },
    "overhead-tricep-extension": {
        "url": f"{WGER}/211/85f6eb25-a76c-409e-9af9-497794ac0dfb.MOV",
        "wger_name": "Dumbbell Triceps Extension",
        "match": "exact",
        **GOULART,
    },
    "overhead-rope-extension": {
        "url": f"{WGER}/211/85f6eb25-a76c-409e-9af9-497794ac0dfb.MOV",
        "wger_name": "Dumbbell Triceps Extension",
        "match": "closest",
        "note": "Dumbbell overhead triceps extension used; not a rope-cable variation.",
        **GOULART,
    },
}

COMMONS_COMPOSITES = {
    "leg-extension": {
        "file": "LegExtensionMachineExercise.JPG",
        "match": "exact",
        **STEPANEK,
    },
    "lat-pulldown": {
        "file": "PulldownMachineExercise.JPG",
        "match": "exact",
        **STEPANEK,
    },
    "straight-arm-pulldown": {
        "file": "PulldownMachineExercise.JPG",
        "match": "closest",
        "note": "Standard lat pulldown photos used; arms are not kept straight.",
        **STEPANEK,
    },
    "single-arm-dumbbell-row": {
        "file": "DumbbellBentOverRow.JPG",
        "match": "exact",
        **STEPANEK,
    },
    "chest-supported-row": {
        "file": "DumbbellBentOverRow.JPG",
        "match": "closest",
        "note": "One-arm dumbbell row on a bench used; not a chest-supported machine/pad row.",
        **STEPANEK,
    },
    "t-bar-row": {
        "file": "DumbbellBentOverRow.JPG",
        "match": "closest",
        "note": "One-arm dumbbell row used; not a T-bar row.",
        **STEPANEK,
    },
    "back-extension": {
        "file": "RomanChairBackExtension.JPG",
        "match": "exact",
        **STEPANEK,
    },
    "reverse-hyper": {
        "file": "RomanChairBackExtension.JPG",
        "match": "closest",
        "note": "Roman-chair back extension used; not a reverse hyper (legs move, torso fixed).",
        **STEPANEK,
    },
}

# Single-still Commons photos (no start/end pair).
COMMONS_STILLS = {
    "pec-deck": {
        "file": "Girl doing chest press machine exercise.jpg",
        "author": "Tyler Read",
        "source": "Wikimedia Commons",
        "source_url": "https://commons.wikimedia.org/wiki/File:Girl_doing_chest_press_machine_exercise.jpg",
        "license": "CC BY 2.0",
        "license_url": "https://creativecommons.org/licenses/by/2.0/",
        "match": "exact",
        "note": "Single still of a pec-deck / machine fly (the file is mis-titled as a chest press).",
    },
    "cable-fly": {
        "file": "Chest flies with cable machine - cable crossover flies.jpg",
        "author": "Nenad Stojkovic",
        "source": "Wikimedia Commons",
        "source_url": "https://commons.wikimedia.org/wiki/File:Chest_flies_with_cable_machine_-_cable_crossover_flies.jpg",
        "license": "CC BY 2.0",
        "license_url": "https://creativecommons.org/licenses/by/2.0/",
        "match": "exact",
        "note": "Single mid-rep still; no start/end pair.",
    },
    "overhead-cable-crossover": {
        "file": "Chest flies with cable machine - cable crossover flies.jpg",
        "author": "Nenad Stojkovic",
        "source": "Wikimedia Commons",
        "source_url": "https://commons.wikimedia.org/wiki/File:Chest_flies_with_cable_machine_-_cable_crossover_flies.jpg",
        "license": "CC BY 2.0",
        "license_url": "https://creativecommons.org/licenses/by/2.0/",
        "match": "closest",
        "note": "Mid-rep cable fly / crossover still used; not specifically a high-to-low crossover.",
    },
    "low-cable-fly": {
        "file": "Chest flies with cable machine - cable crossover flies.jpg",
        "author": "Nenad Stojkovic",
        "source": "Wikimedia Commons",
        "source_url": "https://commons.wikimedia.org/wiki/File:Chest_flies_with_cable_machine_-_cable_crossover_flies.jpg",
        "license": "CC BY 2.0",
        "license_url": "https://creativecommons.org/licenses/by/2.0/",
        "match": "closest",
        "note": "Mid-rep cable fly still used; not specifically a low-cable fly.",
    },
    "push-up": {
        "file": "Girl doing push-ups from the side.jpg",
        "author": "PTPioneer",
        "source": "Wikimedia Commons",
        "source_url": "https://commons.wikimedia.org/wiki/File:Girl_doing_push-ups_from_the_side.jpg",
        "license": "CC BY 2.0",
        "license_url": "https://creativecommons.org/licenses/by/2.0/",
        "match": "exact",
        "note": "Single still, outdoor, using push-up handles.",
    },
    "diamond-push-up": {
        "file": "Girl doing push-ups from the side.jpg",
        "author": "PTPioneer",
        "source": "Wikimedia Commons",
        "source_url": "https://commons.wikimedia.org/wiki/File:Girl_doing_push-ups_from_the_side.jpg",
        "license": "CC BY 2.0",
        "license_url": "https://creativecommons.org/licenses/by/2.0/",
        "match": "closest",
        "note": "Standard push-up still used; hand position is not a diamond/close grip.",
    },
}

# No good freely licensed real-photo match:
#   dumbbell-pullover
NO_MATCH = ["dumbbell-pullover"]


def slug_name(name: str) -> str:
    import re
    s = (name or "").lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "exercise"


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print("  cached", dest.name, dest.stat().st_size)
        return dest
    print("  get", url)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    print("  saved", dest, dest.stat().st_size)
    return dest


def commons_file(filename: str) -> Path:
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(filename)
    ext = filename.rsplit(".", 1)[-1].lower()
    return download(url, STILL / filename.replace(" ", "_"))


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        text=True,
    ).strip()
    return float(out)


def extract_pair_from_video(video: Path, dest_dir: Path) -> list[Path]:
    dur = probe_duration(video)
    start = max(0.4, dur * 0.18)
    end = max(start + 1.0, dur * 0.82)
    work = FRAMES / video.stem
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    # Sample ~6 fps in the working window, scaled for analysis
    subprocess.check_call(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-ss", f"{start:.2f}", "-to", f"{end:.2f}",
            "-i", str(video),
            "-vf", "fps=6,scale=320:-2",
            str(work / "%04d.png"),
        ]
    )
    frames = sorted(work.glob("*.png"))
    if len(frames) < 2:
        raise SystemExit(f"too few frames in {video}: {len(frames)}")
    arrs = []
    for p in frames:
        im = Image.open(p).convert("L").resize((80, 60))
        arrs.append(list(im.getdata()))

    def dist(a, b):
        return sum((x - y) ** 2 for x, y in zip(a, b))

    best = (-1, 0, 1)
    min_gap = 3  # at least ~0.5s apart at 6fps
    for i in range(len(arrs)):
        for j in range(i + min_gap, len(arrs)):
            d = dist(arrs[i], arrs[j])
            if d > best[0]:
                best = (d, i, j)
    _, i, j = best
    # Re-extract those timestamps at output quality
    times = [start + i / 6.0, start + j / 6.0]
    dest_dir.mkdir(parents=True, exist_ok=True)
    outs = []
    for k, t in enumerate(times):
        raw = dest_dir / f"_raw{k}.png"
        subprocess.check_call(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-ss", f"{t:.3f}", "-i", str(video),
                "-frames:v", "1",
                "-vf", "scale=600:-2",
                "-y", str(raw),
            ]
        )
        outs.append(save_webp(raw, dest_dir / f"{k}.webp"))
        raw.unlink(missing_ok=True)
    print(f"  frames @{times[0]:.2f}s + {times[1]:.2f}s of {dur:.1f}s  ({video.name})")
    return outs


def save_webp(src: Path | Image.Image, dest: Path, width: int = 600) -> Path:
    im = src if isinstance(src, Image.Image) else Image.open(src)
    im = im.convert("RGB")
    w, h = im.size
    if w > width:
        im = im.resize((width, max(1, round(h * width / w))), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=78, method=6)
    return dest


def split_composite(path: Path, dest_dir: Path) -> list[Path]:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    # These Stepanek images are two side-by-side stills.
    gap = max(2, w // 80)
    left = im.crop((0, 0, w // 2 - gap, h))
    right = im.crop((w // 2 + gap, 0, w, h))
    dest_dir.mkdir(parents=True, exist_ok=True)
    a = save_webp(left, dest_dir / "0.webp")
    b = save_webp(right, dest_dir / "1.webp")
    print(f"  split {path.name} -> {a.name}+{b.name} ({left.size}, {right.size})")
    return [a, b]


def copy_still(path: Path, dest_dir: Path) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    a = save_webp(path, dest_dir / "0.webp")
    print(f"  still {path.name} -> {a.name}")
    return [a]


def write_photos_js(entries: dict) -> None:
    text = "window.VELA_PHOTOS = " + json.dumps(entries, indent=2) + ";\n"
    (ROOT / "photos.js").write_text(text)
    print("wrote photos.js", len(entries), "exercises")


def write_attribution(entries: dict) -> None:
    lines = [
        "# Exercise photo attribution",
        "",
        "These images are included so VELA works offline. They are **not** from",
        "`yuhonas/free-exercise-db`: that project's JSON is public domain, but its",
        "photos were scraped from the internet (including Bodybuilding.com / ExRx)",
        "and are **not** freely licensed, so they were not used.",
        "",
        "Cropped or resized copies are shared under the same license as the source.",
        "",
        "| Exercise | Match | Author | License | Source | Notes |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for slug, e in sorted(entries.items()):
        note = (e.get("note") or "").replace("|", "/")
        lines.append(
            f"| {e.get('name', slug)} | {e.get('match')} | {e.get('author')} | "
            f"[{e.get('license')}]({e.get('license_url')}) | {e.get('source')} | {note} |"
        )
    lines += [
        "",
        "## Sources",
        "",
        "- [wger.de](https://wger.de/) exercise videos by Goulart, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)",
        "- [George Stepanek](https://commons.wikimedia.org/wiki/User:GeorgeStepanek) photographs on Wikimedia Commons, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)",
        "- [Tyler Read](https://commons.wikimedia.org/wiki/File:Girl_doing_chest_press_machine_exercise.jpg), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)",
        "- [Nenad Stojkovic](https://commons.wikimedia.org/wiki/File:Chest_flies_with_cable_machine_-_cable_crossover_flies.jpg), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)",
        "- [PTPioneer](https://commons.wikimedia.org/wiki/File:Girl_doing_push-ups_from_the_side.jpg), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)",
        "",
        "No freely licensed real-photo match was found for: **Dumbbell Pullover**.",
        "That exercise keeps the illustrated thumbnail.",
        "",
    ]
    (OUT / "ATTRIBUTION.md").write_text("\n".join(lines))
    print("wrote ATTRIBUTION.md")


# Display names (slug -> name)
NAMES = {
    "barbell-bench-press": "Barbell Bench Press",
    "incline-dumbbell-press": "Incline Dumbbell Press",
    "incline-barbell-press": "Incline Barbell Press",
    "incline-dumbbell-tricep-extension": "Incline Dumbbell Tricep Extension",
    "incline-machine-press": "Incline Machine Press",
    "chest-dip": "Chest Dip",
    "decline-bench-press": "Decline Bench Press",
    "cable-fly": "Cable Fly",
    "pec-deck": "Pec Deck",
    "machine-chest-press": "Machine Chest Press",
    "push-up": "Push-Up",
    "overhead-cable-crossover": "Overhead Cable Crossover",
    "low-cable-fly": "Low Cable Fly",
    "seated-leg-curl": "Seated Leg Curl",
    "standing-leg-curl": "Standing Leg Curl",
    "leg-extension": "Leg Extension",
    "leg-press-machine": "Leg Press Machine",
    "romanian-deadlift": "Romanian Deadlift",
    "smith-machine-squat": "Smith Machine Squat",
    "walking-lunge": "Walking Lunge",
    "bulgarian-split-squat": "Bulgarian Split Squat",
    "hip-thrust": "Hip Thrust",
    "glute-bridge": "Glute Bridge",
    "standing-calf-raise": "Standing Calf Raise",
    "seated-calf-raise": "Seated Calf Raise",
    "lat-pulldown": "Lat Pulldown",
    "pull-up": "Pull-Up",
    "seated-cable-row": "Seated Cable Row",
    "chest-supported-row": "Chest-Supported Row",
    "single-arm-dumbbell-row": "Single-Arm Dumbbell Row",
    "t-bar-row": "T-Bar Row",
    "face-pull": "Face Pull",
    "straight-arm-pulldown": "Straight-Arm Pulldown",
    "dumbbell-pullover": "Dumbbell Pullover",
    "back-extension": "Back Extension",
    "reverse-hyper": "Reverse Hyper",
    "seated-dumbbell-shoulder-press": "Seated Dumbbell Shoulder Press",
    "machine-shoulder-press": "Machine Shoulder Press",
    "lateral-raise": "Lateral Raise",
    "cable-lateral-raise": "Cable Lateral Raise",
    "rear-delt-fly": "Rear Delt Fly",
    "ez-bar-curl": "EZ-Bar Curl",
    "dumbbell-curl": "Dumbbell Curl",
    "hammer-curl": "Hammer Curl",
    "incline-dumbbell-curl": "Incline Dumbbell Curl",
    "tricep-rope-pushdown": "Tricep Rope Pushdown",
    "overhead-rope-extension": "Overhead Rope Extension",
    "skull-crusher": "Skull Crusher",
    "close-grip-bench-press": "Close-Grip Bench Press",
    "overhead-tricep-extension": "Overhead Tricep Extension",
    "diamond-push-up": "Diamond Push-Up",
}


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    VID.mkdir(parents=True, exist_ok=True)
    STILL.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    entries = {}

    # Shared video cache by URL
    url_to_path = {}
    unique_urls = {}
    for slug, meta in VIDEOS.items():
        unique_urls.setdefault(meta["url"], slug)
    for url, first in unique_urls.items():
        ext = Path(url).suffix or ".mp4"
        path = download(url, VID / f"{first}{ext}")
        url_to_path[url] = path

    # Extract once per unique URL, then copy into each slug folder
    url_frames = {}
    for url, path in url_to_path.items():
        work = TMP / "extract" / Path(path).stem
        if work.exists():
            shutil.rmtree(work)
        work.mkdir(parents=True)
        url_frames[url] = extract_pair_from_video(path, work)

    for slug, meta in VIDEOS.items():
        dest = OUT / slug
        dest.mkdir(parents=True, exist_ok=True)
        srcs = url_frames[meta["url"]]
        frames = []
        for i, src in enumerate(srcs):
            target = dest / f"{i}.webp"
            shutil.copyfile(src, target)
            frames.append(f"img/exercises/{slug}/{i}.webp")
        entries[slug] = {
            "name": NAMES.get(slug, slug),
            "frames": frames,
            "match": meta["match"],
            "author": meta["author"],
            "source": meta["source"],
            "source_url": meta.get("source_url"),
            "license": meta["license"],
            "license_url": meta["license_url"],
            "note": meta.get("note") or "",
        }
        print("video", slug, meta["match"])

    # Commons composites
    file_to_path = {}
    for slug, meta in COMMONS_COMPOSITES.items():
        if meta["file"] not in file_to_path:
            file_to_path[meta["file"]] = commons_file(meta["file"])
        dest = OUT / slug
        if dest.exists():
            shutil.rmtree(dest)
        split_composite(file_to_path[meta["file"]], dest)
        entries[slug] = {
            "name": NAMES.get(slug, slug),
            "frames": [f"img/exercises/{slug}/0.webp", f"img/exercises/{slug}/1.webp"],
            "match": meta["match"],
            "author": meta["author"],
            "source": meta["source"],
            "source_url": meta.get("source_url") or f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(meta['file'])}",
            "license": meta["license"],
            "license_url": meta["license_url"],
            "note": meta.get("note") or "",
        }
        print("composite", slug, meta["match"])

    # Single stills
    still_paths = {}
    for slug, meta in COMMONS_STILLS.items():
        if meta["file"] not in still_paths:
            still_paths[meta["file"]] = commons_file(meta["file"])
        dest = OUT / slug
        if dest.exists():
            shutil.rmtree(dest)
        copy_still(still_paths[meta["file"]], dest)
        entries[slug] = {
            "name": NAMES.get(slug, slug),
            "frames": [f"img/exercises/{slug}/0.webp"],
            "match": meta["match"],
            "author": meta["author"],
            "source": meta["source"],
            "source_url": meta.get("source_url"),
            "license": meta["license"],
            "license_url": meta["license_url"],
            "note": meta.get("note") or "",
        }
        print("still", slug, meta["match"])

    write_photos_js(entries)
    write_attribution(entries)
    # contact sheet for QA
    make_contact_sheet(entries)
    print("DONE", len(entries), "photos;", "no match:", NO_MATCH)


def make_contact_sheet(entries: dict) -> None:
    tiles = []
    labels = []
    for slug, e in entries.items():
        for fr in e["frames"]:
            p = ROOT / fr
            im = Image.open(p).convert("RGB")
            im.thumbnail((200, 150))
            canvas = Image.new("RGB", (200, 150), (7, 17, 31))
            canvas.paste(im, ((200 - im.size[0]) // 2, (150 - im.size[1]) // 2))
            tiles.append(canvas)
            labels.append(f"{slug} {Path(fr).stem} [{e['match']}]")
    if not tiles:
        return
    cols = 4
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new("RGB", (cols * 200, rows * 166), (7, 17, 31))
    from PIL import ImageDraw, ImageFont
    draw = ImageDraw.Draw(sheet)
    for i, (tile, lab) in enumerate(zip(tiles, labels)):
        r, c = divmod(i, cols)
        sheet.paste(tile, (c * 200, r * 166))
        draw.text((c * 200 + 4, r * 166 + 150), lab[:40], fill=(160, 200, 200))
    dest = Path("/tmp/vela-contact.jpg")
    sheet.save(dest, quality=85)
    print("contact sheet", dest, sheet.size)


if __name__ == "__main__":
    main()
