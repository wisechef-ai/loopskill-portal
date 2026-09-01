/**
 * personas0901 — the public bundle page must render DECLARED PERSONALITIES.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * `personalities` is a first-class LoopSkill artifact: they are published via
 * `POST /api/personalities` and declared into a bundle via
 * `POST /api/bundles/{id}/personalities/{slug}`. api#303 fixed the API half —
 * `GET /api/bundles/public/{slug}` now serializes a `personalities[]` array
 * (verified live: agent-bench returns 3).
 *
 * The portal half was never built. `p.astro` rendered `skills` only — zero
 * occurrences of "personalit" anywhere in the file — so
 * https://app.loopskill.io/bundles/p?slug=agent-bench returned HTTP 200 with
 * the API serving three personas and displayed NONE of them.
 *
 * Worse, the page hit an early `return` at `if (skills.length === 0)`, so a
 * personalities-only bundle rendered "This bundle has no skills yet." and
 * stopped — the exact "deployed but invisible" class as the API-side gap.
 *
 * These tests assert the page SOURCE (same approach as
 * bundles0811-p1-install-block.test.ts — this is a static Astro site and the
 * render path is an inline `define:vars` script that cannot be imported):
 *   1. a personalities section + list container exist
 *   2. the render path reads `bd.personalities` from the API payload
 *   3. the section self-hides when there are none (no empty shelf)
 *   4. the zero-skills early return no longer skips personalities
 *   5. persona rows link to /personalities/<slug>
 *   6. API strings are injected with textContent, never innerHTML (XSS)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const PAGE = join(ROOT, 'src', 'pages', 'bundles', 'p.astro');
const src = readFileSync(PAGE, 'utf-8');

describe('personas0901 — personalities on the public bundle page', () => {
  it('declares a personalities section and list container', () => {
    expect(src).toContain('id="personalities-section"');
    expect(src).toContain('id="personalities-list"');
  });

  it('reads the personalities array from the API payload', () => {
    // The API contract is `personalities[]` on GET /api/bundles/public/{slug}.
    expect(src).toMatch(/bd\.personalities/);
    expect(src).toMatch(/renderPersonalities\s*\(/);
  });

  it('self-hides the section when the bundle declares none', () => {
    // A skills-only bundle must look exactly as it did before this change.
    const fn = src.slice(src.indexOf('function renderPersonalities'));
    expect(fn).toMatch(/length === 0[\s\S]{0,120}section\.hidden = true/);
  });

  it('ships the section hidden by default so it cannot flash empty', () => {
    expect(src).toMatch(/id="personalities-section"[^>]*\shidden/);
  });

  it('does not let a zero-skill bundle skip personality rendering', () => {
    // REGRESSION: `if (skills.length === 0) { show("bd-empty"); return; }`
    // ran BEFORE any personality rendering, so agent-bench (3 personalities,
    // 0 skills) showed only "no skills yet". renderPersonalities must be
    // invoked before that early return.
    const renderBody = src.slice(src.indexOf('function render(bd)'));
    const callIdx = renderBody.indexOf('renderPersonalities(');
    const earlyReturnIdx = renderBody.indexOf('skills.length === 0');
    expect(callIdx).toBeGreaterThan(-1);
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeLessThan(earlyReturnIdx);
  });

  it('links each persona to its detail page', () => {
    expect(src).toMatch(/\/personalities\/\$\{encodeURIComponent\(p\.slug\)\}/);
  });

  it('counts personalities in the bundle stats line', () => {
    // "0 skills" on a personalities-only bundle reads as an empty bundle.
    expect(src).toMatch(/personalit\$\{[\s\S]{0,60}\? "y" : "ies"\}/);
  });

  it('injects API-provided strings with textContent, never innerHTML', () => {
    const fn = src.slice(
      src.indexOf('function renderPersonalities'),
      src.indexOf('function render(bd)'),
    );
    // Clearing the container is the only allowed innerHTML use — it assigns a
    // constant empty string, never API data.
    const innerHtmlAssignments = [...fn.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    for (const value of innerHtmlAssignments) {
      expect(value).toBe('""');
    }
    expect(fn).toMatch(/nameEl\.textContent = p\.title/);
    expect(fn).toMatch(/desc\.textContent = p\.description/);
  });
});
