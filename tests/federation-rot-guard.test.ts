/**
 * Rot guard for the federation GEO surfaces (G2-federation), updated for
 * issue#277's rework of the data layer.
 *
 * THE INVARIANT THIS PINS (portal#75 pattern — see
 * bootcamp-fallback-rot-guard.test.ts for the sibling case)
 * ----------------------------------------------------------------------
 * /federation/ and /federation/{source}/ read the live source list + counts
 * from GET /api/skills/external at build time (issue#277 — this replaced
 * GET /api/federation/filter, whose /facets endpoint still only enumerates
 * the stale 7-bucket taxonomy, 21 of the live 28 sources short). If that
 * API is unreachable, the pages MUST fail closed:
 *   - no fabricated total (never a hardcoded "91k" or any other literal),
 *   - no fabricated source rows,
 *   - no entry link built from data that didn't actually come back,
 *   - the build must still succeed (not hard-fail on API downtime).
 *
 * issue#277 CRITICAL addition: when the build-time source-list fetch fails
 * outright, the set of sources even ATTEMPTED must fall back to a full
 * current-list snapshot (FALLBACK_SOURCE_SLUGS, >=28 entries) — never the
 * old stale 8-source hardcode. This is a list of NAMES ONLY, never a
 * fabricated count or entry; a source still only gets a page if a real
 * sample call for it actually returns linkable rows.
 *
 * These tests read SOURCE (the guard shape must exist) and, when dist/
 * has been built, the BUILT OUTPUT — same two-layer pattern as the
 * bootcamp guard, because either layer alone can pass while the other is
 * broken.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { FALLBACK_SOURCE_SLUGS } from '../src/lib/federation';
import { ciWarn, distAssert, distDescribe, requiresBuilt } from './lib/dist-guard';

/**
 * CI CONTRACT (kanban t_eb25ceb0): the post-build step in
 * .github/workflows/ci.yml runs this file AFTER `npm run build` with
 * REQUIRE_FEDERATION_BUILT=1 — there, a missing dist/federation page is a
 * THROWN error (distAssert), never the silent `if (!existsSync(indexHtml))
 * return` this block used.
 *
 * REQUIRE_FEDERATION_CONTENT=1 (schedule / workflow_dispatch ONLY, the #140
 * split) additionally demands the per-source pages a prod build with catalog
 * access must emit. On push/PR a transient 429 on the anonymous catalog
 * bucket makes zero source pages the DESIGNED fail-closed branch, so those
 * cases degrade to a ciWarn annotation instead of holding an unrelated deploy
 * hostage. ciWarn writes to stderr, not console: console.* is dropped under
 * `--reporter=json` (measured — see tests/lib/dist-guard.ts).
 */
const REQUIRE = 'REQUIRE_FEDERATION_BUILT';
const REQUIRE_CONTENT = 'REQUIRE_FEDERATION_CONTENT';

const ROOT = resolve(__dirname, '..');
const FEDERATION_LIB = resolve(ROOT, 'src/lib/federation.ts');
const INDEX_PAGE = resolve(ROOT, 'src/pages/federation/index.astro');
const SOURCE_PAGE = resolve(ROOT, 'src/pages/federation/[source]/index.astro');

