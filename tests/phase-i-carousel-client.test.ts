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
// Part 3: ops/install-rebuild-timer.sh
// ---------------------------------------------------------------------------

describe('ops/install-rebuild-timer.sh (Phase I)', () => {
  it('file exists', () => {
    expect(existsSync(OPS)).toBe(true);
  });

  it('contains OnCalendar=*-*-* 04:30:00 Europe/London', () => {
    if (!existsSync(OPS)) return;
    const src = readFileSync(OPS, 'utf-8');
    expect(src).toContain('04:30:00');
    expect(src).toContain('Europe/London');
  });

  it('contains systemctl restart caddy', () => {
    if (!existsSync(OPS)) return;
    const src = readFileSync(OPS, 'utf-8');
    expect(src).toContain('systemctl restart caddy');
  });

  it('is idempotent (uses tee or cat > for file creation)', () => {
    if (!existsSync(OPS)) return;
    const src = readFileSync(OPS, 'utf-8');
    // Either writes with tee or cat heredoc — idempotent re-run
    expect(src).toMatch(/tee|cat >/);
  });

  it('contains npm ci with fallback on failure', () => {
    if (!existsSync(OPS)) return;
    const src = readFileSync(OPS, 'utf-8');
    expect(src).toContain('npm ci');
  });
});
