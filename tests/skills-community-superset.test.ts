/**
 * fedui_0604 superset-visibility regression — TASK1.
 *
 * Bug: on /skills the community/federated skills were gated behind the search
 * box (#community-section shipped `hidden`, only revealed by the q>=2 debounced
 * handler). So a cold page load — and any curl of the static HTML — showed only
 * the 62 curated cards even though the header advertised "62 curated + 953+
 * community". The superset must be VISIBLE AT REST, not searchable-only.
 *
 * Fix contract (asserted here):
 *   1. Frontmatter fetches the first page of /api/skills/external at BUILD time
 *      (server-side, public/unauthed) so cards render into the static HTML.
 *   2. #community-section is NOT `hidden` by default — visible at rest.
 *   3. Community cards are rendered SERVER-SIDE (an Astro .map over the fetched
 *      community skills), not only injected client-side on search.
 *   4. A bounded teaser: an initial visible cap + a "show more" control
 *      (#community-more) so the default payload isn't the whole firehose.
 *   5. A "Browse all" path to /skills/external for the full federated set.
 *   6. Search still spans BOTH: curated filtered client-side + community
 *      re-fetched by query (runCommunitySearch retained), and the server-
 *      rendered default is restored when the query is cleared.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SKILLS_INDEX = join(ROOT, 'src/pages/skills/index.astro');

const src = readFileSync(SKILLS_INDEX, 'utf-8');
const frontmatterMatch = src.match(/^---\s*([\s\S]*?)\s*---/m);
const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';

describe('Community superset visible at rest (fedui_0604 superset fix)', () => {
  it('frontmatter fetches /api/skills/external at build time', () => {
    expect(frontmatter).toMatch(/fetchApi[\s\S]*?\/api\/skills\/external/);
  });

  it('build-time community fetch is unauthed (public endpoint)', () => {
    // The external fetch must pass authed:false (public surface, no key leak).
    expect(frontmatter).toMatch(/\/api\/skills\/external[\s\S]*?authed:\s*false/);
  });

  it('build-time community fetch passes the live sources + a bounded limit', () => {
    expect(frontmatter).toMatch(/sources=/);
    // Bounded limit: either an inline digit (limit=24) or a numeric const
    // interpolated into the URL (limit=${COMMUNITY_LIMIT} with the const set).
    const inlineLimit = /limit=\d+/.test(frontmatter);
    const constLimit =
      /limit=\$\{[A-Z_]+\}/.test(frontmatter) &&
      /COMMUNITY_LIMIT\s*=\s*\d+/.test(frontmatter);
    expect(inlineLimit || constLimit).toBe(true);
  });

  it('binds the fetched community rows to a server-side array', () => {
    // Some variable holds the external rows for server-side rendering.
    expect(frontmatter).toMatch(/communitySkills/);
  });

  it('#community-section is NOT hidden by default (visible at rest)', () => {
    const m = src.match(/id="community-section"[^>]*class="([^"]*)"/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/\bhidden\b/);
  });

  it('renders community cards SERVER-SIDE (Astro .map over communitySkills)', () => {
    expect(src).toMatch(/communitySkills\.map/);
  });

  it('server-rendered community cards are filterable/identifiable (data-community-card)', () => {
    expect(src).toContain('data-community-card');
  });

  it('has a bounded "show more" control (#community-more)', () => {
    expect(src).toContain('community-more');
  });

  it('has a "Browse all" path to the /skills/external firehose', () => {
    expect(src).toContain('/skills/external');
  });

  it('retains client-side community search so query spans the full firehose', () => {
    expect(src).toContain('runCommunitySearch');
  });

  it('restores the server-rendered default community set when the query is cleared', () => {
    // A snapshot of the default grid must be captured and restored on clear,
    // so clearing search returns to the at-rest superset (not an empty grid).
    expect(src).toMatch(/defaultCommunity/);
  });

  it('still renders the curated grid first (curated ranks above community)', () => {
    const curatedIdx = src.indexOf('id="skill-grid"');
    const communityIdx = src.indexOf('id="community-section"');
    expect(curatedIdx).toBeGreaterThan(-1);
    expect(communityIdx).toBeGreaterThan(-1);
    expect(curatedIdx).toBeLessThan(communityIdx);
  });
});
