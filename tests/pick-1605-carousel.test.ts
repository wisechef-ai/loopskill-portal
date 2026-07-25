/**
 * pick_1605 — Today's Pick + carousel-strip regression tests.
 *
 * Failure mode caught 2026-05-16 PM (Adam's screenshot):
 *   - The 7-card carousel-strip below "See today's lineup" rendered "SLOT NaN"
 *     and an empty title because index.astro's strip mapper read `e.position`
 *     and `e.skill_title` directly — legacy shape — while the typed-v0.4+ API
 *     returns `{slot, skill: {title, ...}}`. Result: undefined+1 = NaN, and
 *     `e.skill_title === undefined`.
 *
 * These tests are static-string assertions on the source so they catch the
 * regression at CI time without needing a build + browser snapshot. They
 * encode the contract:
 *   - The strip block MUST not read `e.skill_title` / `e.position` / `e.skill_slug`
 *     bare (those are post-normalization names that ONLY exist after we
 *     normalize the API response).
 *   - Either the source uses the canonical normalizer (preferred) or it
 *     reads `e.skill?.title` etc. with the typed-v0.4+ fallback chain.
 *
 * Companion: see also tests/test_carousel_cron.py in recipes-api for the
 * server-side tagline != title invariant (pick_1605 Phase C).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const INDEX = join(ROOT, 'src/pages/index.astro');
const CAROUSEL = join(ROOT, 'src/pages/carousel.astro');

describe("Today's Pick widget (pick_1605/A+B)", () => {
  const src = readFileSync(INDEX, 'utf-8');

  it('exposes a normalizeCarouselEntry helper (single source of truth for entry shape)', () => {
    expect(src).toContain('function normalizeCarouselEntry');
  });

  it('computes todaysPick from carouselToday', () => {
    expect(src).toContain('const todaysPick');
    expect(src).toContain('carouselToday');
  });

  it('renders a TodaysPickCard block with data-testid="todays-pick"', () => {
    expect(src).toContain('data-testid="todays-pick"');
  });

  it('renders the tagline fallback ladder copy when carousel is empty', () => {
    // STALE string: loopskill_0622 rebrand renamed "Recipes carousel" ->
    // "LoopSkill carousel" (commit 61756f7). Assert the current brand copy.
    expect(src).toContain("Today's spotlight from the LoopSkill carousel");
  });

  it('links Picks rotate small-text to /carousel ("See all 7")', () => {
    expect(src).toContain('See all 7');
    expect(src).toMatch(/href="\/carousel"/);
  });

  it('falls back to the hardcoded spotlight array when todaysPick is null', () => {
    // The spotlight grid must still render as the safety net.
    expect(src).toContain('spotlight.map');
  });

  it('stamps Today\'s Pick CTA href with UTM ?ref=pick-today-YYYYMMDD (atomic-habits 2026-05-17 rank-8)', () => {
    // Click attribution: every Today's Pick click is tagged so the funnel is measurable.
    // Without this, /api/marketing/snapshot + Stripe MRR cannot be tied to a specific seed.
    expect(src).toContain('todayUtmDate');
    expect(src).toMatch(/href=\{`\/skills\/\$\{todaysPick\.slug\}\?ref=pick-today-\$\{todayUtmDate\}`\}/);
  });
});

describe('carousel-strip in index.astro (the second grid below "See today\'s lineup")', () => {
  const src = readFileSync(INDEX, 'utf-8');

  // The strip block — bounded precisely between the "Today's 7" eyebrow
  // (unique anchor in index.astro) and the closing </section> of that block.
  // Bounding too wide accidentally pulled in `e.skill_title` / `e.skill_slug`
  // references from neighbouring sections (cookSkills, spotlight); narrow
  // window keeps the regex honest. Using "Today's 7" instead of "See today's
  // lineup" because comments may legitimately reference the latter.
  function stripBlock(): string {
    const startMarker = "Today's 7</p>";
    const start = src.indexOf(startMarker);
    expect(start, "Expected anchor \"Today's 7</p>\" in index.astro").toBeGreaterThan(-1);
    const stripCloseIdx = src.indexOf('</section>', start);
    const end = stripCloseIdx > 0 ? stripCloseIdx : start + 2500;
    return src.slice(start, end);
  }

  it('does NOT use bare e.position (typed v0.4+ API returns e.slot) — would render SLOT NaN', () => {
    const block = stripBlock();
    // Allow `e.slot ? e.slot - 1 : ...` fallback (carousel.astro pattern) but NOT bare `e.position`.
    expect(block).not.toMatch(/\be\.position\b/);
  });

  it('does NOT use bare e.skill_title (typed v0.4+ API returns e.skill.title) — would render empty', () => {
    const block = stripBlock();
    expect(block).not.toMatch(/\be\.skill_title\b/);
  });

  it('does NOT use bare e.skill_slug (typed v0.4+ API returns e.skill.slug) — would link to /skills/undefined', () => {
    const block = stripBlock();
    expect(block).not.toMatch(/\be\.skill_slug\b/);
  });

  it('renders a real slot number — slot value comes from e.slot or the normalized entry, never undefined', () => {
    const block = stripBlock();
    // Either uses the normalizer-derived shape (post-normalization fields)
    // or guards against undefined slot, or uses the Phase-I client-side pattern
    // where the slot is rendered from n.slot / slotNum in the inline script.
    expect(
      block.includes('normalizedCarouselToday') ||
      block.includes('e.skill?.slug') ||
      /e\.slot\s*\?\?\s*e\.position/.test(block) ||
      /String\(e\.slot\)/.test(block) ||
      // Phase I client-side: slot rendered in script as String(slotNum) or via skeleton
      /String\(slotNum\)/.test(block) ||
      /String\(i\)\.padStart/.test(block)
    ).toBe(true);
  });

  it('renders the actual skill title from typed-v0.4+ shape (e.skill.title) or a normalized field', () => {
    const block = stripBlock();
    expect(
      block.includes('normalizedCarouselToday') ||
      block.includes('e.skill?.title') ||
      block.includes('entry.title') ||
      block.includes('n.title') // any normalized alias
    ).toBe(true);
  });
});

describe('carousel.astro (the /carousel page) — same shape contract [STALE, removed]', () => {
  // STALE: /carousel was replaced by a RedirectStub to /home in the
  // feat/spotify-ia restructure (commit fc0d01f, "Spotify-model
  // restructure — Home shelves, unified Browse, Library tabs"). The
  // "Today's 7" carousel strip this test guarded now lives entirely in
  // src/pages/index.astro (see the describe blocks above, which already
  // pin the normalizer + shape contract there) — src/pages/carousel.astro
  // no longer contains any carousel-rendering code to normalize.
  const src = readFileSync(CAROUSEL, 'utf-8');

  it('is a RedirectStub to /home (current behavior, not a carousel renderer)', () => {
    expect(src).toContain('RedirectStub');
    expect(src).toContain('to="/home"');
  });
});
