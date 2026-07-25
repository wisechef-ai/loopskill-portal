/**
 * spotify_0608 Ph F — Spotify-grade hybrid portal: public cookbook surfaces.
 * [REVISED 2026-07-25 — superseded by feat/spotify-ia + loopskill_0622 rebrand]
 *
 * STALE (architecture + rebrand): /cookbooks and /cookbooks/p.astro are now
 * thin client-side RedirectStubs (see src/pages/cookbooks/index.astro ->
 * /browse?type=bundles, and src/pages/cookbooks/p.astro ->
 * /bundles/p, preserving the query string). Two independent changes moved
 * the ground under this suite:
 *
 *   1. loopskill_0622 rebrand (commit aff2b79, "cookbook→bundle visible
 *      copy sweep, 350 swaps, 40 files") renamed the whole cookbook/bundle
 *      concept and its API surface from cookbooks/cookbook_id to
 *      bundles/bundle_id — /api/bundles/public/{slug},
 *      /api/bundles/discover, etc.
 *   2. feat/spotify-ia (commit fc0d01f, "Spotify-model restructure") retired
 *      the dedicated /cookbooks discover-feed page entirely in favor of the
 *      unified /browse?type=bundles search-first surface, and retired
 *      /cookbooks/p.astro in favor of /bundles/p.astro (mirrors it exactly
 *      per that file's own top-of-file comment).
 *
 * The underlying product requirements this suite protected — public bundle
 * page with the one-line MCP clone/GTM gate, a discover surface, nav
 * exposure — are still live, just on the new routes. These tests pin the
 * CURRENT surfaces. Verified against source + live site 2026-07-25:
 * curl https://app.loopskill.io/cookbooks -> 301, /cookbooks -> redirect
 * stub to /browse?type=bundles (200); src/pages/bundles/p.astro carries the
 * exact same clone-line / copy-button / 404-handling contract the old
 * cookbooks/p.astro had.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// Public bundle page — /bundles/p (was /cookbooks/p)
// ---------------------------------------------------------------------------
describe('Ph F: public bundle page (/bundles/p) [renamed from /cookbooks/p]', () => {
  const p = join(SRC, 'pages/bundles/p.astro');

  it('exists', () => {
    expect(existsSync(p)).toBe(true);
  });

  it('fetches the anonymous public bundle endpoint', () => {
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('/api/bundles/public/');
  });

  it('surfaces the one-line MCP clone (GTM gate) with a copy button', () => {
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('id="clone-line"');
    expect(src).toContain('clone_line');
    expect(src).toContain('loopskill_bundle_install');
    expect(src).toContain('id="copy-btn"');
    expect(src).toContain('clipboard.writeText');
  });

  it('resolves slug from ?slug= or trailing path segment', () => {
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('"slug"');
    expect(src).toContain('location.pathname');
  });

  it('handles 404 (not public / not found) honestly', () => {
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('state-notfound');
    expect(src).toContain('res.status === 404');
  });

  it('links catalog skills out but renders tailored/private skills as text', () => {
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('source_url');
    expect(src).toContain('/skills/');
  });

  it('/cookbooks/p redirects to /bundles/p preserving the query string (compat)', () => {
    const stub = join(SRC, 'pages/cookbooks/p.astro');
    const src = readFileSync(stub, 'utf-8');
    expect(src).toContain('RedirectStub');
    expect(src).toContain('to="/bundles/p"');
    expect(src).toContain('preserveQuery={true}');
  });
});

// ---------------------------------------------------------------------------
// Discover surface — /browse?type=bundles (was the dedicated /cookbooks feed)
// ---------------------------------------------------------------------------
describe('Ph F: discover surface — /browse?type=bundles [replaces dedicated /cookbooks feed]', () => {
  const browse = join(SRC, 'pages/browse.astro');

  it('browse.astro exists', () => {
    expect(existsSync(browse)).toBe(true);
  });

  it('consumes the public bundles-discover endpoint', () => {
    const src = readFileSync(browse, 'utf-8');
    expect(src).toContain('/api/bundles/discover');
    expect(src).toContain('sort=');
  });

  it('links bundle cards to the /bundles/p public page', () => {
    const src = readFileSync(browse, 'utf-8');
    // artifactHref() routes type 'bundles' items to /bundles/p?slug=<slug>
    expect(src).toContain('/bundles/p?slug=');
  });

  it('/cookbooks redirects to /browse?type=bundles (compat)', () => {
    const stub = join(SRC, 'pages/cookbooks/index.astro');
    const src = readFileSync(stub, 'utf-8');
    expect(src).toContain('RedirectStub');
    expect(src).toContain('/browse?type=bundles');
  });
});

// ---------------------------------------------------------------------------
// Nav exposure — AppShell rail (Nav.astro was retired in onechrome_0611-P3)
// ---------------------------------------------------------------------------
describe('Ph F: bundles are reachable from the chrome [Nav.astro retired, moved to AppShell/Footer]', () => {
  const footer = join(SRC, 'components/Footer.astro');

  it('Footer.astro links to Bundles (the site-wide chrome entry point)', () => {
    const src = readFileSync(footer, 'utf-8');
    expect(src).toContain('href="/browse?type=bundles"');
    expect(src).toContain('Bundles');
  });
});

// ---------------------------------------------------------------------------
// Same-origin API contract (plan P0#5) — unchanged, still passes as-is
// ---------------------------------------------------------------------------
describe('Ph F: same-origin API — no api.recipes.wisechef.ai default', () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(full));
      else if (/\.(astro|ts|tsx|js|jsx)$/.test(e.name)) out.push(full);
    }
    return out;
  }

  it('no source file defaults to the api. subdomain (kills the cookie-host split)', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const src = readFileSync(f, 'utf-8');
      if (src.includes('api.recipes.wisechef.ai')) offenders.push(f.replace(SRC, 'src'));
    }
    expect(offenders).toEqual([]);
  });
});
