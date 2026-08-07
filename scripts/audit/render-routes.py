#!/usr/bin/env python3
"""render-routes.py — open every emitted route, desktop and mobile, and look.

lock #29: **UI "done" = RENDER every route and LOOK at it.** Not grep, not
HTTP 200. This script does the mechanical half — it drives a real browser over
every route the build emitted, at two viewports, and writes a screenshot plus a
machine-readable observation record for each. A human (or an agent) then reads
the screenshots; the JSON is what stops that reading from being the only check,
because a person scrolling 300 images will not notice a console error.

What it records per route/viewport, and why each one is here:

  console_errors    A page that throws is broken even when it looks fine.
  failed_requests   A 404 asset is the apex-dead-link defect wearing a hat.
  h_overflow        Content wider than the viewport = a horizontal scrollbar on
                    a phone. The single most common "looks unfinished" tell.
  visible_text_len  A route that renders almost no text either failed to
                    hydrate or was never finished.
  offscreen_right   Individual elements poking past the right edge, named, so
                    the fix has an address.
  title / h1        A missing or duplicated <h1> reads as an unfinished page.

Usage:
  python3 scripts/audit/render-routes.py <base_url> <out_dir> [--only substr]
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "mobile": {"width": 390, "height": 844},  # iPhone 14 logical size
}

# Client islands fetch after load; give them a beat before judging emptiness.
SETTLE_MS = 1200


def routes_from_dist(dist: Path) -> list[str]:
    out = []
    for p in sorted(dist.rglob("index.html")):
        rel = p.relative_to(dist).parent.as_posix()
        out.append("/" if rel == "." else f"/{rel}/")
    return out


async def capture(page, base, route, viewport_name, out_dir):
    console_errors: list[str] = []
    failed: list[str] = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
    page.on(
        "requestfailed",
        lambda r: failed.append(f"{r.url} ({r.failure})") if r.failure else None,
    )

    def on_response(r):
        if r.status >= 400:
            failed.append(f"HTTP {r.status} {r.url}")

    page.on("response", on_response)

    url = base.rstrip("/") + route
    rec = {"route": route, "viewport": viewport_name, "url": url}
    try:
        resp = await page.goto(url, wait_until="load", timeout=30000)
        rec["status"] = resp.status if resp else None
    except Exception as e:
        rec["error"] = f"navigation: {e}"
        return rec

    await page.wait_for_timeout(SETTLE_MS)

    try:
        metrics = await page.evaluate(
            """() => {
              const de = document.documentElement;
              const vw = window.innerWidth;
              const over = [];
              for (const el of document.querySelectorAll('body *')) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none') continue;
                if (r.right > vw + 2) {
                  over.push({
                    tag: el.tagName.toLowerCase(),
                    cls: (el.className && el.className.toString().slice(0, 70)) || '',
                    right: Math.round(r.right),
                  });
                }
              }
              const h1s = [...document.querySelectorAll('h1')]
                .filter(h => h.offsetParent !== null)
                .map(h => h.textContent.trim().slice(0, 90));
              const imgs = [...document.querySelectorAll('img')]
                .filter(i => i.complete && i.naturalWidth === 0)
                .map(i => i.getAttribute('src'));
              return {
                scrollW: de.scrollWidth,
                innerW: vw,
                text: (document.body.innerText || '').replace(/\\s+/g, ' ').trim(),
                h1s, imgs,
                offscreen: over.slice(0, 8),
                offscreenCount: over.length,
              };
            }"""
        )
    except Exception as e:
        rec["error"] = f"evaluate: {e}"
        return rec

    rec["title"] = await page.title()
    rec["h1s"] = metrics["h1s"]
    rec["visible_text_len"] = len(metrics["text"])
    rec["text_head"] = metrics["text"][:180]
    rec["h_overflow_px"] = max(0, metrics["scrollW"] - metrics["innerW"])
    rec["offscreen_right"] = metrics["offscreen"]
    rec["offscreen_count"] = metrics["offscreenCount"]
    rec["broken_images"] = metrics["imgs"]
    # Same-origin /api probes go through the proxy; upstream 401s on member
    # endpoints are the correct anonymous answer, not a page defect.
    rec["failed_requests"] = [f for f in failed if " 401 " not in f and "/api/auth/me" not in f][:8]
    rec["console_errors"] = console_errors[:8]

    slug = route.strip("/").replace("/", "__") or "_root"
    shot = out_dir / viewport_name / f"{slug}.png"
    shot.parent.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(shot), full_page=True)
    rec["screenshot"] = str(shot.relative_to(out_dir))
    return rec


async def main():
    base = sys.argv[1]
    out_dir = Path(sys.argv[2])
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    routes = routes_from_dist(Path(os.environ.get("DIST", "dist")))
    if only:
        routes = [r for r in routes if only in r]

    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for vp_name, vp in VIEWPORTS.items():
            ctx = await browser.new_context(viewport=vp, device_scale_factor=1)
            page = await ctx.new_page()
            for i, route in enumerate(routes, 1):
                rec = await capture(page, base, route, vp_name, out_dir)
                records.append(rec)
                print(f"[{vp_name} {i}/{len(routes)}] {route}", flush=True)
            await ctx.close()
        await browser.close()

    (out_dir / "render-report.json").write_text(json.dumps(records, indent=2))
    print(f"\nwrote {len(records)} records → {out_dir}/render-report.json")


if __name__ == "__main__":
    asyncio.run(main())
