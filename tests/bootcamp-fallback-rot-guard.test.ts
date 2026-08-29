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
 * UPDATE 2026-08-29: a live re-audit found the 2026-08-20 fix was ALSO
 * rotten — SEVEN of twelve pinned slugs 404 (the six above plus
 * client-reporter), and worse, the live catalog
 * (`/api/skills/search?page_size=100`) has ZERO 'pro'-tier skills; every
 * public skill is 'free'. Every step marked tier:'pro' was therefore both a
 * dead link and a false claim about a paid tier that doesn't exist. The
 * curricula were rebuilt entirely from slugs live-probed 200/tier=free on
 * 2026-08-29 (see scripts/audit-curriculum.mjs for the repeatable check, and
 * the "live-slug fixture" describe block below for the offline structural
 * guard against the next regression).
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
  // Added 2026-08-29: a live re-audit found these ALSO dead, one more than
  // the 2026-08-20 fix's own comment admitted.
  'client-reporter',
];

/**
 * Offline fixture of the live catalog as measured on 2026-08-29
 * (`curl -s 'https://app.loopskill.io/api/skills/search?page_size=100'`,
 * 57 results). Deliberately NOT a live call — this test suite is
 * network-free by design (see file header) — but any hardcoded curriculum
 * slug absent from this fixture is exactly the rot class this guard exists
 * to catch, so a live re-audit (scripts/audit-curriculum.mjs) should refresh
 * this list whenever the fallback curriculum changes.
 */
const LIVE_CATALOG_FIXTURE_20260829 = new Set([
  'agent-browser', 'agentic-os', 'architecture-diagram', 'arxiv', 'ascii-video',
  'audiocraft', 'baoyu-comic', 'baoyu-infographic', 'brainstorming',
  'brand-rollout-meta-repo', 'buzz-mesh-linux-build', 'clean-architecture',
  'clean-code', 'code-review', 'codebase-inspection', 'copywriting',
  'creative-ideation', 'critical-code-reviewer', 'design-md',
  'domain-driven-design', 'elevenlabs-pro', 'excalidraw', 'faster-whisper',
  'frontend-design', 'gif-search', 'github-issues', 'grok-search',
  'hub-search-claude-code', 'humanizer', 'hundred-million-offers',
  'hyperspace-matrix', 'llama-cpp', 'llm-wiki-hermes', 'local-tts-kokoro',
  'loopskill', 'manim-video', 'minto', 'multi-agent-discord-coordination',
  'musk-5-step-algorithm', 'nano-banana-pro', 'nano-pdf',
  'ocr-and-documents', 'ollama-low-vram-model-pick', 'p5js', 'plan-for-goal',
  'polymarket', 'pr-draft', 'repo-viz', 'ruthless-mentor',
  'songwriting-and-ai-music', 'startup-architect', 'summarize-cli',
  'super-memory', 'tavily-search', 'test-driven-development', 'whisper',
  'xitter',
]);

/** Every slug the two fallback curricula actually hardcode today. */
function extractHardcodedSlugs(src: string): Set<string> {
  const slugs = new Set<string>();
  const re = /slug:\s*'([a-z0-9-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) slugs.add(m[1]);
  return slugs;
}

describe('bootcamp fallback rot guard — live-slug fixture', () => {
  for (const [label, path] of PAGES) {
    it(`${label}: every hardcoded curriculum slug is present in the live-catalog fixture`, () => {
      const src = readFileSync(path, 'utf-8');
      const hardcoded = extractHardcodedSlugs(src);
      const missing = [...hardcoded].filter((s: string) => !LIVE_CATALOG_FIXTURE_20260829.has(s));
      expect(
        missing,
        `${label} hardcodes slug(s) absent from the 2026-08-29 live catalog fixture — ` +
          `re-run scripts/audit-curriculum.mjs and update the fallback`,
      ).toEqual([]);
    });
  }
});

