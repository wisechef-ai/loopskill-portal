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
SETTLE_MS = 2600


async def install_api_bridge(ctx):
    """Let client islands reach the real API from a localhost origin.

    WHY THIS IS NOT OPTIONAL. `src/lib/api.ts` uses an ABSOLUTE
    `API_BASE = https://app.loopskill.io`, so a page served from 127.0.0.1
    fetches cross-origin and the API's CORS allow-list — correctly — refuses
    it. Without this bridge, /browse rendered "Nothing is available right now"
    locally while the live site rendered 115 cards. Every dynamic page would
    have been screenshotted in its empty state, and the render pass would have
    manufactured a page full of defects that do not exist while hiding the real
    ones underneath.

    We intercept in the browser and fulfil from a server-side fetch, where CORS
    does not apply, adding a permissive ACAO on the way back. This changes only
    who is allowed to read the response — not what the API returns.

    GETs are memoized for the run. 153 routes hit the same handful of catalog
    endpoints; without the cache the pass spends its whole wall-clock waiting on
    a remote API to repeat itself, and takes hours instead of minutes.
    """
    cache: dict[str, tuple] = {}

    async def handler(route):
        req = route.request
        if req.method == "OPTIONS":
            await route.fulfill(
                status=204,
                headers={
                    "access-control-allow-origin": "*",
                    "access-control-allow-headers": "*",
                    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
                },
            )
            return
        if req.method == "GET" and req.url in cache:
            status, headers, body = cache[req.url]
            await route.fulfill(status=status, headers=headers, body=body)
            return
        try:
            resp = await ctx.request.fetch(req, timeout=20000)
            headers = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-encoding", "content-length")}
            headers["access-control-allow-origin"] = "*"
            body = await resp.body()
            if req.method == "GET":
                cache[req.url] = (resp.status, headers, body)
            await route.fulfill(status=resp.status, headers=headers, body=body)
        except Exception:
            await route.abort()

    await ctx.route("**/api/**", handler)


def routes_from_dist(dist: Path) -> list[str]:
    out = []
    for p in sorted(dist.rglob("index.html")):
        rel = p.relative_to(dist).parent.as_posix()
        out.append("/" if rel == "." else f"/{rel}/")
    return out


async def capture(ctx, base, route, viewport_name, out_dir):
    # A FRESH PAGE PER ROUTE. Reusing one page and re-registering the console /
    # response listeners on every capture leaves every previous capture's
    # handlers attached, so by route 100 each event fans out to 100 closures
    # appending to dead lists. It slows the pass to a crawl and cross-
    # contaminates the records it exists to produce.
    page = await ctx.new_page()
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
        await page.close()
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
        await page.close()
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
    await page.close()
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

        async def run_viewport(vp_name, vp):
            ctx = await browser.new_context(viewport=vp, device_scale_factor=1)
            await install_api_bridge(ctx)
            out = []
            for i, route in enumerate(routes, 1):
                out.append(await capture(ctx, base, route, vp_name, out_dir))
                if i % 10 == 0 or i == len(routes):
                    print(f"[{vp_name} {i}/{len(routes)}] {route}", flush=True)
            await ctx.close()
            return out

        for chunk in await asyncio.gather(
            *(run_viewport(n, v) for n, v in VIEWPORTS.items())
        ):
            records.extend(chunk)
        await browser.close()

    (out_dir / "render-report.json").write_text(json.dumps(records, indent=2))
    print(f"\nwrote {len(records)} records → {out_dir}/render-report.json")


if __name__ == "__main__":
    asyncio.run(main())
