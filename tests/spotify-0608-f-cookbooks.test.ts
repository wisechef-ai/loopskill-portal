/**
 * spotify_0608 Ph F — Spotify-grade hybrid portal: public cookbook surfaces.
 *
 * Source-level assertions (same pattern as phase-h.test.ts):
 *   - /cookbooks (discover feed) consumes /api/cookbooks/discover, links to
 *     public cookbook pages, SEO shell renders at build.
 *   - /cookbooks/p (public cookbook page) consumes /api/cookbooks/public/{slug},
 *     surfaces the ONE-LINE MCP clone (the GTM gate) with a copy button.
 *   - Nav links to /cookbooks (desktop + mobile).
 *   - Same-origin API: no api.recipes.wisechef.ai default anywhere in src/.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// Public cookbook page — /cookbooks/p
// ---------------------------------------------------------------------------
describe('Ph F: public cookbook page (/cookbooks/p)', () => {
  const p = join(SRC, 'pages/cookbooks/p.astro');

  it('exists', () => {
    expect(existsSync(p)).toBe(true);
  });

  it('fetches the anonymous public cookbook endpoint', () => {
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('/api/cookbooks/public/');
  });

  it('surfaces the one-line MCP clone (GTM gate) with a copy button', () => {
    const src = readFileSync(p, 'utf-8');
    // The clone line element + the server-provided clone_line consumption.
    expect(src).toContain('id="clone-line"');
    expect(src).toContain('clone_line');
    expect(src).toContain('recipes_install_from_cookbook');
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
    expect(src).toContain('s.is_public');
    expect(src).toContain('/skills/');
  });
});

// ---------------------------------------------------------------------------
// Discover feed — /cookbooks
// ---------------------------------------------------------------------------
describe('Ph F: discover feed (/cookbooks)', () => {
  const idx = join(SRC, 'pages/cookbooks/index.astro');

  it('exists', () => {
    expect(existsSync(idx)).toBe(true);
  });

  it('consumes the public discover endpoint with sort', () => {
    const src = readFileSync(idx, 'utf-8');
    expect(src).toContain('/api/cookbooks/discover');
    expect(src).toContain('sort=');
  });

  it('links cards to the public cookbook page carrying ?ref attribution', () => {
    const src = readFileSync(idx, 'utf-8');
    expect(src).toContain('/cookbooks/p/');
    expect(src).toContain('cb.ref');
  });

  it('has both Top (installs) and Newest sort tabs', () => {
    const src = readFileSync(idx, 'utf-8');
    expect(src).toContain('sort-installs');
    expect(src).toContain('sort-newest');
    expect(src).toContain('load("newest")');
  });

  it('renders an SEO h1 at build time (static shell)', () => {
    const src = readFileSync(idx, 'utf-8');
    expect(src).toMatch(/<h1[^>]*>\s*Discover cookbooks/);
  });
});

// ---------------------------------------------------------------------------
// Nav links to /cookbooks
// ---------------------------------------------------------------------------
describe('Ph F: Nav exposes Cookbooks', () => {
  const nav = join(SRC, 'components/Nav.astro');

  it('links to /cookbooks at least twice (desktop + mobile)', () => {
    const src = readFileSync(nav, 'utf-8');
    const matches = [...src.matchAll(/href="\/cookbooks"/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Same-origin API contract (plan P0#5)
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
