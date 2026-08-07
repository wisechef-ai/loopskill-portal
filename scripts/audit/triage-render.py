#!/usr/bin/env python3
"""triage-render.py — turn 300 screenshots into a list of things to look at.

Two jobs:

1. **Crop the fold.** A full-page capture of /browse on mobile is 34,000px
   tall. Nobody inspects that, and an image scaled to fit is a grey smear —
   so "I looked at every route" quietly becomes false. This writes a
   `fold/` set cropped to one viewport height, which is what a visitor
   actually sees first and what can honestly be reviewed one by one.

2. **Rank by suspicion.** The JSON record carries the signals a human
   scrolling images will miss — console errors, failed requests, horizontal
   overflow, a page with almost no text. This prints them worst-first so the
   looking starts where it matters instead of alphabetically.

Usage: python3 scripts/audit/triage-render.py <render_dir>
"""

import json
import sys
from pathlib import Path

from PIL import Image

FOLD = {"desktop": 900, "mobile": 844}
# Below this, a page rendered almost nothing. The smallest legitimate page in
# this build is the signin gate; anything much under it failed to hydrate.
THIN_TEXT = 400


def crop_folds(render_dir: Path) -> int:
    n = 0
    for vp, height in FOLD.items():
        src_dir = render_dir / vp
        if not src_dir.is_dir():
            continue
        out_dir = render_dir / "fold" / vp
        out_dir.mkdir(parents=True, exist_ok=True)
        for png in sorted(src_dir.glob("*.png")):
            with Image.open(png) as im:
                im.crop((0, 0, im.width, min(height, im.height))).save(out_dir / png.name)
            n += 1
    return n


def score(rec: dict) -> int:
    """Higher = look at this one first."""
    s = 0
    if rec.get("error"):
        s += 100
    s += 40 * len(rec.get("console_errors") or [])
    s += 25 * len(rec.get("failed_requests") or [])
    s += 20 * len(rec.get("broken_images") or [])
    if rec.get("h_overflow_px", 0) > 0:
        s += 30 + min(rec["h_overflow_px"], 200)
    s += 5 * min(rec.get("offscreen_count", 0), 20)
    if rec.get("visible_text_len", 1e9) < THIN_TEXT:
        s += 60
    if not rec.get("h1s"):
        s += 15
    elif len(rec["h1s"]) > 1:
        s += 25
    if (rec.get("status") or 200) >= 400:
        s += 50
    return s


def main() -> int:
    render_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/w3-render")
    report = json.loads((render_dir / "render-report.json").read_text())

    print(f"cropped {crop_folds(render_dir)} fold image(s) → {render_dir}/fold/\n")

    ranked = sorted(report, key=score, reverse=True)
    flagged = [r for r in ranked if score(r) > 0]
    print(f"{len(report)} captures, {len(flagged)} with at least one signal\n")

    for r in flagged:
        bits = []
        if r.get("error"):
            bits.append(f"ERROR {r['error']}")
        if (r.get("status") or 200) >= 400:
            bits.append(f"HTTP {r['status']}")
        if r.get("console_errors"):
            bits.append(f"{len(r['console_errors'])} console err")
        if r.get("failed_requests"):
            bits.append(f"{len(r['failed_requests'])} failed req")
        if r.get("broken_images"):
            bits.append(f"{len(r['broken_images'])} broken img")
        if r.get("h_overflow_px", 0) > 0:
            bits.append(f"h-overflow {r['h_overflow_px']}px")
        if r.get("offscreen_count", 0):
            bits.append(f"{r['offscreen_count']} offscreen")
        if r.get("visible_text_len", 1e9) < THIN_TEXT:
            bits.append(f"thin text ({r['visible_text_len']}c)")
        if not r.get("h1s"):
            bits.append("no h1")
        elif len(r["h1s"]) > 1:
            bits.append(f"{len(r['h1s'])} h1s")
        print(f"[{score(r):4d}] {r['viewport']:8s} {r['route']:<46s} {' · '.join(bits)}")
        for e in (r.get("console_errors") or [])[:2]:
            print(f"            console: {e[:130]}")
        for f in (r.get("failed_requests") or [])[:2]:
            print(f"            request: {f[:130]}")
        for o in (r.get("offscreen_right") or [])[:2]:
            print(f"            offscreen: <{o['tag']} class=\"{o['cls'][:50]}\"> right={o['right']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
