/**
 * Phase M3 (autopilot_0308) — launch identity + dead-link hygiene lock.
 *
 * D-018 #5: LoopSkill's launch identity is standalone — no "by WiseChef"
 * claim on public or machine-readable surfaces (protects Adam's
 * employed -> no-internal-claims constraint). Separately, three public
 * links pointed at repos that are dead for LoopSkill's purposes:
 * `recipes-portal` (archived + now private) and `recipes-skill` (a
 * different, unrelated product — the Recipes meta-skill) are not where
 * LoopSkill's issues or source live; `loopskill-api` is.
 *
 * Scope note: this intentionally does NOT touch Footer.astro, CrossSell.astro,
 * account.astro, or billing/success.astro. Those render an explicit "built by
 * WiseChef" / cross-sell disclosure that is a different, cross-product
 * marketing decision (same class as the pricing.astro WiseChef Framework
 * banner) — flagged for Adam, not unilaterally changed here.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

describe('launch identity — no "by WiseChef" on standalone LoopSkill surfaces', () => {
  it('the skill-detail author fallback does not attribute to WiseChef', () => {
    const src = read('src/pages/skills/[slug].astro');
    expect(src).not.toContain("'WiseChef'");
    expect(src).not.toContain('by WiseChef');
  });

  it('publish.astro does not claim "WiseChef case studies"', () => {
    const src = read('src/pages/publish.astro');
    expect(src).not.toContain('WiseChef case studies');
  });

  it('the homepage meta description does not say "By WiseChef"', () => {
    const src = read('src/pages/index.astro');
    expect(src).not.toContain('By WiseChef');
  });

  it('llms.txt (machine-readable, read verbatim by agents) does not say "by WiseChef"', () => {
    const src = read('src/pages/llms.txt.ts');
    expect(src).not.toContain('by WiseChef');
  });
});

describe('dead repo links are fixed', () => {
  it('404.astro no longer links the archived+private recipes-portal repo', () => {
    const src = read('src/pages/404.astro');
    expect(src).not.toContain('wisechef-ai/recipes-portal');
    expect(src).toContain('wisechef-ai/loopskill-api');
  });

  it('security.astro points at loopskill-api, not the unrelated recipes-skill repo', () => {
    const src = read('src/pages/security.astro');
    expect(src).not.toContain('wisechef-ai/recipes-skill');
    expect(src).not.toContain("'recipes-api/app/security_scan.py'");
    expect(src).toContain('wisechef-ai/loopskill-api');
    expect(src).toContain("'loopskill-api/app/security_scan.py'");
  });
});
