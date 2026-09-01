// fedtotal_0901 — llms.txt must publish the SERVER's federated total.
//
// Context (real production defect, 2026-09-01): llms.txt advertised
// "91k+ / 91,362 indexed" while the API's own dedupe-aware total had grown to
// a different value. Worse, a naive client-side sum of `per_source.indexed`
// yields 188,346 — it double-counts the direct clawhub walk (77,017) against
// the hub snapshot's clawhub rows.
//
// The rule this file enforces: the portal NEVER computes the federated total
// itself. It reads `counts.federated_skills_total` from
// /api/marketing/snapshot — one server-side function
// (federation_cache.sum_federated_total) is the sole author of that number.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src/pages/llms.txt.ts'),
  'utf-8',
);

describe('llms.txt federated total provenance', () => {
  it('reads federated_skills_total from the marketing snapshot', () => {
    expect(SRC).toContain('federated_skills_total');
    expect(SRC).toMatch(
      /counts\?\.federated_skills_total === 'number'[\s\S]{0,80}counts\.federated_skills_total/,
    );
  });

  it('declares the new snapshot count fields on the typed interface', () => {
    for (const field of [
      'federated_skills_total',
      'total_reachable_skills',
      'personalities_total',
      'connectors_total',
    ]) {
      expect(SRC).toContain(field);
    }
  });

  it('never sums per_source client-side (that double-counts clawhub)', () => {
    // A reduce/sum over per_source is precisely the 188,346 bug.
    expect(SRC).not.toMatch(/per_source[\s\S]{0,200}\.reduce\(/);
    expect(SRC).not.toMatch(/Object\.values\([^)]*per_source[^)]*\)[\s\S]{0,120}reduce/);
  });

  it('keeps the honest-degradation fallback chain (never a hardcoded number)', () => {
    // Falls back to the API's own total, then omits the section entirely.
    expect(SRC).toContain('external_indexed');
    // No hardcoded five-figure skill count anywhere in the source.
    const hardcoded = SRC.match(/\b(?:9[0-9]|1[0-9]{2})[,_]?[0-9]{3}\b/g) ?? [];
    const offenders = hardcoded.filter((n) => !/^(?:2026|1000)$/.test(n));
    expect(
      offenders,
      `hardcoded catalog-size numbers found: ${offenders.join(', ')}`,
    ).toHaveLength(0);
  });

  it('surfaces personalities + connectors counts from the snapshot', () => {
    expect(SRC).toContain('counts?.personalities_total');
    expect(SRC).toContain('counts?.connectors_total');
  });

  it('connector "intentionally empty" note is data-driven, not hardcoded prose', () => {
    // The stale-claim trap: once a connector is published, an unconditional
    // "intentionally empty" line becomes a lie.
    expect(SRC).toContain('connectorsNote');
    expect(SRC).toMatch(/connectorCount[\s\S]{0,120}>\s*0/);
  });
});
