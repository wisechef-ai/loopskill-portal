#!/usr/bin/env python3
"""assert-no-mobile-overflow.py — no route may scroll sideways on a phone.

Horizontal overflow is the most common "it looks unfinished" tell and the one
nothing else catches: the build succeeds, the page returns 200, the desktop
screenshot is perfect, and only someone holding a phone sees the right edge of
every paragraph cut off.

Six routes were overflowing when this was written, between 9px and 258px, from
four different causes — a flex item with the default min-width:auto that stopped
a <pre> from scrolling, a markdown table with no shrinkable width, an unbreakable
API path in an <h3>, and a search input that would not shrink. All four are the
kind of thing that comes straight back on the next page someone writes.

Runs against a served dist/ rather than the HTML, because this is a layout
property: it does not exist until a browser lays the page out.

Usage:
  python3 scripts/audit/serve-dist.py dist 8787 &
  python3 scripts/audit/assert-no-mobile-overflow.py [base_url] [dist_dir]

Exit 0 = every route fits. Exit 1 = at least one route scrolls sideways.
"""

import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787").rstrip("/")
DIST = sys.argv[2] if len(sys.argv) > 2 else "dist"
VIEWPORT = {"width": 390, "height": 844}   # iPhone 14 logical size


def routes():
    out=[]
    for p in sorted(Path(DIST).rglob('*.html')):
        rel=p.relative_to(DIST).as_posix()
        if rel.endswith('index.html'):
            parent=p.relative_to(DIST).parent.as_posix()
            out.append('/' if parent=='.' else '/'+parent+'/')
        else:
            out.append('/'+rel[:-5])
    return sorted(set(out))

async def main():
    rs=routes(); bad=[]
    async with async_playwright() as pw:
        b=await pw.chromium.launch()
        ctx=await b.new_context(viewport=VIEWPORT)
        pg=await ctx.new_page()
        for r in rs:
            try:
                await pg.goto(BASE+r, wait_until="load", timeout=25000)
                await pg.wait_for_timeout(400)
                m=await pg.evaluate("()=>document.documentElement.scrollWidth-window.innerWidth")
                if m>2: bad.append((r,m))
            except Exception as e:
                bad.append((r,f"ERR {type(e).__name__}"))
        await b.close()
    print(f"assert-no-mobile-overflow: checked {len(rs)} routes at {VIEWPORT['width']}px")
    if bad:
        for r,m in bad:
            print(f"  OVERFLOW {r} = {m}")
        print("\nA page that scrolls sideways on a phone is a defect, not a nit.")
        print("Usual causes: a flex item missing min-w-0, a table with no")
        print("max-width, or an unbreakable token in a heading or inline code.")
        return 1
    print("  no horizontal overflow on any route")
    return 0


sys.exit(asyncio.run(main()))
