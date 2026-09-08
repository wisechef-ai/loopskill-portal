/**
 * tests/unisearch-0709-agent-install.test.ts — P3 acceptance.
 *
 * Two defects, one suite:
 *
 *  (1) DOUBLE-SOURCED FEDERATED ROWS. /browse fetched federated results from
 *      GET /api/search (`federated`) AND GET /api/skills/external, rendered
 *      BOTH as separate sections, and added both lengths into the count a
 *      visitor reads. Rows the two pipelines shared were shown twice and
 *      counted twice. P3 makes it ONE group, one card per canonical
 *      install_ref, one honest count — with /api/search as the authority for
 *      identity and order.
 *
 *  (2) NO INSTALL AFFORDANCE ON A CARD. The only copy button on the entire
 *      site was the viewer page's, and it copied a SHELL COMMAND — not
 *      something an agent can act on. P3 gives every card an agent-shaped
 *      "Copy for agent".
 *
 * Conventions follow the rest of this repo: source-string assertions always
 * run; anything needing a real build self-skips via it.runIf(built) so a
 * fresh clone does not report a false failure (CI always builds first).
 *
 * THE MIRROR GATE is the load-bearing part of this file. browse.astro and
 * skills/external/view.astro both carry `define:vars`, which Astro forces to
 * is:inline — ESM imports are unavailable, so both mirror agentInstallText()
 * inline instead of importing it. Two hand-copied mirrors of a user-visible
 * string is exactly how a site ends up shipping three different "one formats".
 * So we EXTRACT each mirror from the .astro source, execute it, and compare
 * its output to the module's over a table of subjects. Drift fails CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  agentInstallText,
  canonicalInstallRef,
  federatedInstallPath,
  isFederatedSubject,
  copyForAgentHTML,
  writeClipboard,
  createCopyForAgentController,
  COPY_FOR_AGENT_LABEL,
  LOOPSKILL_ORIGIN,
} from '../src/lib/agentInstall';

const ROOT = resolve(__dirname, '..');
const BROWSE_SRC = readFileSync(resolve(ROOT, 'src/pages/browse.astro'), 'utf-8');
const VIEWER_SRC = readFileSync(resolve(ROOT, 'src/pages/skills/external/view.astro'), 'utf-8');
const HOME_SRC = readFileSync(resolve(ROOT, 'src/pages/home.astro'), 'utf-8');
const CSS_SRC = readFileSync(resolve(ROOT, 'src/styles/global.css'), 'utf-8');
const ASSERT_DIST = readFileSync(resolve(ROOT, 'scripts/assert-dist.sh'), 'utf-8');

const BROWSE_DIST = resolve(ROOT, 'dist/browse/index.html');
const browseBuilt = existsSync(BROWSE_DIST);

// ──────────────────────────────────────────────────────────────────────────
// The text itself
// ──────────────────────────────────────────────────────────────────────────

const FETCH_ORIGIN_ROW = {
  slug: 'skills-sh-schrepa-graft-graft',
  title: 'graft',
  source: 'hermes-hub',
  install_ref: 'hermes-hub:skills-sh-schrepa-graft-graft',
  install_path: 'fetch_origin',
  origin_url: 'https://github.com/schrepa/graft/tree/main/skills/graft',
};

const DEEP_LINK_ROW = {
  slug: 'antibody-humanizer',
  title: 'Antibody Humanizer',
  source: 'hermes-hub',
  install_ref: 'hermes-hub:antibody-humanizer',
  origin_url: 'https://clawhub.ai/aipoch-ai/skills/antibody-humanizer',
  deployable: false,
};

describe('unisearch_0709/P3 — the agent-shaped install text', () => {
  it('a deployable federated row names the MCP tool AND the plain-HTTP fallback', () => {
    expect(agentInstallText('skill', FETCH_ORIGIN_ROW)).toBe(
      'Install "graft" from LoopSkill: call loopskill_install("hermes-hub:skills-sh-schrepa-graft-graft")'
        + ' — or GET https://app.loopskill.io/api/skills/metasearch/install?install_ref=hermes-hub:skills-sh-schrepa-graft-graft,'
        + ' then extract it to your skills directory.',
    );
  });

  it('is NOT a shell command — the old viewer button copied one, an agent cannot act on it', () => {
    const text = agentInstallText('skill', FETCH_ORIGIN_ROW);
    expect(text).not.toMatch(/curl|mkdir|\bcd\b|~\/\.claude/);
  });

  it('a deep-link row says it is not redistributable and says where to get it', () => {
    expect(agentInstallText('skill', DEEP_LINK_ROW)).toBe(
      '"Antibody Humanizer" isn\'t redistributable through the registry (source license).'
        + ' Get it from https://clawhub.ai/aipoch-ai/skills/antibody-humanizer.',
    );
  });

  it('a deep-link row NEVER offers an install call (sprint locked decision #4)', () => {
    expect(agentInstallText('skill', DEEP_LINK_ROW)).not.toContain('loopskill_install');
    expect(agentInstallText('skill', DEEP_LINK_ROW)).not.toContain('metasearch/install');
  });

  it('uses the RAW install_ref, never the lowercased dedupe key (an agent must send it back verbatim)', () => {
    const row = { ...FETCH_ORIGIN_ROW, install_ref: 'GitHub-OSS:Some--Mixed-Case' };
    expect(agentInstallText('skill', row)).toContain('loopskill_install("GitHub-OSS:Some--Mixed-Case")');
    expect(canonicalInstallRef(row)).toBe('github-oss:some--mixed-case');
  });

  it('degrades honestly when a deep-link row has no usable origin_url', () => {
    const text = agentInstallText('skill', { ...DEEP_LINK_ROW, origin_url: null });
    expect(text).toContain('isn\'t redistributable');
    expect(text).toContain('hermes-hub');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('refuses a javascript: origin_url as a destination (it is upstream-controlled)', () => {
    const text = agentInstallText('skill', { ...DEEP_LINK_ROW, origin_url: 'javascript:alert(1)' });
    expect(text).not.toContain('javascript:');
  });

  it('returns nothing at all when there is no identity — a button that copies nothing is worse than no button', () => {
    expect(agentInstallText('skill', {})).toBe('');
    expect(agentInstallText('skill', null)).toBe('');
    expect(copyForAgentHTML('skill', {})).toBe('');
  });
});

describe('unisearch_0709/P3 — the install verdict FAILS CLOSED', () => {
  it('install_path wins when present (GET /api/skills/external\'s own verdict)', () => {
    expect(federatedInstallPath({ install_path: 'fetch_origin' })).toBe('fetch_origin');
    expect(federatedInstallPath({ install_path: 'deep_link' })).toBe('deep_link');
  });

  it('deployable is the fallback spelling when install_path is absent (GET /api/search rows carry no install_path)', () => {
    expect(federatedInstallPath({ deployable: true })).toBe('fetch_origin');
    expect(federatedInstallPath({ deployable: false })).toBe('deep_link');
  });

  it('install_path beats a contradicting deployable — never promise an install the endpoint disclaimed', () => {
    expect(federatedInstallPath({ install_path: 'deep_link', deployable: true })).toBe('deep_link');
  });

  it('an unknown/absent shape is deep_link, never fetch_origin', () => {
    expect(federatedInstallPath({})).toBe('deep_link');
    expect(federatedInstallPath(null)).toBe('deep_link');
    expect(federatedInstallPath({ install_path: 'some_future_value' })).toBe('deep_link');
  });
});

describe('unisearch_0709/P3 — local-catalog cards get honest text, not the federated format', () => {
  it('a local skill is NOT treated as federated (a bare slug carries no source)', () => {
    expect(isFederatedSubject({ slug: 'copywriting' })).toBe(false);
    expect(isFederatedSubject(FETCH_ORIGIN_ROW)).toBe(true);
  });

  it('a local skill never quotes the metasearch URL — probed 2026-09-08, it 404s on a bare local slug', () => {
    const text = agentInstallText('skills', { slug: 'copywriting', title: 'copywriting' });
    expect(text).toContain('loopskill_install("copywriting")');
    expect(text).toContain(`${LOOPSKILL_ORIGIN}/api/skills/copywriting/install`);
    expect(text).not.toContain('metasearch/install');
    // The local install route is key-gated (probed: 401 without x-api-key).
    expect(text).toContain('x-api-key');
  });

  it('bundles, loops and personalities name the tool that actually loads them', () => {
    expect(agentInstallText('bundles', { slug: 'b', title: 'B' })).toContain('loopskill_bundle_install("b")');
    expect(agentInstallText('loops', { slug: 'l', title: 'L' })).toContain('loopskill_get_loop("l")');
    expect(agentInstallText('personalities', { slug: 'p', title: 'P' })).toContain('loopskill_get_personality("p")');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// The mirror gate
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pull one inline mirror out of an .astro source and execute it, returning
 * its agentInstallText. `define:vars` scripts cannot import, so this is the
 * only way to prove the two copies still agree with the module.
 */
