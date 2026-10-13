/**
 * pv_1013 — /api/pv beacon is wired into every built blog post.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * API #402 shipped POST /api/pv (live: 204) but no live page called it, so
 * stranger arrival during a 29-day zero-human drought was invisible. This
 * gate runs against the REAL BUILT OUTPUT in dist/ (same pattern as
 * tests/gap-schema-faq-offer-article.test.ts): `npm run build` first, then
 * parse the emitted HTML — not the .astro source.
 *
 * CI NOTE: the workflow runs vitest BEFORE `astro build`, so this suite must
 * be collection-safe when dist/ is absent — filesystem reads happen inside
 * the suite with an ENOENT fallback, never in a way that can throw while
 * vitest collects the file (a bare readdirSync at suite-body level failed
 * CI's pre-build test step on the first push of this gate).
 *
 * Assertions:
 *  1. every dist/blog/<slug>/index.html carries exactly ONE sendBeacon('/api/pv')
 *     call (not zero, not duplicated);
 *  2. the payload posts the full attribution shape (path + utm_* + referrer);
 *  3. the beacon is scoped: non-blog public pages (/, /pricing) do NOT carry
 *     it — /api/pv's allowed prefixes are /blog/ and /use-cases/ only, and
 *     blanket sitewide firing would silently poison the per-prefix funnel.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const DIST = join(ROOT, 'dist');
const BLOG = join(DIST, 'blog');

const BEACON_RE = /navigator\.sendBeacon\(\s*['"]\/api\/pv['"]/g;

/** dist/blog/<slug>/index.html listing, or [] when dist/ is not built yet. */
function blogPosts(): string[] {
  try {
    return readdirSync(BLOG).filter((d) => existsSync(join(BLOG, d, 'index.html')));
  } catch {
    return [];
  }
}

const describeBuilt = existsSync(DIST) ? describe : describe.skip;
if (!existsSync(DIST)) {
  // eslint-disable-next-line no-console
  console.warn('dist/ absent — skipping pv beacon gates. Run `npm run build` first.');
}

describeBuilt('pv_1013: /api/pv beacon on built blog posts', () => {
  test('there are built blog posts to gate on', () => {
    expect(blogPosts().length).toBeGreaterThan(0);
  });

  test.each(blogPosts())('%s: exactly one beacon call, full attribution payload', (slug) => {
    const html = readFileSync(join(BLOG, String(slug), 'index.html'), 'utf8');
    const calls = html.match(BEACON_RE) ?? [];
    expect(calls.length).toBe(1);

    // payload shape: path + utm_* + referrer (mirrors the use-cases copy, PR #124)
    for (const field of ['path:', 'utm_source:', 'utm_medium:', 'utm_campaign:', 'utm_content:', 'referrer:']) {
      expect(html).toContain(field);
    }
  });

  test('beacon is scoped: / and /pricing do NOT fire it', () => {
    for (const page of ['index.html', 'pricing/index.html']) {
      const p = join(DIST, page);
      if (!existsSync(p)) continue;
      const html = readFileSync(p, 'utf8');
      expect(html.match(BEACON_RE) ?? []).toHaveLength(0);
    }
  });
});
