/**
 * Unit tests for src/lib/federatedCounts.ts (issue #82).
 *
 * Locks three things:
 *  1. The LIVE contract — the shape /api/skills/external returns today
 *     (verified live 2026-08-21: enabled_sources = 7 entries,
 *     counts.external_installable = 20994, well-known enabled but returning
 *     zero rows) renders `federated · 7 registries · 20,994 skills ·
 *     install as-is`.
 *  2. Fail-closed degradation — missing envelope (the shape the jsdom
 *     browse test stubs), missing counts, and zero-row sources never
 *     fabricate a number.
 *  3. Hostile input — strings in numeric fields, script payloads, NaN,
 *     negatives, floats, arrays-as-length. None of it can reach the DOM.
 */
import { describe, it, expect } from 'vitest';
import {
  federatedCountsFromFeed,
  federatedHeaderSuffix,
  type FederatedFeedEnvelope,
  type FederatedRow,
} from '../src/lib/federatedCounts';

const liveRows: FederatedRow[] = [
  { source: 'clawhub' }, { source: 'clawhub' }, { source: 'skills-sh' },
  { source: 'hermes-hub' }, { source: 'hermes-hub' }, { source: 'lobehub' },
];

describe('federatedCountsFromFeed — live contract (issue #82)', () => {
  it('binds registry count to envelope enabled_sources and skill count to counts.external_installable', () => {
    const d: FederatedFeedEnvelope = {
      enabled_sources: ['hermes-hub', 'skills-sh', 'well-known', 'clawhub', 'lobehub', 'browse-sh', 'github-oss'],
      counts: { external_installable: 20994 },
    };
    const c = federatedCountsFromFeed(d, liveRows);
    expect(c.sourceCount).toBe(7);
    expect(c.skillCount).toBe(20994);
  });

  it('counts ENABLED registries, not distinct row sources — a zero-row source (well-known today) still counts', () => {
    // 7 enabled, only 6 present in rows — the old "7" was right by luck;
    // deriving from rows would undercount the moment a source pauses and
    // counts it as removed.
    const d: FederatedFeedEnvelope = {
      enabled_sources: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      counts: { external_installable: 5 },
    };
    expect(federatedCountsFromFeed(d, liveRows).sourceCount).toBe(7);
  });

  it('renders the full header for the live payload shape', () => {
    const c = federatedCountsFromFeed({
      enabled_sources: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      counts: { external_installable: 20994 },
    }, liveRows);
    expect(federatedHeaderSuffix(c)).toBe('federated · 7 registries · 20,994 skills · install as-is');
  });

  it('pluralizes one registry correctly', () => {
    const c = federatedCountsFromFeed({ enabled_sources: ['only'], counts: { external_installable: 1 } }, [{ source: 'only' }]);
    expect(federatedHeaderSuffix(c)).toBe('federated · 1 registry · 1 skill · install as-is');
  });
});

describe('federatedCountsFromFeed — fail-closed degradation', () => {
  it('row-only payload (the jsdom stub shape) falls back to distinct row sources and omits the skill segment', () => {
    const c = federatedCountsFromFeed({ external: [] }, liveRows);
    expect(c.sourceCount).toBe(4); // clawhub, skills-sh, hermes-hub, lobehub
    expect(c.skillCount).toBeNull();
    expect(federatedHeaderSuffix(c)).toBe('federated · 4 registries · install as-is');
  });

  it('null/undefined payload degrades to row-derived count, no skill count', () => {
    expect(federatedCountsFromFeed(null, liveRows)).toEqual({ sourceCount: 4, skillCount: null });
    expect(federatedCountsFromFeed(undefined, liveRows)).toEqual({ sourceCount: 4, skillCount: null });
  });

  it('envelope present but counts missing → skill segment omitted, never guessed from capped rows', () => {
    const c = federatedCountsFromFeed({ enabled_sources: ['a', 'b'] }, liveRows);
    expect(c.skillCount).toBeNull();
    expect(federatedHeaderSuffix(c)).not.toContain('skills');
  });

  it('zero enabled sources with rows present counts distinct row sources', () => {
    const c = federatedCountsFromFeed({ enabled_sources: [] }, [{ source: 'x' }]);
    expect(c.sourceCount).toBe(1);
  });

  it('empty/null rows with no envelope → sourceCount 0 → suffix drops the registry segment', () => {
    expect(federatedCountsFromFeed({}, []).sourceCount).toBe(0);
    expect(federatedHeaderSuffix(federatedCountsFromFeed({}, []))).toBe('federated · install as-is');
  });

  it('rows without source field bucket as community (never NaN/undefined)', () => {
    const c = federatedCountsFromFeed({}, [{}, { source: 'x' }, {}]);
    expect(c.sourceCount).toBe(2); // 'community' + 'x'
  });

  it('large counts format with thousands separators', () => {
    const c = federatedCountsFromFeed({ enabled_sources: ['a'], counts: { external_installable: 91170 } }, liveRows);
    expect(federatedHeaderSuffix(c)).toContain('91,170 skills');
  });
});

describe('federatedCountsFromFeed — hostile input (breaker attacks)', () => {
  it('script payload in external_installable never reaches output', () => {
    const c = federatedCountsFromFeed({
      enabled_sources: ['a'],
      counts: { external_installable: '7<script>alert(1)</script>' as unknown as number },
    }, liveRows);
    expect(c.skillCount).toBeNull();
    const out = federatedHeaderSuffix(c);
    expect(out).not.toContain('<');
    expect(out).not.toContain('script');
  });

  it('script payload in enabled_sources array never reaches output', () => {
    const c = federatedCountsFromFeed({
      enabled_sources: ['<img src=x onerror=alert(1)>'] as unknown as string[],
      counts: { external_installable: 3 },
    }, []);
    // 1 source (count only — the slug VALUE is never interpolated), so this
    // is safe, but assert the value itself never appears anywhere.
    expect(federatedHeaderSuffix(c)).not.toContain('<');
    expect(federatedHeaderSuffix(c)).not.toContain('onerror');
  });

  it('NaN / negative / zero / float installable counts are all rejected', () => {
    for (const bad of [NaN, -5, 0, 3.7, 'nan', null]) {
      const c = federatedCountsFromFeed({ enabled_sources: ['a'], counts: { external_installable: bad as never } }, []);
      expect(c.skillCount, `external_installable=${String(bad)} must be rejected`).toBeNull();
    }
  });

  it('enabled_sources as non-array is ignored (row fallback kicks in)', () => {
    const c = federatedCountsFromFeed({ enabled_sources: 'seven' as unknown as string[] }, liveRows);
    expect(c.sourceCount).toBe(4);
  });

  it('counts as null is tolerated', () => {
    const c = federatedCountsFromFeed({ enabled_sources: ['a'], counts: null as never }, []);
    expect(c.skillCount).toBeNull();
  });
});