describe('federation rot guard — source shape', () => {
  /** Strip comments before scanning for a hardcoded literal — this file's
   *  OWN doc comments legitimately name the historical "91k+" claim as the
   *  problem being fixed; what must never exist is that figure used as
   *  actual fallback/return VALUE in code. */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  }

  it('federation.ts: never hardcodes the 91k figure (or any literal total) as a fallback VALUE', () => {
    const code = stripComments(readFileSync(FEDERATION_LIB, 'utf-8'));
    expect(code).not.toMatch(/91[,.]?1?[0-9]{2,3}\+?/);
    expect(code).not.toMatch(/91\s*[,]?\s*000/i);
    expect(code).not.toMatch(/91\s*k\+?/i);
  });

  it('issue#277: FALLBACK_SOURCE_SLUGS has at least 28 entries, is exported, and is names-only', () => {
    // Length >= 28 pins the CRITICAL fail-closed rule: a summary-call
    // failure must fall back to the FULL current live source list, not the
    // old stale 8-source hardcode.
    expect(FALLBACK_SOURCE_SLUGS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(FALLBACK_SOURCE_SLUGS).size).toBe(FALLBACK_SOURCE_SLUGS.length); // no dupes
    for (const slug of FALLBACK_SOURCE_SLUGS) {
      expect(typeof slug).toBe('string');
      expect(slug.length).toBeGreaterThan(0);
    }
  });

  it('federation.ts: sources are enumerated from GET /api/skills/external, not /api/federation/filter/facets', () => {
    const code = stripComments(readFileSync(FEDERATION_LIB, 'utf-8'));
    expect(code).toMatch(/\/api\/skills\/external/);
    // The stale facets endpoint (7-bucket taxonomy, 21 of 28 live sources
    // short — the whole reason issue#277 exists) must not be the source of
    // truth here any more.
    expect(code).not.toMatch(/\/api\/federation\/filter\/facets/);
  });

  it('federation.ts: the summary fetch failing outright falls back to FALLBACK_SOURCE_SLUGS, never an empty or stale-8 list', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    expect(src).toMatch(/slugs\s*=\s*\[\.\.\.FALLBACK_SOURCE_SLUGS\]/);
  });

  it('federation.ts: a source total is only ever a real live number or a verified sample count, never guessed', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    // total resolves to the live per-source indexed count when the summary
    // call gave us one, else the honest count of real linkable sample rows
    // — never a number larger than what was actually verified.
    expect(src).toMatch(/typeof liveTotal === 'number' \? liveTotal : \(entries\.length > 0 \? entries\.length : null\)/);
  });

  it('federation.ts: entries without a resolvable http(s) origin_url are dropped, not linked', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    expect(src).toMatch(/\.filter\(\s*\(\s*e[^)]*\)\s*=>[\s\S]{0,120}origin_url[\s\S]{0,80}https\?/);
  });

  it('federation.ts: the build-time fetches are wrapped so an API failure cannot abort the build', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    const region = src.slice(src.indexOf('export function getFederationOverview'));
    expect(region.slice(0, 700)).toMatch(/try\s*\{/);
    expect(region.slice(0, 1000)).toMatch(/catch/);
  });

  it('federation/index.astro: only emits a Dataset schema when a real total exists', () => {
    const src = readFileSync(INDEX_PAGE, 'utf-8');
    expect(src).toMatch(/overview\.ok\s*&&\s*overview\.total\s*&&\s*overview\.sources\.length\s*>\s*0/);
  });

  it('federation/index.astro: renders an honest "unavailable" state with zero sources, not fabricated rows', () => {
    const src = readFileSync(INDEX_PAGE, 'utf-8');
    expect(src).toMatch(/overview\.sources\.length === 0/);
    expect(src.toLowerCase()).toMatch(/could not be reached|unavailable/);
  });

  it('federation/[source]/index.astro: getStaticPaths is built ONLY from getFederationSourcePages()', () => {
    const src = readFileSync(SOURCE_PAGE, 'utf-8');
    expect(src).toMatch(/getFederationSourcePages\(\)/);
    // No hardcoded seed/fallback source list for this page class — unlike
    // skills/[slug].astro and bundles/[slug].astro, a federation source
    // page's whole reason to exist is a live sample of real linked
    // entries; a seed fallback here would mean fabricated entries with
    // fabricated origin links, which D-035 forbids outright.
    expect(src).not.toMatch(/SEED_(SOURCES|FEDERATION)/);
  });

  it('federation/[source]/index.astro: every entry link uses the real origin_url, never a rehost', () => {
    const src = readFileSync(SOURCE_PAGE, 'utf-8');
    expect(src).toMatch(/href=\{entry\.origin_url\}/);
  });
});

const DIST = resolve(ROOT, 'dist');
const FED_INDEX_HTML = resolve(DIST, 'federation/index.html');
const FED_SOURCES_DIR = resolve(DIST, 'federation');
const REQUIRE_CONTENT_ON = requiresBuilt(REQUIRE_CONTENT);

