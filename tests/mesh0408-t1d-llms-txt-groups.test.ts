/**
 * mesh0408 T1-D — llms.txt carries explicit per-type sections for bundles,
 * personalities, and connectors.
 *
 * WHY THIS FILE EXISTS: the mesh0408 cold-discovery canary asserts, for each
 * of the five unified-search groups (skills, loops, bundles, personalities,
 * connectors), that the type appears in an EXPLICIT per-type /llms.txt
 * listing — not "where applicable" (an earlier plan revision's untestable
 * ambiguity, deliberately deleted). Before this phase, llms.txt.ts fetched
 * and rendered skills, loops, and composite-loops, but bundles and
 * personalities had zero machine-discovery presence, and connectors (a brand
 * new artifact type shipped alongside T1-C) had none at all.
 *
 * Two layers, same as the sibling browse-renders test:
 *   (a) STRUCTURAL — the built dist/llms.txt actually contains a "## Bundles"
 *       / "## Personalities" / "## Connectors" heading with the right
 *       endpoints named. Requires a build (`npm run build`) to have produced
 *       dist/; skips with a loud message when dist is absent so a bare
 *       `vitest run` on a fresh clone does not report a false failure.
 *   (b) SOURCE — the fetch calls and section-builder logic exist in
 *       llms.txt.ts, so a future refactor that silently drops a group is
 *       caught even before a build is run.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const LLMS_DIST = join(ROOT, 'dist/llms.txt');
const LLMS_SRC = join(ROOT, 'src/pages/llms.txt.ts');

const built = existsSync(LLMS_DIST);

describe('llms.txt.ts source — five-group fetch + render wiring', () => {
  const src = readFileSync(LLMS_SRC, 'utf-8');

  it('fetches public bundles (/api/cookbooks/discover)', () => {
    expect(src).toContain('/api/cookbooks/discover');
  });

  it('fetches public personalities (/api/personalities)', () => {
    expect(src).toMatch(/fetchApi<CatalogPersonality\[\]>\('\/api\/personalities'/);
  });

  it('names the connectors endpoints even though the table can be empty', () => {
    expect(src).toContain('/api/connectors');
    expect(src).toContain('## Connectors');
  });

  it('every new section is spliced into the rendered body template', () => {
    expect(src).toContain('${bundlesSection}${personalitiesSection}${connectorsSection}');
  });
});

(built ? describe : describe.skip)('llms.txt (built dist) — five explicit per-type sections', () => {
  const txt = built ? readFileSync(LLMS_DIST, 'utf-8') : '';

  it('has a Bundles heading naming the discover + detail endpoints', () => {
    expect(txt).toContain('## Bundles');
    expect(txt).toContain('/api/cookbooks/discover');
    expect(txt).toContain('/api/cookbooks/public/{slug}');
  });

  it('has a Personalities heading naming the list + detail endpoints', () => {
    expect(txt).toContain('## Personalities');
    expect(txt).toContain('GET https://app.loopskill.io/api/personalities`');
    expect(txt).toContain('/api/personalities/{slug}');
  });

  it('has a Connectors heading naming the list + detail endpoints (empty table OK)', () => {
    expect(txt).toContain('## Connectors');
    expect(txt).toContain('GET https://app.loopskill.io/api/connectors`');
    expect(txt).toContain('/api/connectors/{slug}');
  });

  it('the five type sections appear in catalog order after the skill install line', () => {
    const idx = {
      install: txt.indexOf('Install (returns a signed tarball)'),
      loops: txt.indexOf('## Runnable loops'),
      composites: txt.indexOf('## Composite loops'),
      bundles: txt.indexOf('## Bundles'),
      personalities: txt.indexOf('## Personalities'),
      connectors: txt.indexOf('## Connectors'),
    };
    for (const [name, pos] of Object.entries(idx)) {
      expect(pos, `${name} section missing from built llms.txt`).toBeGreaterThan(-1);
    }
    expect(idx.bundles).toBeGreaterThan(idx.install);
    expect(idx.personalities).toBeGreaterThan(idx.bundles);
    expect(idx.connectors).toBeGreaterThan(idx.personalities);
  });
});
