/**
 * Phase I — docs sweep regression tests.
 *
 * Part 1 (carousel client-side fetch) was removed in autopilot_0308 M0
 * (hub D-007) along with the carousel section it tested — see
 * src/pages/index.astro history and tests/pick-1605-carousel.test.ts
 * (deleted in the same phase).
 *
 * Part 2: Docs pages meet LOC targets and contain required content.
 *
 * Part 3: ops/install-rebuild-timer.sh exists and contains required systemd snippets.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const DOCS = join(ROOT, 'src/pages/docs');
const OPS = join(ROOT, 'ops/install-rebuild-timer.sh');

// ---------------------------------------------------------------------------
// Part 2: Docs page LOC targets
// ---------------------------------------------------------------------------

function countLines(file: string): number {
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf-8').split('\n').length;
}

describe('Docs pages LOC targets (Phase I)', () => {
  it('getting-started.astro ≥150 lines', () => {
    expect(countLines(join(DOCS, 'getting-started.astro'))).toBeGreaterThanOrEqual(150);
  });

  it('how-it-works.astro ≥150 lines', () => {
    expect(countLines(join(DOCS, 'how-it-works.astro'))).toBeGreaterThanOrEqual(150);
  });

  it('security.astro ≥150 lines', () => {
    expect(countLines(join(DOCS, 'security.astro'))).toBeGreaterThanOrEqual(150);
  });

  it('api-reference.astro ≥200 lines', () => {
    expect(countLines(join(DOCS, 'api-reference.astro'))).toBeGreaterThanOrEqual(200);
  });

  it('publishing.astro ≥200 lines', () => {
    expect(countLines(join(DOCS, 'publishing.astro'))).toBeGreaterThanOrEqual(200);
  });

  it('new-agent.astro ≥150 lines', () => {
    expect(countLines(join(DOCS, 'new-agent.astro'))).toBeGreaterThanOrEqual(150);
  });

  it('creator-workflow.astro exists and ≥200 lines', () => {
    expect(existsSync(join(DOCS, 'creator-workflow.astro'))).toBe(true);
    expect(countLines(join(DOCS, 'creator-workflow.astro'))).toBeGreaterThanOrEqual(200);
  });

  it('fleet.astro exists and ≥150 lines', () => {
    expect(existsSync(join(DOCS, 'fleet.astro'))).toBe(true);
    expect(countLines(join(DOCS, 'fleet.astro'))).toBeGreaterThanOrEqual(150);
  });
});

// ---------------------------------------------------------------------------
// Part 2: No vaporware in docs
// ---------------------------------------------------------------------------

describe('No vaporware in docs (Phase I)', () => {
  const docsFiles = [
    'getting-started.astro',
    'how-it-works.astro',
    'security.astro',
    'api-reference.astro',
    'publishing.astro',
    'new-agent.astro',
    'creator-workflow.astro',
    'fleet.astro',
  ];

  for (const file of docsFiles) {
    const filePath = join(DOCS, file);
    it(`${file}: no "24h review" vaporware`, () => {
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/24h review/i);
    });

    it(`${file}: no "/dashboard earnings" vaporware`, () => {
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/\/dashboard.*earnings/i);
    });
  }
});

// ---------------------------------------------------------------------------
// Part 2: Key content checks in docs
// ---------------------------------------------------------------------------

describe('Docs content requirements (Phase I) [REVISED — loopskill_0622 rebrand]', () => {
  // STALE: the loopskill_0622 rebrand (commit 61756f7, "portal chrome +
  // brand strings Recipes -> LoopSkill") renamed every product-prefixed MCP
  // tool name from recipes_* to loopskill_* across the docs pages — e.g.
  // publishing.astro's own file now says (see its own H2) "Step 5 — Submit
  // via loopskill_publish_request" and fleet.astro documents
  // loopskill_fleet_create / loopskill_fleet_subscribe throughout. These
  // tests were pinned to the pre-rebrand recipes_* names and never updated
  // when the rename shipped; the current tool names are the correct,
  // deliberate ones.
  it('publishing.astro mentions loopskill_publish_request MCP tool', () => {
    const src = readFileSync(join(DOCS, 'publishing.astro'), 'utf-8');
    expect(src).toContain('loopskill_publish_request');
  });

  it('fleet.astro mentions loopskill_fleet_create tool', () => {
    if (!existsSync(join(DOCS, 'fleet.astro'))) return;
    const src = readFileSync(join(DOCS, 'fleet.astro'), 'utf-8');
    expect(src).toContain('loopskill_fleet_create');
  });

  it('fleet.astro mentions loopskill_fleet_subscribe tool', () => {
    if (!existsSync(join(DOCS, 'fleet.astro'))) return;
    const src = readFileSync(join(DOCS, 'fleet.astro'), 'utf-8');
    expect(src).toContain('loopskill_fleet_subscribe');
  });

  it('security.astro mentions rec_fleet key prefix', () => {
    const src = readFileSync(join(DOCS, 'security.astro'), 'utf-8');
    expect(src).toContain('rec_fleet');
  });

  it('creator-workflow.astro mentions loopskill_publish_request', () => {
    if (!existsSync(join(DOCS, 'creator-workflow.astro'))) return;
    const src = readFileSync(join(DOCS, 'creator-workflow.astro'), 'utf-8');
    expect(src).toContain('loopskill_publish_request');
  });

  it('getting-started.astro covers multiple integration paths (Hermes, Claude Desktop, Codex)', () => {
    const src = readFileSync(join(DOCS, 'getting-started.astro'), 'utf-8');
    expect(src).toContain('Hermes');
    expect(src).toContain('Claude Desktop');
    expect(src).toContain('Codex');
  });
});

// ---------------------------------------------------------------------------
// Part 3: nightly scheduled rebuild (replaces the dead rebuild timer)
// ---------------------------------------------------------------------------

describe('nightly scheduled rebuild (fix/277, 2026-08-25) [REVISED]', () => {
  // The old Part 3 pinned ops/install-rebuild-timer.sh — a script that was
  // DEAD ON ARRIVAL: it targeted /home/wisechef/recipes-portal (the archived
  // product's path; prod serves /home/wisechef/loopskill-portal/dist) and was
  // never installed on the host (verified: systemctl list-timers shows only
  // recipes-carousel timers). It was deleted in fix/277 and replaced by a
  // scheduled trigger inside .github/workflows/ci.yml, which already owns the
  // atomic-swap deploy path this repo actually uses.
  const CI = join(ROOT, '.github', 'workflows', 'ci.yml');

  it('ci.yml exists', () => {
    expect(existsSync(CI)).toBe(true);
  });

  it('declares the nightly schedule trigger', () => {
    const src = readFileSync(CI, 'utf-8');
    expect(src).toMatch(/schedule:\s*\n\s*-\s*cron:\s*"20 3 \* \* \*"/);
  });

  it('deploy steps accept scheduled runs, not just push', () => {
    const src = readFileSync(CI, 'utf-8');
    // The old gate `== 'push'` alone would skip every deploy step on a
    // scheduled run — a silent no-op nightly rebuild.
    expect(src).toContain("github.event_name == 'push' || github.event_name == 'schedule'");
    expect(src).not.toMatch(/event_name == 'push'\s*\}\)/);
  });

  it('the dead timer script is gone', () => {
    expect(existsSync(join(ROOT, 'ops', 'install-rebuild-timer.sh'))).toBe(false);
  });
});
