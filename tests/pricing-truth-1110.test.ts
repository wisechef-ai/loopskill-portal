/**
 * perclient_1110 / M0.5 — the pricing copy must tell the measured truth.
 *
 * WHAT WAS FALSE
 * --------------
 * /pricing said "Private bundles: Free gives you 2, Pro gives you 50. That is
 * the whole difference." and never mentioned API keys. Measured 2026-10-11
 * (~/.hermes/state/perclient_1110/M1-transcript.md, M1.3.md, M1.7.md) and
 * pinned by config/tiers.yaml in loopskill-api:
 *
 *   1. TWO limits differ: private bundles (Free 2, Pro 50) AND API keys
 *      (Free 1, Pro 10). Pro ALSO gates the hosted authoring/deploy tools in
 *      code (forks_routes require_operator, recipify _is_paid_tier,
 *      sse_routes subscribe; bundle_deployment is gated too but is a non-working
 *      surface the claims audit forbids advertising) — so
 *      the page must never say "everything else is identical". What IS the
 *      same: every catalog skill is free, and install/update works on both.
 *   2. The Liked bundle is private and is created the first time you open your
 *      Library (GET /api/bundles → ensure_liked_bundle), so from then on it
 *      uses one of the private-bundle slots — on Free that leaves room for one
 *      more (loopskill-api#398).
 *   3. One API key works on several machines at once (6/6 concurrent calls OK
 *      from two machines). Separate keys are a revocation convenience, never a
 *      requirement — copy must not say you need one key per machine.
 *
 * Static-source assertions, matching the repo's existing pattern for page
 * copy (e.g. issue247-fleet-key-cap-upgrade-wall.test.ts).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const PAGES = join(ROOT, 'src', 'pages');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf-8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('no page claims bundles are the only Free/Pro difference', () => {
  const files = walk(PAGES);

  it('scans a real page tree (control)', () => {
    expect(files.some((f) => f.endsWith('pricing.astro'))).toBe(true);
  });

  it('no file under src/pages contains "whole difference"', () => {
    const hits = files.filter((f) => /whole difference/i.test(readFileSync(f, 'utf-8')));
    expect(hits).toEqual([]);
  });

  it('no file under src/pages contains "only difference"', () => {
    const hits = files.filter((f) => /only difference/i.test(readFileSync(f, 'utf-8')));
    expect(hits).toEqual([]);
  });

  it('no file under src/pages says you need one key per machine', () => {
    const hits = files.filter((f) =>
      /(need|one) (an )?(api )?key (per|for each) machine/i.test(readFileSync(f, 'utf-8')),
    );
    expect(hits).toEqual([]);
  });
});

describe('pricing.astro states both caps and the Liked-bundle rule', () => {
  const src = read('src', 'pages', 'pricing.astro');

  it('the Free/Pro answer names API keys with the caps Free 1 / Pro 10', () => {
    expect(src).toMatch(/API keys: Free 1, Pro 10/);
  });

  it('the Free/Pro answer still names private bundles Free 2 / Pro 50', () => {
    expect(src).toMatch(/Private bundles: Free 2, Pro 50/);
  });

  it('says the Liked list is a private bundle that counts once you open your Library', () => {
    expect(src).toMatch(/Liked list is a private bundle and counts as one from the moment you open your Library/);
  });

  it('says one key works on every machine (no per-machine key requirement)', () => {
    expect(src).toMatch(/one key works on every machine/i);
  });

  it('the Free card lists 1 API key and the Pro card lists 10 API keys', () => {
    expect(src).toMatch(/'1 API key\b/);
    expect(src).toMatch(/'10 API keys/);
  });

  it('the page meta description mentions API keys', () => {
    const desc = src.match(/<AppShell[^>]*description="([^"]*)"/)?.[1] ?? '';
    expect(desc).toMatch(/API keys/);
  });
});

describe('docs pages that compare Free and Pro include API keys', () => {
  it('docs/getting-started pricing list names 1 vs 10 API keys', () => {
    const src = read('src', 'pages', 'docs', 'getting-started.astro');
    expect(src).toMatch(/<strong>Free:<\/strong>[^<]*1 API key/);
    expect(src).toMatch(/<strong>Pro \(\$9\.95\/mo\):<\/strong>[^<]*10 API keys/);
  });

  it('docs/cookbooks explains the Liked bundle uses a private slot', () => {
    const src = read('src', 'pages', 'docs', 'cookbooks.astro');
    expect(src).toMatch(/Liked/);
  });

  it('never claims the tiers are otherwise identical (Pro gates authoring/deploy tools in code)', () => {
    const banned = /identical platform|every capability is identical|everything else is identical/i;
    const hits = walk(PAGES).filter((f) => banned.test(readFileSync(f, 'utf-8')));
    expect(hits).toEqual([]);
  });

  it('names the Pro-only hosted tools (fork, draft-to-skill, live sync) and never bundle deploys', () => {
    const src = read('src', 'pages', 'pricing.astro');
    expect(src).toMatch(/forking a skill into your own editable copy/i);
    expect(src).toMatch(/turning a draft into a skill/i);
    // bundle-deploy is Pro-gated in code but has no working terminal state
    // (audit-claims rule bundle-deployment) — it must NOT be advertised.
    expect(src).not.toMatch(/bundle deploy/i);
    expect(src).toMatch(/live sync subscription/i);
  });

  it('says catalog skills are free on both tiers and install/update works the same', () => {
    const src = read('src', 'pages', 'pricing.astro');
    expect(src).toMatch(/every catalog skill is free on both tiers/i);
    expect(src).toMatch(/installing or updating a bundle on your machines works the same on both/i);
  });
});
