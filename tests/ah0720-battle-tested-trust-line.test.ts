/**
 * atomic-habits 2026-07-20 rank-8 REVENUE/CATALOG — "Battle-tested • N runs"
 * social-proof trust line on loop cards.
 *
 * All 10 fallback-verifier loops on /api/loops show rating_count:0/
 * rating_avg:null (empty stars = weak conversion signal) but several already
 * carry real run_count (repo-steward-loop=1, secret-scan-loop=5, etc). This
 * derives a "Battle-tested" trust line from data already in the API response
 * — no schema/API change, no tier/Stripe touch.
 *
 * Two call sites carry the (duplicated, by design — see comments in both
 * files) loop-meta logic:
 *   1. src/lib/artifactCard.ts::artifactMeta() — real importable function,
 *      exercised directly below with unit assertions.
 *   2. src/pages/browse.astro inline artifactMeta() — client-side JS embedded
 *      in an .astro file, not importable; asserted via source-string checks
 *      matching the existing test-suite convention (see
 *      composer-skill-preview.test.ts).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { artifactMeta } from '../src/lib/artifactCard';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const BROWSE = join(ROOT, 'src', 'pages', 'browse.astro');
const HOME = join(ROOT, 'src', 'pages', 'home.astro');

describe('Battle-tested trust line — artifactCard.ts (importable unit)', () => {
  it('renders "Battle-tested • N runs" when run_count > 0', () => {
    expect(artifactMeta('loop', { run_count: 1 })).toBe('Battle-tested · 1 run');
    expect(artifactMeta('loop', { run_count: 5 })).toBe('Battle-tested · 5 runs');
  });

  it('falls back to "Not yet run" when run_count is 0 or missing', () => {
    expect(artifactMeta('loop', { run_count: 0 })).toBe('Not yet run');
    expect(artifactMeta('loop', {})).toBe('Not yet run');
  });

  it('pluralizes correctly at the boundary (1 vs 2+)', () => {
    expect(artifactMeta('loop', { run_count: 1 })).not.toContain('runs');
    expect(artifactMeta('loop', { run_count: 2 })).toContain('runs');
  });
});

describe('Battle-tested trust line — browse.astro (source assertion)', () => {
  const src = existsSync(BROWSE) ? readFileSync(BROWSE, 'utf-8') : '';

  it('browse.astro exists', () => {
    expect(existsSync(BROWSE)).toBe(true);
  });

  it('fallback-verifier loop meta uses the Battle-tested trust line', () => {
    expect(src).toContain('Battle-tested · ${n} run${n === 1');
  });

  it('still falls back to "Not yet run" for zero-run loops', () => {
    expect(src).toContain("'Not yet run'");
  });
});

describe('Battle-tested trust line — home.astro shelf (source assertion)', () => {
  const src = existsSync(HOME) ? readFileSync(HOME, 'utf-8') : '';

  it('home.astro exists', () => {
    expect(existsSync(HOME)).toBe(true);
  });

  it('loops shelf meta uses the Battle-tested trust line', () => {
    expect(src).toContain('Battle-tested · ${n} run${n === 1');
  });
});
