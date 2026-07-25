/**
 * fedui_0604 superset-visibility regression — TASK1. [REVISED 2026-07-25]
 *
 * STALE (architecture superseded): src/pages/skills/index.astro — the file
 * this suite targeted — is now a thin client-side RedirectStub to
 * /browse?type=skills (feat/spotify-ia restructure, commit fc0d01f,
 * "Spotify-model restructure — Home shelves, unified Browse, Library
 * tabs"). It contains no frontmatter, no server-side community fetch, and
 * none of the DOM ids (#community-section, #community-more) this suite
 * asserted against — there is nothing left to read a "hidden by default"
 * class off of.
 *
 * The underlying PRODUCT REQUIREMENT this suite protected — "the community/
 * federated superset must be visible at rest, not gated behind search" —
 * is still honored, but the implementation moved entirely into
 * src/pages/browse.astro under two later features:
 *   - feat/fleet-console-ui: federated results render as their own
 *     "Community skills" section with source badges (see fetchFederated()
 *     and the fedGroupHTML template below).
 *   - feat/browse-federated-defaults: an EMPTY query also renders the
 *     federated group (previously only a live search triggered it) — the
 *     exact "superset visible at rest" requirement, just implemented
 *     client-side on page load instead of via a build-time server fetch.
 *
 * These tests pin the CURRENT mechanism. Verified against the live site
 * 2026-07-25: `curl https://app.loopskill.io/api/skills/external?...`
 * returns federated rows, and browse.astro's load() calls fetchFederated()
 * unconditionally (not gated on state.q being non-empty) for type
 * 'all'/'skills'.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const BROWSE = join(ROOT, 'src/pages/browse.astro');
const SKILLS_INDEX = join(ROOT, 'src/pages/skills/index.astro');

const browseSrc = readFileSync(BROWSE, 'utf-8');
const skillsIndexSrc = readFileSync(SKILLS_INDEX, 'utf-8');

describe('/skills is now a redirect stub (superseded by /browse)', () => {
  it('skills/index.astro is a RedirectStub to /browse?type=skills', () => {
    expect(skillsIndexSrc).toContain('RedirectStub');
    expect(skillsIndexSrc).toContain('/browse?type=skills');
  });
});

describe('Community superset visible at rest — now on /browse (feat/browse-federated-defaults)', () => {
  it('fetches the federated skills endpoint client-side', () => {
    expect(browseSrc).toContain('/api/skills/external?sources=');
  });

  it('fetches federation unauthed (public endpoint — no auth header on the call)', () => {
    // fetchFederated() builds a plain fetch(url) with no Authorization/x-api-key.
    const fnStart = browseSrc.indexOf('async function fetchFederated');
    const fnEnd = browseSrc.indexOf('\n  }', fnStart);
    const fnBody = browseSrc.slice(fnStart, fnEnd);
    expect(fnBody).not.toMatch(/Authorization|x-api-key/i);
  });

  it('the community fetch is triggered on an EMPTY query too, not only on live search', () => {
    // feat/browse-federated-defaults: load() calls fetchFederated(state.q, ...)
    // unconditionally for type all/skills — state.q may be '' at first paint.
    expect(browseSrc).toMatch(
      /\(state\.type === 'all' \|\| state\.type === 'skills'\) \? fetchFederated\(state\.q,/,
    );
  });

  it('renders a "Community skills" section with source badges, not gated behind a hidden class', () => {
    expect(browseSrc).toContain('Community skills');
    expect(browseSrc).toContain("meta: `${s.source || 'community'}");
  });

  it('carries the federation source through for the like control (no bare-slug 404s)', () => {
    expect(browseSrc).toContain('like_source: s.source || null');
  });

  it('curated results still render before/above the community group in the DOM order', () => {
    // renderGroup() builds curated sections; fedGroupHTML is composed and
    // appended after byType groups in load()'s results assembly.
    const groupFnIdx = browseSrc.indexOf('function renderGroup');
    const fedGroupIdx = browseSrc.indexOf('const fedGroupHTML');
    expect(groupFnIdx).toBeGreaterThan(-1);
    expect(fedGroupIdx).toBeGreaterThan(-1);
    expect(groupFnIdx).toBeLessThan(fedGroupIdx);
  });
});
