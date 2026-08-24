/**
 * Rot guard: no upstream repo inside a federation source bucket may be
 * rendered invisible by sampling.
 *
 * THE BUG THIS PINS (measured live 2026-08-24 against app.loopskill.io)
 * ----------------------------------------------------------------------
 * /federation/github/ requested exactly SAMPLE_CAP (80) rows from
 * GET /api/federation/filter?source=github. The API returns rows in slug
 * order, so the 80 that came back were 53 garrytan/gstack + 17
 * anthropics/skills + 10 huggingface/skills — and ZERO rows from
 * NVIDIA/skills, which is the LARGEST repo in that bucket at 299 of the 438
 * total rows. The biggest upstream tap on the page was literally absent from
 * the rendered HTML, and the page's only <h1> was the unsearchable phrase
 * "GitHub taps".
 *
 * THE INVARIANTS
 *   1. We over-fetch (FETCH_CAP > SAMPLE_CAP) before sampling — asking for
 *      exactly the render cap re-introduces the ordering bias.
 *   2. roundRobinSample() gives every distinct repo a slot in round 0, so no
 *      repo present in the data can be absent from the render.
 *   3. deriveRepos() is derived from live origin_urls only — never a
 *      hardcoded repo list (that would be a fabricated attribution, D-035).
 *   4. The source page NAMES its repos in <title>/description/JSON-LD, which
 *      is the entire SEO point; an anonymous bucket page is the regression.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  repoFromOriginUrl,
  deriveRepos,
  roundRobinSample,
  type FederationEntry,
} from '../src/lib/federation';

const ROOT = resolve(__dirname, '..');
const FEDERATION_LIB = resolve(ROOT, 'src/lib/federation.ts');
const SOURCE_PAGE = resolve(ROOT, 'src/pages/federation/[source]/index.astro');

function entry(slug: string, originUrl: string | null): FederationEntry {
  return {
    slug,
    title: slug,
    upstream_source: 'github',
    trust_level: 'trusted',
    license: null,
    tags: [],
    origin_url: originUrl,
  };
}

/** Reproduces the LIVE 2026-08-24 composition of `?source=github`:
 *  438 rows across 5 repos, returned in slug order so that the largest repo
 *  (NVIDIA/skills, 299) sorts LAST and gets truncated away by a naive
 *  first-N sample. */
function liveGithubBucket(): FederationEntry[] {
  const spec: Array<[string, number]> = [
    ['anthropics/skills', 17],
    ['garrytan/gstack', 53],
    ['huggingface/skills', 25],
    ['openai/skills', 44],
    ['NVIDIA/skills', 299],
  ];
  const out: FederationEntry[] = [];
  for (const [repo, n] of spec) {
    for (let i = 0; i < n; i++) {
      out.push(entry(`${repo.replace('/', '-')}-${i}`, `https://github.com/${repo}/tree/main/s${i}`));
    }
  }
  return out;
}

describe('repoFromOriginUrl', () => {
  it('extracts owner/repo from real GitHub origin URLs', () => {
    expect(repoFromOriginUrl('https://github.com/NVIDIA/skills/tree/main/x')).toBe('NVIDIA/skills');
    expect(repoFromOriginUrl('https://www.github.com/openai/skills')).toBe('openai/skills');
    expect(repoFromOriginUrl('https://github.com/garrytan/gstack.git')).toBe('garrytan/gstack');
    expect(repoFromOriginUrl('https://github.com/anthropics/skills?tab=readme')).toBe('anthropics/skills');
  });

  it('returns null rather than guessing for non-GitHub or missing origins', () => {
    expect(repoFromOriginUrl('https://clawhub.dev/listing/abc')).toBeNull();
    expect(repoFromOriginUrl('https://github.com/onlyowner')).toBeNull();
    expect(repoFromOriginUrl(null)).toBeNull();
    expect(repoFromOriginUrl(undefined)).toBeNull();
    expect(repoFromOriginUrl('' as unknown as string)).toBeNull();
  });
});

describe('deriveRepos', () => {
  it('derives the real repos from live data, largest first', () => {
    const repos = deriveRepos(liveGithubBucket());
    expect(repos.map((r) => r.repo)).toEqual([
      'NVIDIA/skills',
      'garrytan/gstack',
      'openai/skills',
      'huggingface/skills',
      'anthropics/skills',
    ]);
    expect(repos[0].count).toBe(299);
    // Counts must sum to the linkable rows — never invented.
    expect(repos.reduce((a, r) => a + r.count, 0)).toBe(438);
  });

  it('never invents a repo for entries with no GitHub origin', () => {
    expect(deriveRepos([entry('a', 'https://clawhub.dev/x'), entry('b', null)])).toEqual([]);
  });
});

