/**
 * Rot guard for the bootcamp fallback curricula (bootcamp.astro + index.astro).
 *
 * THE BUG THIS PINS
 * -----------------
 * Both files carry a hardcoded `bootcampFallback` / inline `tracks` list that
 * only renders when the /api/bootcamp fetch fails at build time. Every step was
 * written with `available: true` under a comment asserting the slugs were
 * "API-verified" / "all confirmed 200 ... 2026-06-07".
 *
 * That assertion expired silently. As of 2026-08-20, SIX of the twelve
 * hardcoded slugs — scrapling-official, cognee, comfyui, chef, maestro,
 * framework-v0 — return 404 and are absent from the live 57-skill catalog.
 *
 * The failure mode is inverted and nasty: the fallback exists to keep a build
 * working when the API is down, but it emitted dead links, and `audit-links`
 * (correctly) fails the build on a dead link. So the safety net converted a
 * DEGRADED build into NO build. Three separate builds died on
 * `/skills/scrapling-official — 404 (linked 1x)` before this was traced.
 *
 * THE INVARIANT
 * -------------
 * A hardcoded `available: true` must never reach the template. `available`
 * has to be resolved against the real catalog at build time, and must fail
 * CLOSED (render as text, not a link) when the catalog cannot be read — which
 * is exactly the situation the fallback exists for.
 *
 * These tests read SOURCE (the guard must exist and be shaped correctly) and
 * BUILT OUTPUT (no dead curriculum link may ship), because either alone can
 * pass while the other is broken.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const PAGES: [string, string][] = [
  ['bootcamp.astro', resolve(ROOT, 'src/pages/bootcamp.astro')],
  ['index.astro', resolve(ROOT, 'src/pages/index.astro')],
];

/** Slugs the fallback lists that are known-dead as of 2026-08-20. */
const KNOWN_DEAD = [
  'scrapling-official',
  'cognee',
  'comfyui',
  'chef',
  'maestro',
  'framework-v0',
];

describe('bootcamp fallback rot guard — source shape', () => {
  for (const [label, path] of PAGES) {
    it(`${label}: resolves \`available\` against the live catalog, not a literal`, () => {
      const src = readFileSync(path, 'utf-8');
      // The guard must query the catalog...
      expect(src).toMatch(/\/api\/skills\/search\?page_size=100/);
      // ...and derive availability from membership in that result set.
      expect(src).toMatch(/available:\s*!!s\.slug\s*&&\s*catalogSlugs\.has\(s\.slug\)/);
    });

    it(`${label}: fails CLOSED when the catalog is unreachable`, () => {
      const src = readFileSync(path, 'utf-8');
      // catalogSlugs must start empty and only ever be filled from a real
      // response — an empty set must mean "nothing links", never "link all".
      expect(src).toMatch(/const catalogSlugs = new Set<string>\(\);/);
      // The catalog fetch must be wrapped, so a throw cannot abort the build
      // or skip the guard.
      const guardRegion = src.slice(src.indexOf('const catalogSlugs'));
      expect(guardRegion.slice(0, 600)).toMatch(/try\s*\{/);
      expect(guardRegion.slice(0, 900)).toMatch(/catch/);
    });

    it(`${label}: the template gates any step link on \`available\``, () => {
      const src = readFileSync(path, 'utf-8');
      // Only bootcamp.astro renders per-step links today. index.astro carries
      // the same fallback DATA but renders no step anchors, so there is no
      // gate to assert there — asserting one anyway would be a test demanding
      // code that shouldn't exist. Verified 2026-08-20: no `step.install_link`
      // anchor exists in index.astro's bootcampTracks render block. The guard
      // is still applied to index.astro so the data can never go stale if a
      // future change DOES start linking it.
      const rendersStepLinks = /step\.install_link/.test(src);
      if (!rendersStepLinks) {
        expect(src).not.toMatch(/href=\{[^}]*step\.install_link/);
        return;
      }
      expect(src).toMatch(/step\.available\s*&&\s*step\.install_link/);
    });
  }
});

describe('bootcamp fallback rot guard — built output', () => {
  const dist = resolve(ROOT, 'dist');
  const targets = [
    ['dist/bootcamp/index.html', resolve(dist, 'bootcamp/index.html')],
    ['dist/index.html', resolve(dist, 'index.html')],
  ] as const;

  for (const [label, file] of targets) {
    it(`${label}: ships no link to a known-dead curriculum slug`, () => {
      if (!existsSync(file)) {
        // Source tests above still cover the invariant when dist/ is absent.
        return;
      }
      const html = readFileSync(file, 'utf-8');
      const offenders = KNOWN_DEAD.filter((slug) =>
        new RegExp(`href="/skills/${slug}(\\?|")`).test(html),
      );
      expect(offenders, `dead curriculum links shipped in ${label}`).toEqual([]);
    });

    it(`${label}: still renders the curriculum copy (guard degrades links, not content)`, () => {
      if (!existsSync(file)) return;
      const html = readFileSync(file, 'utf-8');
      // A dead step must still appear by NAME — failing closed means plain
      // text, not a disappeared step.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
      const named = KNOWN_DEAD.some((slug) => text.includes(slug));
      const anyCurriculum = /super-memory|hyperspace-matrix/.test(text);
      expect(named || anyCurriculum).toBe(true);
    });
  }
});
