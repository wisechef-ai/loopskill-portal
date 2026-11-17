/**
 * live-count-island.test.ts — proves the LiveCount client island (owner ask:
 * "can we have [the counts] auto updating without need of the whole website
 * re-build?").
 *
 * THREE THINGS THIS PINS
 * -----------------------
 * (a) SOURCE — LiveCount.astro renders the static build-time fallback inline
 *     (so pre-JS/API-down the page is never blank/wrong-looking), and its
 *     client script targets the real public snapshot/federation endpoints —
 *     never a placeholder or wrong path.
 * (b) BUILT DIST — after `npm run build`, dist/index.html and
 *     dist/federation/index.html contain the static fallback number, and the
 *     island's fetch call (endpoint + textContent-swap logic) is present
 *     SOMEWHERE in the shipped JS — either inlined in the HTML (Astro can
 *     keep small scripts there) or externalized to dist/_astro/ (AGENTS.md:
 *     "Astro externalizes big scripts into dist/_astro/" — so both locations
 *     must be checked, never just one).
 * (c) FAILURE PATH — src/lib/liveCount.ts's extractLiveValue() rejects every
 *     malformed/hostile shape (missing key, string, NaN, zero, negative,
 *     nested-array) and returns null, which is the exact signal
 *     LiveCount.astro's client script treats as "leave the fallback alone".
 *     A direct unit test of the pure function proves the fail-closed
 *     contract without needing a live browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractLiveValue, formatCount, getByPath } from '../src/lib/liveCount';
import { ciWarn, distAssert, distDescribe, requiresBuilt } from './lib/dist-guard';

/**
 * CI CONTRACT (kanban t_eb25ceb0): the post-build step in
 * .github/workflows/ci.yml runs this file AFTER `npm run build` with
 * REQUIRE_LIVECOUNT_BUILT=1 — there, a missing built page is a THROWN error
 * (distAssert), never the silent `if (!existsSync(…)) return` this block used.
 *
 * REQUIRE_LIVECOUNT_CONTENT=1 (schedule / workflow_dispatch ONLY — the #140
 * split): the federation headline island is only RENDERED when the build-time
 * /api/skills/external fetch succeeded (fallback={overview.total}); a
 * transient 429 legitimately ships the honest-unavailable branch with no
 * island. Hard-requiring the island on push/PR would couple every portal
 * deploy to a contended anonymous bucket, so there the case degrades to a
 * ciWarn annotation (stderr — console.* dies under --reporter=json). On the
 * unattended rebuilds nobody's deploy is hostage and a silently vanished
 * headline count is exactly what red is for.
 */
const REQUIRE = 'REQUIRE_LIVECOUNT_BUILT';
const REQUIRE_CONTENT = 'REQUIRE_LIVECOUNT_CONTENT';

const ROOT = resolve(__dirname, '..');
const COMPONENT = resolve(ROOT, 'src/components/LiveCount.astro');
const INDEX_PAGE = resolve(ROOT, 'src/pages/index.astro');
const FEDERATION_PAGE = resolve(ROOT, 'src/pages/federation/index.astro');
const DIST = resolve(ROOT, 'dist');