describe('roundRobinSample — the invisibility fix', () => {
  it('REGRESSION: the largest repo is present in the sample (naive slice drops it)', () => {
    const all = liveGithubBucket();

    // The OLD behaviour, reproduced: first 80 in API order.
    const naive = all.slice(0, 80);
    const naiveRepos = new Set(naive.map((e) => repoFromOriginUrl(e.origin_url)));
    expect(naiveRepos.has('NVIDIA/skills')).toBe(false); // <- the bug

    const fixed = roundRobinSample(all, 80);
    const fixedRepos = new Set(fixed.map((e) => repoFromOriginUrl(e.origin_url)));
    expect(fixedRepos.has('NVIDIA/skills')).toBe(true);
  });

  it('every distinct repo present in the data appears in the sample', () => {
    const all = liveGithubBucket();
    const expected = new Set(all.map((e) => repoFromOriginUrl(e.origin_url)));
    const got = new Set(roundRobinSample(all, 80).map((e) => repoFromOriginUrl(e.origin_url)));
    expect(got).toEqual(expected);
  });

  it('respects the cap exactly and never duplicates an entry', () => {
    const sample = roundRobinSample(liveGithubBucket(), 80);
    expect(sample).toHaveLength(80);
    expect(new Set(sample.map((e) => e.slug)).size).toBe(80);
  });

  it('is deterministic across runs (reproducible builds)', () => {
    const a = roundRobinSample(liveGithubBucket(), 80).map((e) => e.slug);
    const b = roundRobinSample(liveGithubBucket(), 80).map((e) => e.slug);
    expect(a).toEqual(b);
  });

  it('passes through untouched when the data already fits under the cap', () => {
    const small = liveGithubBucket().slice(0, 12);
    expect(roundRobinSample(small, 80)).toEqual(small);
  });

  it('does not drop non-repo entries wholesale (mixed registries)', () => {
    const mixed = [
      ...Array.from({ length: 100 }, (_, i) => entry(`gh-${i}`, 'https://github.com/o/r/x')),
      ...Array.from({ length: 40 }, (_, i) => entry(`ch-${i}`, `https://clawhub.dev/${i}`)),
    ];
    const got = roundRobinSample(mixed, 80);
    expect(got.some((e) => repoFromOriginUrl(e.origin_url) === null)).toBe(true);
    expect(got).toHaveLength(80);
  });

  it('handles an empty bucket without throwing', () => {
    expect(roundRobinSample([], 80)).toEqual([]);
  });
});

describe('source shape — the guard must stay wired', () => {
  const lib = readFileSync(FEDERATION_LIB, 'utf-8');
  const pageSrc = readFileSync(SOURCE_PAGE, 'utf-8');

  /**
   * REGRESSION GUARD (cost a real build, 2026-08-24): the first cut of this
   * fix "over-fetched" with limit=500. The filter API hard-caps limit at 200
   * and returns HTTP 422 above it, so under this file's fail-closed contract
   * EVERY source resolved to zero sample rows, every source page was dropped
   * from the build, and dist/federation/ shipped with the index page only.
   * The build stayed green — the pages simply ceased to exist. Never request
   * more than the API's cap; page instead.
   */
  it('never requests more rows per call than the API accepts (limit cap = 200)', () => {
    const pageSize = Number(lib.match(/const PAGE_SIZE = (\d+)/)?.[1]);
    expect(pageSize).toBeGreaterThan(0);
    expect(pageSize).toBeLessThanOrEqual(200);
  });

  it('paginates with an offset instead of one oversized request', () => {
    expect(lib).toMatch(/limit=\$\{PAGE_SIZE\}&offset=\$\{page \* PAGE_SIZE\}/);
    expect(lib).not.toMatch(/limit=\$\{SAMPLE_CAP\}/);
  });

  it('pagination is bounded so a huge upstream cannot hang the build', () => {
    const maxPages = Number(lib.match(/const MAX_PAGES = (\d+)/)?.[1]);
    expect(maxPages).toBeGreaterThan(1);
    expect(maxPages).toBeLessThanOrEqual(20);
    expect(lib).toMatch(/page < MAX_PAGES/);
  });

  it('stops early on a short page (no pointless extra round-trips)', () => {
    expect(lib).toMatch(/results\.length < PAGE_SIZE\) break/);
  });

  it('fetchSourceSample routes through roundRobinSample', () => {
    expect(lib).toMatch(/sample: roundRobinSample\(linkable, SAMPLE_CAP\)/);
  });

  it('the overview attaches derived repos to every source page', () => {
    expect(lib).toMatch(/repos: s\.repos/);
  });

  /**
   * Repo ranking must come from the FULL collected set, never the capped
   * sample. round-robin deliberately evens the sample out (17/17/17/17/17 on
   * the live github bucket), so ranking by it ordered the repos
   * ~alphabetically and put "anthropics, garrytan" in the <title> while
   * NVIDIA — 299 of the 438 real rows — came third. Ranking by true size is
   * the difference between naming the biggest upstream and burying it.
   */
  it('ranks repos by TRUE size, not by the evened-out sample', () => {
    expect(lib).toMatch(/repos: deriveRepos\(linkable\)/);
    expect(lib).not.toMatch(/deriveRepos\(s\.sample\)/);
  });

  it('never hardcodes an upstream repo name as data (must be derived)', () => {
    const code = lib.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    for (const repo of ['NVIDIA/skills', 'openai/skills', 'anthropics/skills', 'garrytan/gstack']) {
      expect(code).not.toContain(repo);
    }
  });

  it('the source page names its real repos in title, description and JSON-LD', () => {
    expect(pageSrc).toMatch(/orgNames/);
    expect(pageSrc).toMatch(/repoNames\.slice\(0, 4\)\.join/);
    expect(pageSrc).toMatch(/codeRepository/);
    // and renders them visibly for humans, not just crawlers
    expect(pageSrc).toMatch(/Upstream repositories in this source/);
  });
});