describe('bootcamp fallback rot guard — source shape', () => {
  for (const [label, path] of PAGES) {
    it(`${label}: resolves \`available\` against the live catalog, not a literal`, () => {
      const src = readFileSync(path, 'utf-8');
      // The guard must query the catalog...
      expect(src).toMatch(/\/api\/skills\/search\?page_size=100/);
      // ...and derive availability from membership in that result set.
      // (2026-08-29: upgraded from a Set<string> of slugs to a
      // Map<string, tier> so tier can be resolved from the same fetch —
      // see the "API tier wins on disagreement" fix.)
      expect(src).toMatch(/available\s*=\s*!!s\.slug\s*&&\s*catalogTiers\.has\(s\.slug\)/);
    });

    it(`${label}: fails CLOSED when the catalog is unreachable`, () => {
      const src = readFileSync(path, 'utf-8');
      // catalogTiers must start empty and only ever be filled from a real
      // response — an empty map must mean "nothing links", never "link all".
      expect(src).toMatch(/const catalogTiers = new Map<string, string \| null>\(\);/);
      // The catalog fetch must be wrapped, so a throw cannot abort the build
      // or skip the guard.
      const guardRegion = src.slice(src.indexOf('const catalogTiers'));
      expect(guardRegion.slice(0, 600)).toMatch(/try\s*\{/);
      expect(guardRegion.slice(0, 900)).toMatch(/catch/);
    });

    it(`${label}: tier is resolved from the live catalog, API wins on disagreement`, () => {
      const src = readFileSync(path, 'utf-8');
      // A step's tier must come from catalogTiers when available, not blindly
      // from the hardcoded literal — this is what stops a stale 'pro' literal
      // from out-voting a live 'free' catalog entry (or vice versa).
      const guardRegion = src.slice(src.indexOf('const catalogTiers'));
      expect(guardRegion).toMatch(/catalogTiers\.get\(s\.slug\)\s*\?\?\s*s\.tier/);
    });

    it(`${label}: the catalog cross-check is not gated behind the fallback branch`, () => {
      const src = readFileSync(path, 'utf-8');
      // ROT TRAP #3 (2026-08-29): bootcamp.astro used to nest the entire
      // catalogTiers cross-check INSIDE `if (tracks.length === 0) { ... }`,
      // so it only ran when the hardcoded fallback fired. But the live
      // /api/bootcamp endpoint was found serving the SAME dead slugs — a
      // fully-reachable build shipped false PRO badges on 404 skills because
      // nothing ever cross-checked live-fetched data. The declaration of
      // `catalogTiers` must not be nested inside the `if (tracks.length ===
      // 0)` / `if (bootcampTracks.length === 0)` fallback-population block.
      const fallbackIfIdx = src.search(/if \((?:tracks|bootcampTracks)\.length === 0\)/);
      const catalogIdx = src.indexOf('const catalogTiers');
      expect(fallbackIfIdx).toBeGreaterThan(-1);
      expect(catalogIdx).toBeGreaterThan(-1);
      // The fallback `if` is either a braced block (bootcamp.astro) or a
      // single-statement one-liner ending in `;` (index.astro's
      // `if (bootcampTracks.length === 0) bootcampTracks = bootcampFallback;`).
      // Find whichever comes first after the `if (...)` — a `{` (braced
      // block, match its closing brace) or a `;` (one-liner, that IS the end).
      const afterCond = src.indexOf(')', fallbackIfIdx) + 1;
      const nextBrace = src.indexOf('{', afterCond);
      const nextSemi = src.indexOf(';', afterCond);
      let closeIdx: number;
      if (nextBrace !== -1 && (nextSemi === -1 || nextBrace < nextSemi)) {
        let depth = 0;
        closeIdx = -1;
        for (let i = nextBrace; i < src.length; i++) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') {
            depth--;
            if (depth === 0) { closeIdx = i; break; }
          }
        }
      } else {
        closeIdx = nextSemi;
      }
      expect(closeIdx).toBeGreaterThan(-1);
      // catalogTiers must be declared at or after the fallback block closes.
      expect(catalogIdx).toBeGreaterThanOrEqual(closeIdx);
    });

    it(`${label}: no hardcoded step claims tier 'pro'`, () => {
      const src = readFileSync(path, 'utf-8');
      // The live catalog has zero pro-tier skills (verified 2026-08-29).
      // A hardcoded `tier: 'pro'` literal would be a fabricated conversion
      // narrative the API itself contradicts. Only check actual step object
      // literals (tier: 'pro' immediately followed by a comma), not prose
      // in comments that may reference the string for documentation.
      expect(src).not.toMatch(/tier:\s*'pro',/);
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