// ─────────────────────────────────────────────────────────────────────────
// (c) FAILURE PATH — pure function, no build needed. This is the test that
// can genuinely FAIL: it fails today if extractLiveValue ever accepts a
// non-finite/zero/negative/non-numeric value, or if formatCount mis-renders.
// ─────────────────────────────────────────────────────────────────────────
describe('liveCount.ts — fail-closed extraction (never a fabricated swap)', () => {
  it('extracts a valid nested count', () => {
    expect(extractLiveValue({ counts: { skills_total: 58 } }, 'counts.skills_total')).toBe(58);
  });

  it('rejects a missing key (undefined)', () => {
    expect(extractLiveValue({ counts: {} }, 'counts.skills_total')).toBeNull();
  });

  it('rejects a missing top-level object', () => {
    expect(extractLiveValue(null, 'counts.skills_total')).toBeNull();
    expect(extractLiveValue(undefined, 'counts.skills_total')).toBeNull();
  });

  it('rejects NaN, zero, negative, and non-numeric values — never a fabricated swap', () => {
    for (const bad of [NaN, 0, -5, '58', '58<script>', null, [58], { x: 58 }]) {
      expect(
        extractLiveValue({ counts: { skills_total: bad } }, 'counts.skills_total'),
        `value ${JSON.stringify(bad)} must be rejected`,
      ).toBeNull();
    }
  });

  it('getByPath never throws on a malformed path against a primitive', () => {
    expect(getByPath(42, 'counts.skills_total')).toBeUndefined();
    expect(getByPath('string', 'a.b.c')).toBeUndefined();
  });

  it('formatCount: plain is a bare integer string', () => {
    expect(formatCount(58, 'plain')).toBe('58');
  });

  it('formatCount: comma adds thousands separators', () => {
    expect(formatCount(91362, 'comma')).toBe('91,362');
  });

  it('formatCount: floor1k-plus rounds DOWN and appends + (never over-claims)', () => {
    expect(formatCount(91362, 'floor1k-plus')).toBe('91,000+');
    expect(formatCount(999, 'floor1k-plus')).toBe('0+');
  });

  it('formatCount rejects non-finite input (never renders NaN/Infinity)', () => {
    expect(formatCount(NaN)).toBe('');
    expect(formatCount(Infinity)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (a) SOURCE — the component + call sites must exist and be wired to the
// real public endpoints (this is the part that would fail if someone
// pointed the fetch at a placeholder or removed the fallback prop).
// ─────────────────────────────────────────────────────────────────────────
describe('LiveCount.astro — source shape', () => {
  const src = readFileSync(COMPONENT, 'utf-8');

  it('renders the static fallback into the DOM at build time (never blank pre-JS)', () => {
    expect(src).toMatch(/data-live-count/);
    expect(src).toMatch(/\{staticText\}/);
    // fallback prop must actually flow into the rendered text.
    expect(src).toMatch(/const staticText = `\$\{formatCount\(fallback, format\)\}\$\{suffix\}`/);
  });

  it('client script fetches data-endpoint and swaps textContent only on a validated value', () => {
    expect(src).toMatch(/fetch\(endpoint/);
    expect(src).toMatch(/extractLiveValue\(data, path\)/);
    expect(src).toMatch(/if \(value === null\) return;/); // fail-closed: never falls through to a swap
    expect(src).toMatch(/node\.textContent = /);
  });

  it('the failure path (catch/non-2xx/null value) never touches the DOM', () => {
    // The .catch handler body must contain no DOM mutation — grep the catch
    // block specifically so a future refactor that adds a stray write here
    // is caught, not just the happy path.
    const catchBlock = src.slice(src.indexOf('.catch(() => {'), src.indexOf('.catch(() => {') + 400);
    expect(catchBlock).not.toMatch(/textContent\s*=/);
    expect(catchBlock).not.toMatch(/\.innerHTML/);
  });

  it('fetch never sends credentials for a public marketing count (no auth needed)', () => {
    expect(src).toMatch(/credentials:\s*['"]omit['"]/);
  });

  it('a 429/5xx response (r.ok false) is treated identically to a network error — fallback stays, no crash', () => {
    // The .then(r => r.ok ? r.json() : null) chain means a 429 (rate
    // limited — the live API rate-limits aggressively per the owner) never
    // reaches extractLiveValue at all; it degrades the same as a network
    // error. Assert the ok-gate exists so this can't silently regress to
    // r.json() unconditionally (which would throw on a non-JSON 429 body).
    expect(src).toMatch(/r\.ok\s*\?\s*r\.json\(\)\s*:\s*null/);
  });
});

describe('LiveCount call sites — wired to the REAL public snapshot/federation endpoints', () => {
  it('index.astro binds the federation headline stat to /api/skills/external counts.external_indexed', () => {
    const src = readFileSync(INDEX_PAGE, 'utf-8');
    expect(src).toMatch(/import LiveCount from ['"]\.\.\/components\/LiveCount\.astro['"]/);
    expect(src).toMatch(/endpoint:\s*['"]\/api\/skills\/external['"]/);
    expect(src).toMatch(/path:\s*['"]counts\.external_indexed['"]/);
  });

  it('index.astro binds the catalog stat to /api/marketing/snapshot counts.skills_total', () => {
    const src = readFileSync(INDEX_PAGE, 'utf-8');
    expect(src).toMatch(/endpoint="\/api\/marketing\/snapshot"/);
    expect(src).toMatch(/path="counts\.skills_total"/);
  });

  it('federation/index.astro (the headline surface per the owner) binds its total to the live island too', () => {
    const src = readFileSync(FEDERATION_PAGE, 'utf-8');
    expect(src).toMatch(/import LiveCount from ['"]\.\.\/\.\.\/components\/LiveCount\.astro['"]/);
    expect(src).toMatch(/endpoint="\/api\/skills\/external"/);
    expect(src).toMatch(/path="counts\.external_indexed"/);
    // Must still preserve the pre-existing honest "temporarily unavailable"
    // degradation copy for the case where the build-time fetch itself failed
    // (overview.ok === false) — the island only replaces the SUCCESS path's
    // number, never the honest-unavailable branch.
    expect(src.toLowerCase()).toMatch(/temporarily unavailable|could not be reached/);
  });

  it('the fetch target is never a placeholder/example/wrong endpoint', () => {
    for (const file of [INDEX_PAGE, FEDERATION_PAGE]) {
      const src = readFileSync(file, 'utf-8');
      expect(src).not.toMatch(/endpoint=["']\/api\/example/);
      expect(src).not.toMatch(/endpoint=["']https?:\/\/localhost/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (b) BUILT DIST — wired into CI's post-build step (kanban t_eb25ceb0).
// distDescribe keys on dist/ EXISTING so a build that dropped one of these
// pages lands as a RED case naming the page (distAssert), never a vanished
// skip. Pre-build (`npm test`, fresh clone) the block self-skips — the only
// legitimate place for one.
// ─────────────────────────────────────────────────────────────────────────
const REQUIRE_CONTENT_ON = requiresBuilt(REQUIRE_CONTENT);
const describeBuilt = distDescribe(REQUIRE, DIST);
describeBuilt('LiveCount — built dist output', () => {
  const indexHtml = resolve(DIST, 'index.html');
  const federationHtml = resolve(DIST, 'federation/index.html');
  const astroDir = resolve(DIST, '_astro');

  function scriptCorpus(): string {
    // AGENTS.md: "Astro externalizes big scripts into dist/_astro/" — the
    // island's client script may land inline in the HTML OR as an
    // externalized .js file referenced from the HTML. Concatenate both so a
    // test that only checked one location can't pass by accident.
    let corpus = '';
    if (existsSync(indexHtml)) corpus += readFileSync(indexHtml, 'utf-8');
    if (existsSync(astroDir)) {
      for (const f of readdirSync(astroDir)) {
        if (f.endsWith('.js')) corpus += readFileSync(join(astroDir, f), 'utf-8');
      }
    }
    return corpus;
  }

  it('dist/index.html contains the static fallback number for the federation stat (pre-JS honesty)', () => {
    // Hard-required on every event: index.astro's fallbacks are honest
    // NUMBERS even when the build-time fetch 429s (`let liveSkillCount = 57`,
    // federatedSkillCount degrades to the verified 80,000+ floor), so the
    // spans always render with real digits. A blank/NaN span is a defect here,
    // never a fail-closed branch.
    distAssert('built page dist/index.html (live-count fallback check)', indexHtml);
    const html = readFileSync(indexHtml, 'utf-8');
    // The fallback renders as data-live-count spans with a floor1k-plus or
    // plain number inside — assert the marker attribute + at least one
    // digit sequence, not an empty/placeholder span.
    const spans = [...html.matchAll(/<span[^>]*data-live-count[^>]*>([^<]*)<\/span>/g)];
    expect(spans.length).toBeGreaterThan(0);
    for (const [, text] of spans) {
      expect(text.trim().length, `LiveCount span rendered empty: "${text}"`).toBeGreaterThan(0);
      expect(text).not.toMatch(/undefined|NaN|null/i);
    }
  });

  it('dist/federation/index.html contains a non-empty static fallback for the headline total', () => {
    distAssert('built page dist/federation/index.html (headline fallback check)', federationHtml);
    const html = readFileSync(federationHtml, 'utf-8');
    const spans = [...html.matchAll(/<span[^>]*data-live-count[^>]*>([^<]*)<\/span>/g)];
    if (spans.length === 0) {
      // The honest-unavailable branch: overview.ok was false at build time
      // (fallback={overview.total} is null → LiveCount not rendered). Legit on
      // a transient 429 during a push/PR build — but never silent, and RED on
      // the unattended rebuilds where the headline count silently vanished.
      if (REQUIRE_CONTENT_ON) {
        throw new Error(
          `${REQUIRE_CONTENT}=1 but dist/federation/index.html renders NO data-live-count span — ` +
            `the build-time GET /api/skills/external failed closed, so the page's headline ` +
            `total silently stopped shipping on an unattended rebuild. Check catalog health ` +
            `(429? API down?) and re-run. (The honest-unavailable copy itself is pinned by ` +
            `federation-rot-guard.test.ts — this case guards the SUCCESS branch.)`,
        );
      }
      ciWarn(
        '::warning:: dist/federation/index.html has no data-live-count island (build-time ' +
          '/api/skills/external failed closed) — headline-fallback assertions did not execute ' +
          'this run; REQUIRE_LIVECOUNT_CONTENT=1 (schedule/dispatch) enforces them.',
      );
      return; // covered by federation-rot-guard.test.ts's disjunction for this build
    }
    for (const [, text] of spans) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/undefined|NaN|null/i);
    }
  });

  it('the shipped JS (inline or externalized to dist/_astro/) targets the real snapshot/federation endpoints', () => {
    distAssert('built output for island script corpus', [indexHtml, astroDir]);
    const corpus = scriptCorpus();
    // Post-distAssert the corpus cannot be empty (index.html exists); an empty
    // string here would mean _astro/ shipped zero .js AND index.html is blank.
    expect(corpus.length, 'script corpus built from dist/index.html + dist/_astro/*.js is empty').toBeGreaterThan(0);
    const targetsRealEndpoint =
      corpus.includes('/api/marketing/snapshot') || corpus.includes('/api/skills/external');
    expect(targetsRealEndpoint, 'no reference to a real snapshot endpoint found in dist/index.html or dist/_astro/*.js').toBe(true);
  });

  it('the shipped JS still carries the fail-closed swap contract (data-live-count wiring), not a stripped-down copy', () => {
    distAssert('built output for island script corpus', [indexHtml, astroDir]);
    const corpus = scriptCorpus();
    expect(corpus.length, 'script corpus built from dist/index.html + dist/_astro/*.js is empty').toBeGreaterThan(0);
    // Minified output renames locals but keeps string/attribute literals —
    // data-live-count and data-endpoint are DOM attribute names, immune to
    // minification, so this survives a real production build.
    expect(corpus).toMatch(/data-live-count/);
    expect(corpus).toMatch(/data-endpoint/);
  });
});