// distDescribe keys on dist/ EXISTING (not on each page): if the build ran but
// this page vanished, the block still runs and each case naming the page goes
// RED via distAssert. With no build and no contract, the block self-skips —
// the only legitimate place for one.
const describeBuilt = distDescribe(REQUIRE, DIST);
describeBuilt('federation rot guard — built output', () => {
  it('dist/federation/index.html: never ships a fabricated "91k" style claim', () => {
    // distAssert, not `if (!existsSync(indexHtml)) return`: once chosen to
    // run, a missing page is a defect, and returning would report a green
    // that executed zero assertions — the exact rot this class exists to kill.
    distAssert('built page dist/federation/index.html (91k-claim check)', FED_INDEX_HTML);
    const html = readFileSync(FED_INDEX_HTML, 'utf-8');
    // Any real live total that happens to be ~91k is fine (it's real); what
    // must never appear is the exact historical rounded marketing figure
    // "91k+" as a symbol distinct from a live-rendered thousands-grouped
    // number (which would read e.g. "91,170", not "91k+").
    expect(html).not.toMatch(/91k\+/i);
  });

  it('dist/federation/index.html: if present, renders either a live count or the honest unavailable copy — never both silently omitted', () => {
    // Content-agnostic: the fail-closed branch renders the honest-unavailable
    // copy, the success branch renders the live count. Whichever ran, the
    // disjunction must hold — so this is hard-required on every event, and it
    // is the case that catches a build that omitted BOTH (silence = the
    // fabricated-data sneaks-back door, WIS-737 class).
    distAssert('built page dist/federation/index.html (count-or-honest-copy check)', FED_INDEX_HTML);
    const html = readFileSync(FED_INDEX_HTML, 'utf-8');
    const hasLiveCount = /externally indexed skills/i.test(html);
    const hasUnavailableCopy = /temporarily unavailable|could not be reached/i.test(html);
    expect(hasLiveCount || hasUnavailableCopy).toBe(true);
  });

  it('issue#277: dist/federation/ emits pages for previously-invisible sources (e.g. a github-* tap), when the build succeeded', () => {
    distAssert('built dir dist/federation/ (source-page check)', FED_SOURCES_DIR);
    // We don't assert a SPECIFIC slug (the live catalog can legitimately
    // drop a source between builds) — the load-bearing numbers are the old
    // 8-source hardcode ceiling and zero (API fully down at build time).
    const entries = readdirSync(FED_SOURCES_DIR).filter((e: string) => {
      try {
        return statSync(resolve(FED_SOURCES_DIR, e)).isDirectory();
      } catch {
        return false;
      }
    });
    if (entries.length === 0) {
      // Zero source pages is the DESIGNED fail-closed branch when the
      // build-time source-list + sample fetches all failed (429 on the
      // anonymous bucket). On push/PR that must not block an unrelated
      // deploy — degrade loudly (stderr, survives --reporter=json). On the
      // unattended rebuilds (REQUIRE_FEDERATION_CONTENT=1) nobody's deploy is
      // hostage, and a prod nightly silently shipping an empty federation
      // section is precisely what red is for.
      if (REQUIRE_CONTENT_ON) {
        throw new Error(
          `${REQUIRE_CONTENT}=1 but dist/federation/ emits ZERO per-source pages — the ` +
            `build-time GET /api/skills/external (and every per-source sample call) failed ` +
            `closed, so the whole federated index silently stopped shipping. Check catalog ` +
            `health (429? API down?) and re-run; this is the #140 split: content is red on ` +
            `schedule/dispatch precisely so nobody has to watch the green.`,
        );
      }
      ciWarn(
        '::warning:: dist/federation/ emitted zero per-source pages (build-time catalog ' +
          'fetch failed closed) — the issue#277 source-page guarantee was not exercised ' +
          'in this run; REQUIRE_FEDERATION_CONTENT=1 (schedule/dispatch) enforces it.',
      );
      return;
    }
    if (REQUIRE_CONTENT_ON && entries.length <= 8) {
      // THE regression this case exists for: the stale 8-source hardcode cap.
      // A prod-catalog build emitting ≤8 source pages means enumeration fell
      // back to (or was re-capped at) the old hardcode — red on the unattended
      // rebuilds, warning-visible elsewhere.
      throw new Error(
        `${REQUIRE_CONTENT}=1 but dist/federation/ emits only ${entries.length} source page(s) ` +
          `(≤ the old stale 8-source hardcode ceiling). Live enumeration should yield 28+; ` +
          `check getFederationOverview's GET /api/skills/external path and the ` +
          `FALLBACK_SOURCE_SLUGS fallback in src/lib/federation.ts.`,
      );
    }
    if (!REQUIRE_CONTENT_ON && entries.length <= 8) {
      ciWarn(
        `::warning:: dist/federation/ emitted only ${entries.length} source page(s) (≤ the old ` +
          `8-source hardcode ceiling) — legitimate on a partial catalog 429, red on the nightly.`,
      );
    }
    expect(Array.isArray(entries)).toBe(true);
  });
});
