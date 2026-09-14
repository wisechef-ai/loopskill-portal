/**
 * fedagg_0914 — the /federation/ source table must not double-count.
 *
 * DEFECT (live-confirmed 2026-09-14, app.loopskill.io/federation/):
 * the "Upstream sources" table listed `hermes-hub` (100,361) as a PEER row
 * alongside `clawhub` (78,263) and `skills-sh` (20,000). Summing the visible
 * column gave ~199,000 against a real de-duplicated index of 100,361.
 *
 * `hermes-hub` is not an upstream source — it is an AGGREGATOR WRAPPER.
 * Evidence gathered by full enumeration of the federated index
 * (GET /api/federation/filter, all 100,361 rows walked 2026-09-14):
 *   - `?source=hermes-hub`            -> 0 rows
 *   - every row's `federated_source`  -> "hermes-hub"
 *   - those rows' real `upstream_source` decomposition:
 *       clawhub 78,243 · skills-sh 20,000 · github 1,001 ·
 *       lobehub 505 · browse-sh 467 · official 145  = 100,361 exactly
 * i.e. the hermes-hub row *contains* the clawhub/skills-sh rows; listing all
 * of them in one unlabelled column is an overlapping sum on a public page.
 *
 * The API itself already carries the honest figure the portal was ignoring:
 * `per_source['hermes-hub'].deduped_indexed`.
 *
 * These tests pin the contract so the class cannot silently return.
 */
import { describe, it, expect } from 'vitest';
import {
  AGGREGATOR_SLUGS,
  isAggregatorSource,
  directTapTotal,
  SOURCE_META_TEST_VIEW,
} from '../src/lib/federation';

describe('fedagg_0914 — aggregator sources are flagged, never summed as peers', () => {
  it('hermes-hub is classified as an aggregator, not an upstream source', () => {
    expect(AGGREGATOR_SLUGS.has('hermes-hub')).toBe(true);
    expect(isAggregatorSource('hermes-hub')).toBe(true);
  });

  it('real upstream registries are NOT flagged as aggregators', () => {
    for (const slug of ['clawhub', 'skills-sh', 'lobehub', 'browse-sh', 'github-anthropic']) {
      expect(isAggregatorSource(slug)).toBe(false);
    }
  });

  it('directTapTotal excludes aggregator rows so the column cannot double-count', () => {
    // Shape mirrors the live 2026-09-14 payload, trimmed to the rows that matter.
    const sources = [
      { slug: 'hermes-hub', total: 100361 },
      { slug: 'clawhub', total: 78263 },
      { slug: 'skills-sh', total: 20000 },
      { slug: 'lobehub', total: 100 },
      { slug: 'browse-sh', total: 100 },
    ];
    const sum = directTapTotal(sources);
    // 78263 + 20000 + 100 + 100 — the aggregator's 100,361 must not be added.
    expect(sum).toBe(98463);
    expect(sum).toBeLessThan(100361 + 78263); // the old ~199k bug
  });

  it('the hermes-hub description no longer calls it an upstream source', () => {
    const desc = SOURCE_META_TEST_VIEW['hermes-hub']?.description ?? '';
    expect(desc.length).toBeGreaterThan(0);
    // The old copy: "the largest single upstream source in the federated index."
    expect(desc.toLowerCase()).not.toContain('largest single upstream source');
    // It must instead disclose the overlap.
    expect(desc.toLowerCase()).toMatch(/aggregat|re-?index|wrapper|already counted|overlap/);
  });
});