function loadMirror(src: string, endMarker: string): (type: string, item: any) => string {
  const startMarker = "const LOOPSKILL_ORIGIN = 'https://app.loopskill.io';";
  const start = src.indexOf(startMarker);
  expect(start, `mirror start marker not found — did the mirror move or get deleted?`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start);
  expect(end, `mirror end marker "${endMarker}" not found`).toBeGreaterThan(start);
  const body = src.slice(start, end);
  // view.astro's isHttpUrl lives outside the extracted region; browse.astro's
  // is inside it. Shim it only when the extract does not define its own.
  const shim = body.includes('function isHttpUrl')
    ? ''
    : 'function isHttpUrl(u) { return typeof u === "string" && /^https?:\\/\\//i.test(u); }\n';
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${shim}${body}\nreturn agentInstallText;`);
  return factory() as (type: string, item: any) => string;
}

const MIRROR_SUBJECTS: Array<[string, any]> = [
  ['skill', FETCH_ORIGIN_ROW],
  ['skill', DEEP_LINK_ROW],
  ['skill', { ...DEEP_LINK_ROW, origin_url: null }],
  ['skill', { ...DEEP_LINK_ROW, origin_url: null, source: null }],
  ['skill', { ...FETCH_ORIGIN_ROW, install_path: null, deployable: true }],
  ['skills', { slug: 'copywriting', title: 'copywriting' }],
  ['loops', { slug: 'daily-standup', title: 'Daily Standup' }],
  ['bundles', { slug: 'growth', title: 'Growth' }],
  ['personalities', { slug: 'archie', title: 'Archie' }],
  ['skill', { slug: 'no-title-row', source: 'clawhub' }],
  ['skill', {}],
];

describe('unisearch_0709/P3 — ONE format across the site (inline mirrors match the module)', () => {
  it('browse.astro\'s inline mirror produces byte-identical text to src/lib/agentInstall.ts', () => {
    const mirror = loadMirror(BROWSE_SRC, '\n  // The button is a SIBLING');
    for (const [type, subject] of MIRROR_SUBJECTS) {
      expect(mirror(type, subject), `browse mirror drifted for ${JSON.stringify(subject)}`)
        .toBe(agentInstallText(type as any, subject));
    }
  });

  it('skills/external/view.astro\'s inline mirror produces byte-identical text to src/lib/agentInstall.ts', () => {
    const mirror = loadMirror(VIEWER_SRC, '\n  // NEVER a silent no-op');
    for (const [type, subject] of MIRROR_SUBJECTS) {
      expect(mirror(type, subject), `viewer mirror drifted for ${JSON.stringify(subject)}`)
        .toBe(agentInstallText(type as any, subject));
    }
  });

  it('both mirrors point back at the canonical module so the next editor knows where to start', () => {
    expect(BROWSE_SRC).toContain('src/lib/agentInstall.ts');
    expect(VIEWER_SRC).toContain('src/lib/agentInstall.ts');
  });

  it('home.astro IMPORTS the module rather than mirroring it (it is a processed script)', () => {
    expect(HOME_SRC).toMatch(/import \{[^}]*copyForAgentHTML[^}]*\} from '\.\.\/lib\/agentInstall'/);
    expect(HOME_SRC).not.toContain("const LOOPSKILL_ORIGIN = 'https://app.loopskill.io';");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Markup + accessibility contract
// ──────────────────────────────────────────────────────────────────────────

describe('unisearch_0709/P3 — the Copy for agent control', () => {
  it('is a real <button> carrying the text in a data attribute, with an accessible name', () => {
    const html = copyForAgentHTML('skill', FETCH_ORIGIN_ROW);
    const dom = new JSDOM(`<div class="artifact-slot"><a href="/x" class="artifact-card">card</a>${html}</div>`);
    const btn = dom.window.document.querySelector('button.artifact-copy')!;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('data-copy-text')).toBe(agentInstallText('skill', FETCH_ORIGIN_ROW));
    expect(btn.getAttribute('aria-label')).toContain(COPY_FOR_AGENT_LABEL);
    expect(btn.textContent).toContain(COPY_FOR_AGENT_LABEL);
  });

  it('is a SIBLING of the card <a>, never nested inside it (a <button> in an <a> breaks keyboard activation)', () => {
    const html = copyForAgentHTML('skill', FETCH_ORIGIN_ROW);
    const dom = new JSDOM(`<div class="artifact-slot"><a href="/x" class="artifact-card">card</a>${html}</div>`);
    const btn = dom.window.document.querySelector('button.artifact-copy')!;
    expect(btn.closest('a')).toBeNull();
    expect(btn.parentElement!.className).toBe('artifact-slot');
  });

  it('escapes the copied text into the attribute — upstream titles/URLs are not trusted', () => {
    const html = copyForAgentHTML('skill', {
      ...DEEP_LINK_ROW,
      title: '"><img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img');
    const dom = new JSDOM(`<div class="artifact-slot">${html}</div>`);
    expect(dom.window.document.querySelector('img')).toBeNull();
    // …and the real text still round-trips out of the attribute intact.
    const btn = dom.window.document.querySelector('button.artifact-copy')!;
    expect(btn.getAttribute('data-copy-text')).toContain('"><img src=x onerror=alert(1)>');
  });

  it('is hover-revealed but NEVER display:none/visibility:hidden — it must stay in the tab order', () => {
    const rule = CSS_SRC.slice(CSS_SRC.indexOf('.artifact-copy {'), CSS_SRC.indexOf('.artifact-copy-fallback {'));
    expect(rule).toContain('opacity: 0');
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
    // Keyboard reveal paths, both of them.
    expect(rule).toContain('.artifact-slot:focus-within .artifact-copy');
    expect(rule).toContain('.artifact-copy:focus-visible');
    // Touch devices have no hover at all.
    expect(rule).toContain('@media (hover: none)');
  });
});

describe('unisearch_0709/P3 — clipboard degradation is honest, never a silent no-op', () => {
  function domWithoutClipboard() {
    const dom = new JSDOM(
      `<div class="artifact-slot"><a href="/x" class="artifact-card">card</a>${copyForAgentHTML('skill', FETCH_ORIGIN_ROW)}</div>`,
      { pretendToBeVisual: true },
    );
    // jsdom ships neither navigator.clipboard nor document.execCommand — this
    // IS the degraded environment (and matches a real insecure-origin visit).
    delete (dom.window.navigator as any).clipboard;
    delete (dom.window.document as any).execCommand;
    return dom;
  }

  it('writeClipboard reports "manual" when neither transport exists', async () => {
    const dom = domWithoutClipboard();
    await expect(writeClipboard('hello', dom.window.document)).resolves.toBe('manual');
  });

  it('writeClipboard uses navigator.clipboard when it works', async () => {
    const dom = domWithoutClipboard();
    const seen: string[] = [];
    (dom.window.navigator as any).clipboard = { writeText: async (t: string) => { seen.push(t); } };
    await expect(writeClipboard('hello', dom.window.document)).resolves.toBe('clipboard');
    expect(seen).toEqual(['hello']);
  });

  it('falls back to execCommand when navigator.clipboard rejects (insecure origin / denied permission)', async () => {
    const dom = domWithoutClipboard();
    (dom.window.navigator as any).clipboard = { writeText: async () => { throw new Error('denied'); } };
    (dom.window.document as any).execCommand = () => true;
    await expect(writeClipboard('hello', dom.window.document)).resolves.toBe('exec');
  });

  it('with no transport at all, the click reveals the text pre-selected instead of doing nothing', async () => {
    const dom = domWithoutClipboard();
    const doc = dom.window.document;
    createCopyForAgentController({ root: doc });
    const btn = doc.querySelector('button.artifact-copy') as HTMLElement;
    btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const fallback = doc.querySelector('textarea.artifact-copy-fallback') as HTMLTextAreaElement | null;
    expect(fallback, 'no manual-copy affordance appeared — this is the silent no-op the DoD forbids').toBeTruthy();
    expect(fallback!.value).toBe(agentInstallText('skill', FETCH_ORIGIN_ROW));
    expect(btn.textContent).toContain('Select & copy');
  });

  it('shows a Copied state on success', async () => {
    const dom = domWithoutClipboard();
    const doc = dom.window.document;
    (dom.window.navigator as any).clipboard = { writeText: async () => {} };
    createCopyForAgentController({ root: doc });
    const btn = doc.querySelector('button.artifact-copy') as HTMLElement;
    btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(btn.textContent).toContain('Copied');
    expect(btn.getAttribute('data-copied')).toBe('true');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Single-authority federated group (executed against the REAL built page)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Both pipelines answer, and they OVERLAP on one install_ref (spelled in a
 * different case by each endpoint, which is exactly what a naive dedupe
 * misses). Expected merge: 3 federated cards, not 4.
 */
const SEARCH_PAYLOAD = {
  query: 'graft',
  skills: [{ slug: 'native-graft', title: 'Native Graft', category: 'dev', install_count: 5 }],
  loops: [],
  bundles: [],
  personalities: [],
  federated: [
    {
      slug: 'shared', title: 'Shared Skill', source: 'hermes-hub',
      install_ref: 'hermes-hub:shared', origin_url: 'https://example.invalid/shared', deployable: true,
    },
    {
      slug: 'api-only', title: 'API Only', source: 'hermes-hub',
      install_ref: 'hermes-hub:api-only', origin_url: 'https://example.invalid/api-only', deployable: false,
    },
  ],
  federated_cache_status: 'warm',
};

const EXTERNAL_PAYLOAD = {
  external: [
    {
      // Same row, different endpoint, DIFFERENT CASE on the ref.
      slug: 'shared', title: 'Shared Skill (external copy)', source: 'hermes-hub',
      install_ref: 'HERMES-HUB:SHARED', install_path: 'fetch_origin',
      origin_url: 'https://example.invalid/shared',
    },
    {
      slug: 'ext-only', title: 'Ext Only', source: 'skills-sh',
      install_ref: 'skills-sh:ext-only', install_path: 'deep_link',
      origin_url: 'https://example.invalid/ext-only',
    },
  ],
  enabled_sources: ['hermes-hub', 'skills-sh'],
  counts: { external_installable: 42 },
};

async function renderBrowseQuery(q: string) {
  const html = readFileSync(BROWSE_DIST, 'utf-8');
  const dom = new JSDOM(html, {
    url: `https://app.loopskill.io/browse?q=${encodeURIComponent(q)}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window as any;
  const requested: string[] = [];
  win.fetch = (url: string) => {
    let path = String(url);
    try { path = new URL(String(url), 'https://app.loopskill.io').pathname; } catch { /* recorded raw */ }
    requested.push(path);
    const json = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
    if (path === '/api/search') return json(SEARCH_PAYLOAD);
    if (path === '/api/skills/external') return json(EXTERNAL_PAYLOAD);
    if (path === '/api/library') return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
    return json({});
  };
  win.matchMedia = win.matchMedia || ((m: string) => ({ matches: false, media: m, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

  const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
  const scripts = Array.from(dom.window.document.querySelectorAll('script')).filter((s: any) => {
    if (s.src) return false;
    if (!s.textContent || !s.textContent.trim()) return false;
    return JS_TYPES.has((s.getAttribute('type') || '').toLowerCase());
  });
  const errors: string[] = [];
  for (const s of scripts) {
    try { win.eval((s as any).textContent); } catch (err) { errors.push(String(err)); }
  }
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const loading = dom.window.document.getElementById('browse-loading');
    if (loading && loading.hasAttribute('hidden')) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  return { dom, errors, requested };
}

describe('unisearch_0709/P3 — Browse renders ONE federated group (built output)', () => {
  it.runIf(browseBuilt)('executes without throwing', async () => {
    const { errors } = await renderBrowseQuery('graft');
    expect(errors, `inline script threw: ${errors.join(' | ')}`).toEqual([]);
  });

  it.runIf(browseBuilt)('renders exactly ONE federated section, not one per pipeline', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const groups = dom.window.document.querySelectorAll('#browse-results [data-federated-group]');
    expect(groups.length, 'expected a single federated group section').toBe(1);
  });

  it.runIf(browseBuilt)('emits ONE card per canonical install_ref, case-insensitively deduped', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const group = dom.window.document.querySelector('#browse-results [data-federated-group]')!;
    const cards = group.querySelectorAll('.artifact-card');
    expect(cards.length, 'expected 3 merged federated cards (4 rows, 1 shared ref)').toBe(3);
    const slugs = Array.from(cards).map((c) => c.getAttribute('data-artifact-slug'));
    expect(slugs.filter((s) => s === 'shared').length, '"shared" was rendered twice').toBe(1);
    expect(slugs).toContain('api-only');
    expect(slugs).toContain('ext-only');
  });

  it.runIf(browseBuilt)('/api/search is the AUTHORITY: on a collision its row wins', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const group = dom.window.document.querySelector('#browse-results [data-federated-group]')!;
    expect(group.innerHTML).toContain('Shared Skill');
    expect(group.innerHTML, 'the external duplicate won the collision').not.toContain('external copy');
  });

  it.runIf(browseBuilt)('the announced count equals the number of cards a visitor can actually see', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const doc = dom.window.document;
    const rendered = doc.querySelectorAll('#browse-results .artifact-card').length;
    const count = doc.getElementById('browse-live-count')!.textContent || '';
    // 1 native skill + 3 merged federated. Pre-P3 this said 5 (2 + 2 + 1),
    // double-counting the row both pipelines returned.
    expect(rendered).toBe(4);
    expect(count).toContain('4 results for "graft"');
    expect(count).toContain('(3 community)');
  });

  it.runIf(browseBuilt)('curated/native cards render BEFORE federated ones, never interleaved', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const results = dom.window.document.getElementById('browse-results')!;
    const nodes = Array.from(results.querySelectorAll('.artifact-card'));
    const firstFederated = nodes.findIndex((n) => n.closest('[data-federated-group]'));
    const lastNative = nodes.map((n) => !n.closest('[data-federated-group]')).lastIndexOf(true);
    expect(firstFederated).toBeGreaterThan(-1);
    expect(lastNative, 'no native card rendered — cannot prove ordering').toBeGreaterThan(-1);
    expect(lastNative).toBeLessThan(firstFederated);
  });

  it.runIf(browseBuilt)('every federated card carries a Copy for agent button with the right text for its install path', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const group = dom.window.document.querySelector('#browse-results [data-federated-group]')!;
    const buttons = Array.from(group.querySelectorAll('button.artifact-copy'));
    expect(buttons.length, 'a federated card shipped without an install affordance').toBe(3);
    const texts = buttons.map((b) => b.getAttribute('data-copy-text') || '');
    // deployable:true (no install_path on /api/search rows) -> installable.
    expect(texts.some((t) => t.includes('loopskill_install("hermes-hub:shared")'))).toBe(true);
    // deployable:false and install_path deep_link -> honest, no install call.
    const notInstallable = texts.filter((t) => t.includes("isn't redistributable"));
    expect(notInstallable.length).toBe(2);
    for (const t of notInstallable) expect(t).not.toContain('loopskill_install');
  });

  it.runIf(browseBuilt)('native cards get a Copy for agent button too', async () => {
    const { dom } = await renderBrowseQuery('graft');
    const results = dom.window.document.getElementById('browse-results')!;
    const nativeCard = Array.from(results.querySelectorAll('.artifact-slot'))
      .find((s) => s.querySelector('[data-artifact-slug="native-graft"]'))!;
    expect(nativeCard, 'native skill card not rendered').toBeTruthy();
    const btn = nativeCard.querySelector('button.artifact-copy')!;
    expect(btn.getAttribute('data-copy-text')).toContain('loopskill_install("native-graft")');
  });

  it.runIf(browseBuilt)('both pipelines are still queried — neither subsumes the other', async () => {
    const { requested } = await renderBrowseQuery('graft');
    expect(requested).toContain('/api/search');
    expect(requested).toContain('/api/skills/external');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Build guards
// ──────────────────────────────────────────────────────────────────────────

describe('unisearch_0709/P3 — assert-dist guards exist and the built page satisfies them', () => {
  it('assert-dist.sh guards the federated group, the copy affordance, and hardcoded counts', () => {
    expect(ASSERT_DIST).toContain('data-federated-group');
    expect(ASSERT_DIST).toContain('Copy for agent');
    expect(ASSERT_DIST).toContain('INVENTORY_LITERAL');
    // The install surface every federated card now links to must be emitted.
    expect(ASSERT_DIST).toContain('skills/external/view/index.html');
  });

  it.runIf(browseBuilt)('dist/browse/index.html ships the Copy for agent affordance (DoD grep)', () => {
    const html = readFileSync(BROWSE_DIST, 'utf-8');
    expect(html.split('Copy for agent').length - 1).toBeGreaterThanOrEqual(1);
    expect(html).toContain('class="artifact-copy"');
    expect(html).toContain('data-federated-group');
  });

  it.runIf(browseBuilt)('no hardcoded inventory literal survives into the rendered search surface', () => {
    const html = readFileSync(BROWSE_DIST, 'utf-8');
    const offenders = html.match(/([0-9]{1,3},[0-9]{3}|[0-9]{2,4}k)\+?\s*(skills?|entries|results|registries|sources|installable)/g);
    expect(offenders, `hardcoded inventory literal(s): ${offenders?.join(', ')}`).toBeNull();
  });
});
