/**
 * Rot guard for the federation GEO surfaces (G2-federation).
 *
 * THE INVARIANT THIS PINS (portal#75 pattern — see
 * bootcamp-fallback-rot-guard.test.ts for the sibling case)
 * ----------------------------------------------------------------------
 * /federation/ and /federation/{source}/ read live counts and sample
 * entries from GET /api/federation/filter at build time. If that API is
 * unreachable, the pages MUST fail closed:
 *   - no fabricated total (never a hardcoded "91k" or any other literal),
 *   - no fabricated source rows,
 *   - no entry link built from data that didn't actually come back,
 *   - the build must still succeed (not hard-fail on API downtime).
 *
 * These tests read SOURCE (the guard shape must exist) and, when dist/
 * has been built, the BUILT OUTPUT — same two-layer pattern as the
 * bootcamp guard, because either layer alone can pass while the other is
 * broken.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('federation.ts: total starts null and is only ever set from a real API response', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    // getFederationOverview's fail-closed branch returns total: null.
    expect(src).toMatch(/return\s*\{\s*ok:\s*false,\s*total:\s*null/);
    // fetchGrandTotal / fetchSourceTotal must return null on any non-ok
    // response or malformed body — never coerce to 0 or a placeholder.
    expect(src).toMatch(/if\s*\(!res\.ok \|\| !res\.data \|\| typeof res\.data\.total !== 'number'\) return null;/);
  });

  it('federation.ts: entries without a resolvable http(s) origin_url are dropped, not linked', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    expect(src).toMatch(/\.filter\(\s*\(\s*e[^)]*\)\s*=>[\s\S]{0,120}origin_url[\s\S]{0,80}https\?/);
  });

  it('federation.ts: fetches are wrapped so an API failure cannot abort the build', () => {
    const src = readFileSync(FEDERATION_LIB, 'utf-8');
    const region = src.slice(src.indexOf('let sourceSlugs'));
    expect(region.slice(0, 400)).toMatch(/try\s*\{/);
    expect(region.slice(0, 900)).toMatch(/catch/);
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

describe('federation rot guard — built output', () => {
  const dist = resolve(ROOT, 'dist');
  const indexHtml = resolve(dist, 'federation/index.html');

  it('dist/federation/index.html: never ships a fabricated "91k" style claim', () => {
    if (!existsSync(indexHtml)) return; // source tests above still cover the invariant pre-build
    const html = readFileSync(indexHtml, 'utf-8');
    // Any real live total that happens to be ~91k is fine (it's real); what
    // must never appear is the exact historical rounded marketing figure
    // "91k+" as a symbol distinct from a live-rendered thousands-grouped
    // number (which would read e.g. "91,170", not "91k+").
    expect(html).not.toMatch(/91k\+/i);
  });

  it('dist/federation/index.html: if present, renders either a live count or the honest unavailable copy — never both silently omitted', () => {
    if (!existsSync(indexHtml)) return;
    const html = readFileSync(indexHtml, 'utf-8');
    const hasLiveCount = /externally indexed skills/i.test(html);
    const hasUnavailableCopy = /temporarily unavailable|could not be reached/i.test(html);
    expect(hasLiveCount || hasUnavailableCopy).toBe(true);
  });
});
