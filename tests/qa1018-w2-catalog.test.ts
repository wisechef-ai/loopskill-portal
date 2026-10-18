/**
 * tests/qa1018-w2-catalog.test.ts — launch-QA (2026-10-18) catalog fixes.
 *
 * Five persona users walked loopskill.io -> first success. These pins cover
 * the catalog surfaces they tripped on (clusters C02, C05, C07, C09, C11,
 * C21, C22, C23). Source-string pins always run; built-output pins self-skip
 * on a fresh clone (CI builds first).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { freshAgentPhrase } from '../src/lib/agentInstall';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');

const SKILL_PAGE = read('src/pages/skills/[slug].astro');
const QUICK = read('src/components/QuickInstall.astro');
// The markup only (the frontmatter comment quotes the OLD copy on purpose).
const QUICK_MARKUP = QUICK.slice(QUICK.indexOf('---', 3) + 3);
const RUNTIME = read('src/components/skill/RuntimePanel.tsx');
const AUDIT = read('src/components/skill/AuditBars.tsx');
const ATC = read('src/components/AddToCookbook.astro');
const ATC_SCRIPT = read('src/components/AddToCookbookScript.astro');
const BROWSE = read('src/pages/browse.astro');
const VIEWER = read('src/pages/skills/external/view.astro');
const CSS = read('src/styles/global.css');

const SKILL_DIST = resolve(ROOT, 'dist/skills/copywriting/index.html');
const skillBuilt = existsSync(SKILL_DIST);

describe('C02 — skill page install: one fresh-agent phrase, shown == copied', () => {
  it('"Install free" is no longer a link to the generic /docs/install guide', () => {
    expect(SKILL_PAGE).not.toMatch(/<a href="\/docs\/install"[\s\S]{0,200}Install free/);
    expect(SKILL_PAGE).toContain("import { freshAgentPhrase } from '../../lib/agentInstall'");
    // The sidebar button copies the very string it renders.
    expect(SKILL_PAGE).toMatch(/data-sidebar-phrase>\{agentPhrase\}<\/code>/);
    expect(SKILL_PAGE).toMatch(/id="sidebar-copy-install" data-copy-text=\{agentPhrase\}/);
  });

  it('QuickInstall leads with the phrase + where to paste it; MCP is secondary and labelled', () => {
    expect(QUICK).toContain("Paste this into your agent's chat (Claude Code, Codex, Cursor…) and press Enter.");
    expect(QUICK).toMatch(/data-qi-agent-line>\{agentLine\}<\/code>/);
    expect(QUICK).toMatch(/data-qi-copy=\{agentLine\}>Copy install phrase/);
    expect(QUICK).toContain('Already have LoopSkill connected (API key)?');
    expect(QUICK_MARKUP.indexOf('data-qi-agent-line')).toBeLessThan(QUICK_MARKUP.indexOf('Already have LoopSkill connected'));
  });

  it('the REST endpoint is labelled for what it really is (keyless, JSON, 1-hour link)', () => {
    expect(QUICK_MARKUP).not.toMatch(/Signed install URL \(curl-able with your API key\)/);
    expect(QUICK).toContain('no key needed');
    expect(QUICK).toContain('1 hour');
    expect(QUICK).toContain('JSON');
  });

  it('the empty "QUICK INSTALL" label is gone', () => {
    expect(QUICK_MARKUP).not.toMatch(/>Quick install</);
  });

  it.runIf(skillBuilt)('built /skills/copywriting shows the exact canonical phrase and no MCP-first block', () => {
    const html = readFileSync(SKILL_DIST, 'utf-8');
    const phrase = freshAgentPhrase('skill', 'copywriting').replace(/"/g, '&quot;');
    expect(html).toContain(phrase);
    expect(html).not.toContain('Signed install URL');
    expect(html).not.toMatch(/>\s*Quick install\s*</);
  });
});

describe('C05 — no empty sections; the audit block states what is true', () => {
  it('RuntimePanel renders nothing (not an empty heading) without data', () => {
    expect(RUNTIME).not.toContain('No runtime data available.');
    expect(RUNTIME).toMatch(/if \(loading \|\| error\) return null;/);
    expect(RUNTIME).toMatch(/if \(!hasRuntime && !hasInstalls\) return null;/);
    // The page no longer hard-codes a RUNTIME card around the island.
    expect(SKILL_PAGE).not.toMatch(/<p class="eyebrow mb-3">Runtime<\/p>/);
  });

  it('skill files hydrate without needing a scroll', () => {
    expect(SKILL_PAGE).toMatch(/<SkillFileExplorer[\s\S]*?client:idle/);
  });

  it('"Not yet audited" says what IS true and never claims a source audit that did not run', () => {
    expect(AUDIT).toContain('Not yet audited.');
    expect(AUDIT).toContain('SHA-256 checksummed');
    expect(AUDIT).not.toContain('Source audited');
  });
});

describe('C09 — the external viewer never copies a refusal', () => {
  it('the deep-link branch has no copy button, only the source link', () => {
    expect(VIEWER).not.toContain('copy-deeplink-btn');
    expect(VIEWER).toContain('Get it from source ↗');
  });

  it('the installable branch SHOWS the phrase it copies', () => {
    expect(VIEWER).toContain('id="agent-phrase"');
    expect(VIEWER).toMatch(/\$\('agent-phrase'\)\.textContent = phrase;\s*wireCopy\('copy-install-btn', phrase/);
  });
});

describe('C23 — anonymous "Add to bundle" shows only a sign-in line', () => {
  it('the create form ships hidden and is only revealed for a signed-in session', () => {
    expect(ATC).toMatch(/class="atc-new-wrap hidden/);
    expect(ATC).not.toContain('href="/signup"');
    const anon = ATC_SCRIPT.slice(ATC_SCRIPT.indexOf("if (authState === 'anon') {"), ATC_SCRIPT.indexOf("if (authState !== 'ok') {"));
    expect(anon).toContain('setNewForm(root, false)');
    expect(ATC_SCRIPT).toMatch(/if \(authState !== 'ok'\) \{ window\.location\.href = signinHref\(\); return; \}/);
  });
});

describe('C07/C11/C21/C22 — browse', () => {
  it('caps the query at 200 chars in the input AND from ?q=', () => {
    expect(BROWSE).toMatch(/id="browse-search"[\s\S]{0,300}maxlength="200"/);
    expect(BROWSE).toContain('const MAX_QUERY = 200;');
    expect(BROWSE).toMatch(/\(p\.get\('q'\) \|\| ''\)\.slice\(0, MAX_QUERY\)/);
  });

  it('echoed queries wrap instead of widening the page', () => {
    expect(BROWSE).toMatch(/\.browse-empty[^{]*\{[^}]*overflow-wrap: anywhere/);
  });

  it('the zero-result state offers suggestions, clear-search and the Federated index', () => {
    const fn = BROWSE.slice(BROWSE.indexOf('function renderEmpty'), BROWSE.indexOf('async function fetchSearch'));
    expect(fn).toContain('Clear search');
    expect(fn).toContain('href="/federation/"');
    expect(fn).toContain('EMPTY_SUGGESTIONS');
    expect(fn).toContain('esc(q)');
  });

  it('a short placeholder that fits 375px, and ONE clear control', () => {
    const ph = (BROWSE.match(/id="browse-search"[^>]*placeholder="([^"]+)"/) || [])[1] || '';
    expect(ph.length).toBeGreaterThan(0);
    expect(ph.length).toBeLessThanOrEqual(24);
    expect(BROWSE).toContain('::-webkit-search-cancel-button');
  });

  it('loading shows skeleton cards, not a bare "Loading…" word', () => {
    const fn = BROWSE.slice(BROWSE.indexOf('function showLoading'), BROWSE.indexOf('function hideLoading'));
    expect(fn).toContain('artifact-skeleton');
    expect(fn).not.toContain("textContent = 'Loading…'");
  });

  it('the prerendered shelf is kept on first load instead of being wiped to a spinner', () => {
    expect(BROWSE).toContain('let keepPrebuilt = !!hasPrebuilt');
  });

  it('federated cards get an owner/repo subtitle', () => {
    expect(BROWSE).toMatch(/const meta = owner \? `from \$\{owner\}` : artifactMeta\(type, item\);/);
  });

  it('touch devices get >=44px Copy / source / heart targets', () => {
    const block = CSS.slice(CSS.indexOf('@media (hover: none), (pointer: coarse)'));
    expect(block).toMatch(/\.artifact-like \{[^}]*width: 44px; height: 44px/);
    expect(block).toMatch(/\.artifact-copy, \.artifact-source \{[^}]*min-height: 44px/);
  });
});
