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
 * CI NOTE: the `npm test` step runs BEFORE `astro build`, so this suite must
 * stay collection-safe when dist/ is absent — filesystem reads happen inside
 * the suite with an ENOENT fallback, never in a way that can throw while
 * vitest collects the file (a bare readdirSync at suite-body level failed
 * CI's pre-build test step on the first push of this gate).
 *
 * The OTHER half of that sentence is what rotted: because the self-skip is
 * silent, a file nobody runs post-build reports green forever. CI now runs
 * this file in a dedicated post-build step with REQUIRE_PV_BEACON_BUILT=1, so
 * a missing dist/ — or a build that emitted no blog posts, or a missing
 * scoping page — is a hard failure THERE and a legitimate skip everywhere
 * else. See tests/lib/dist-guard.ts and tests/dist-guard-coverage.test.ts.
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
import { distAssert, distDescribe, requireBuiltCases, ciWarn } from './lib/dist-guard';

/** Set by the post-build CI step; makes a missing build fatal, never skippable. */
const REQUIRE = 'REQUIRE_PV_BEACON_BUILT';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const DIST = join(ROOT, 'dist');
const BLOG = join(DIST, 'blog');
/** The authored source — the denominator the built list must be checked against. */
const CONTENT = join(ROOT, 'src/content/blog');

const BEACON_RE = /navigator\.sendBeacon\(\s*['"]\/api\/pv['"]/g;

/** dist/blog/<slug>/index.html listing, or [] when dist/ is not built yet. */
function blogPosts(): string[] {
  try {
    return readdirSync(BLOG).filter((d) => existsSync(join(BLOG, d, 'index.html')));
  } catch {
    return [];
  }
}

/** src/content/blog/*.md — what was AUTHORED, independent of the build. */
function authoredTitles(): Array<{ file: string; title: string }> {
  try {
    return readdirSync(CONTENT)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const src = readFileSync(join(CONTENT, f), 'utf8');
        const m = src.match(/^title:\s*['"](.+?)['"]\s*$/m);
        return { file: f, title: m ? m[1] : '' };
      });
  } catch {
    return [];
  }
}

/** Collapse to letters+digits so HTML escaping / punctuation can't cause drift. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Collection-safe by design: distDescribe() only picks describe vs describe.skip,
// it never throws at import time. The hard failure lands on the cases.
const describeBuilt = distDescribe(REQUIRE, [DIST, BLOG]);
if (!existsSync(DIST)) {
  ciWarn('dist/ absent — skipping pv beacon gates (legitimate pre-build). Run `npm run build` first.');
}

describeBuilt('pv_1013: /api/pv beacon on built blog posts', () => {
  test('there are built blog posts to gate on', () => {
    // Without this, an empty blogPosts() makes the test.each() below register
    // ZERO cases and the whole file goes green while gating nothing at all.
    requireBuiltCases(REQUIRE, 'dist/blog/<slug>/index.html', blogPosts());
    expect(blogPosts().length).toBeGreaterThan(0);
  });

  test('every AUTHORED post was actually built (the gate cannot shrink unnoticed)', () => {
    // blogPosts() lists dist/blog/<dir> entries that CONTAIN index.html, so the
    // set of gated posts is derived FROM THE BUILD. Delete one post's
    // index.html and the .each above registers one fewer case — measured as a
    // GREEN with zero failures (NC-B8). A denominator the build controls is not
    // a guard: the build can quietly stop emitting a post and shrink the gate
    // with it. So the expected set comes from what was AUTHORED instead.
    // Titles are matched over the union of built post pages, normalised to
    // alphanumerics — no knowledge of Astro's slug rules needed, and it catches
    // title drift between the .md frontmatter and the rendered page too.
    const authored = authoredTitles();
    requireBuiltCases(REQUIRE, 'src/content/blog/*.md', authored);
    distAssert('built blog post directory dist/blog', BLOG);
    const all = blogPosts()
      .map((s) => readFileSync(join(BLOG, s, 'index.html'), 'utf8'))
      .join('\n');
    const hay = norm(all);
    const missing = authored
      .filter((a) => a.title && !hay.includes(norm(a.title)))
      .map((a) => `   • ${a.file} — "${a.title}"`);
    expect(
      missing,
      `authored posts with no built page carrying their title (the build dropped a post, ` +
        `so every beacon/UTM guard below silently stopped covering it):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  test.each(blogPosts())('%s: exactly one beacon call, full attribution payload', (slug) => {
    const page = join(BLOG, String(slug), 'index.html');
    // distAssert, not `if (!distGate(…)) return`: this block has already been
    // chosen to run, so a post whose page the build did not emit is a defect.
    // The early-return version passed with ZERO assertions on a partial build
    // (and would keep passing if CI's step ever lost its REQUIRE_*_BUILT env).
    distAssert(`built blog post dist/blog/${slug}/index.html`, page);
    const html = readFileSync(page, 'utf8');
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
      // A bare `continue` here was a third self-skip: if the build ever stops
      // emitting /pricing, this "not on non-blog pages" guard silently checked
      // nothing and still passed. Inside a running block a missing page is a
      // defect, so assert it — the case names the page instead of shrugging.
      distAssert(`non-blog scoping page dist/${page}`, p);
      const html = readFileSync(p, 'utf8');
      expect(html.match(BEACON_RE) ?? []).toHaveLength(0);
    }
  });
});
