/**
 * tests/portal-277-federated.test.ts — issue#277 (federated skills invisible
 * on the web) acceptance tests for the three portal-side fixes.
 *
 * Follows the existing conventions in this repo:
 *   - source-string assertions on the .astro/.ts source (always run, even
 *     on a fresh clone with no dist/ yet — same as
 *     bootcamp-fallback-rot-guard.test.ts / federation-rot-guard.test.ts).
 *   - dist self-skip pattern (`it.runIf(existsSync(...))`) for anything that
 *     needs a real build — never a false failure on a clone that hasn't run
 *     `npm run build` yet, same as bootcamp-fallback-rot-guard.test.ts's
 *     "built output" describe block and spotify-2607-browse-renders.test.ts.
 *   - jsdom execution of the REAL built page's inline script against a
 *     stubbed fetch (spotify-2607-browse-renders.test.ts /
 *     mesh0408-t3b-mesh-view.test.ts pattern) for the viewer page's state
 *     machine, so a broken render path fails here even if the source looks
 *     right.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { FALLBACK_SOURCE_SLUGS } from '../src/lib/federation';

const ROOT = resolve(__dirname, '..');
const VIEWER_SRC_PATH = resolve(ROOT, 'src/pages/skills/external/view.astro');
const BROWSE_SRC_PATH = resolve(ROOT, 'src/pages/browse.astro');
const FEDERATION_LIB_PATH = resolve(ROOT, 'src/lib/federation.ts');

const VIEWER_SRC = readFileSync(VIEWER_SRC_PATH, 'utf-8');
const BROWSE_SRC = readFileSync(BROWSE_SRC_PATH, 'utf-8');
const FEDERATION_LIB = readFileSync(FEDERATION_LIB_PATH, 'utf-8');

const DIST = resolve(ROOT, 'dist');
const VIEWER_DIST = resolve(DIST, 'skills/external/view/index.html');
const BROWSE_DIST = resolve(DIST, 'browse/index.html');
const built = existsSync(DIST);
const viewerBuilt = existsSync(VIEWER_DIST);
const browseBuilt = existsSync(BROWSE_DIST);

// ──────────────────────────────────────────────────────────────────────
// FIX 1 — federation.ts fallback source list
// ──────────────────────────────────────────────────────────────────────

describe('issue#277 FIX 1 — federation.ts live source list + fail-closed fallback', () => {
  it('FALLBACK_SOURCE_SLUGS has at least 28 entries (the live source count, never the stale 8)', () => {
    expect(FALLBACK_SOURCE_SLUGS.length).toBeGreaterThanOrEqual(28);
  });

  it('FALLBACK_SOURCE_SLUGS is a flat list of non-empty strings with no duplicates', () => {
    expect(new Set(FALLBACK_SOURCE_SLUGS).size).toBe(FALLBACK_SOURCE_SLUGS.length);
    for (const s of FALLBACK_SOURCE_SLUGS) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('the live source list is fetched at build time via fetchApi (authed:false), not a raw fetch()', () => {
    expect(FEDERATION_LIB).toMatch(/fetchApi[\s\S]{0,80}\/api\/skills\/external/);
    expect(FEDERATION_LIB).toMatch(/authed:\s*false/);
  });

  it('known sources keep hand-authored display metadata; unknown ones auto-generate a label from the slug', () => {
    expect(FEDERATION_LIB).toMatch(/const SOURCE_META/);
    expect(FEDERATION_LIB).toMatch(/function autoLabel/);
    expect(FEDERATION_LIB).toMatch(/function metaFor/);
  });

  it('CRITICAL: an unreachable summary call falls back to the full current-list snapshot, never the old 8-source list', () => {
    expect(FEDERATION_LIB).toMatch(/slugs\s*=\s*\[\.\.\.FALLBACK_SOURCE_SLUGS\]/);
    // The old 8-slug hardcode this file replaced — must not reappear as a
    // literal fallback array.
    expect(FEDERATION_LIB).not.toMatch(/'claude-marketplace':\s*\{/);
  });

  it('getFederationSourcePages()/getFederationOverview() are the single choke point (unchanged contract)', () => {
    expect(FEDERATION_LIB).toMatch(/export function getFederationOverview/);
    expect(FEDERATION_LIB).toMatch(/export async function getFederationSourcePages/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// FIX 2 — external skill viewer page (source shape)
// ──────────────────────────────────────────────────────────────────────

describe('issue#277 FIX 2 — src/pages/skills/external/view.astro exists with the required states', () => {
  it('the file exists', () => {
    expect(existsSync(VIEWER_SRC_PATH)).toBe(true);
  });

  it('is a PUBLIC, noindex, query-param-addressed page', () => {
    expect(VIEWER_SRC).toMatch(/AppShell mode="public"/);
    expect(VIEWER_SRC).toMatch(/<meta name="robots" content="noindex"/);
    expect(VIEWER_SRC).toMatch(/URLSearchParams\(location\.search\)\.get\('ref'\)/);
  });

  it('has a visible not-found state for a missing/malformed ref', () => {
    expect(VIEWER_SRC).toMatch(/id="state-notfound"/);
    expect(VIEWER_SRC).toMatch(/if \(!ref\)[\s\S]{0,80}show\('state-notfound'\)/);
  });

  it('has a visible error state that is shown, never a blank page, when the API call fails', () => {
    expect(VIEWER_SRC).toMatch(/id="state-error"/);
    expect(VIEWER_SRC).toMatch(/function fail\(/);
    // Both the network-catch and the non-2xx branch route through fail().
    expect(VIEWER_SRC).toMatch(/catch \(e\) \{\s*fail\(/);
    expect(VIEWER_SRC).toMatch(/if \(!res\.ok\) \{ fail\(/);
    // res.json() is guarded — a 5xx returning non-JSON must not throw
    // uncaught past the visible error state.
    expect(VIEWER_SRC).toMatch(/try \{ data = await res\.json\(\); \} catch \{ fail\(/);
  });

  it('renders the fetch_origin branch (install_command copy block)', () => {
    expect(VIEWER_SRC).toMatch(/id="install-fetch"/);
    expect(VIEWER_SRC).toMatch(/d\.install_path === 'fetch_origin'/);
    expect(VIEWER_SRC).toMatch(/id="install-command"/);
    expect(VIEWER_SRC).toMatch(/id="copy-install-btn"/);
  });

  it('renders the deep_link branch (View at origin button + never-rehosts line)', () => {
    expect(VIEWER_SRC).toMatch(/id="install-deeplink"/);
    expect(VIEWER_SRC).toMatch(/id="deeplink-btn"/);
    expect(VIEWER_SRC.toLowerCase()).toMatch(/never rehost/);
  });

  it('splits ?ref= on the first colon (canonical) or first double-dash (legacy), never a global split', () => {
    expect(VIEWER_SRC).toMatch(/function parseRef/);
    expect(VIEWER_SRC).toMatch(/raw\.indexOf\(':'\)/);
    expect(VIEWER_SRC).toMatch(/raw\.indexOf\('--'\)/);
  });

  it('validates origin_url/raw_url as http(s) before ever using them as an href (XSS guard)', () => {
    expect(VIEWER_SRC).toMatch(/function isHttpUrl/);
    expect(VIEWER_SRC).toContain("/^https?:\\/\\//i.test(u)");
    expect(VIEWER_SRC).toMatch(/isHttpUrl\(d\.origin_url\)/);
  });

  it('renders install_command via textContent only, never innerHTML (XSS guard)', () => {
    expect(VIEWER_SRC).toMatch(/\$\('install-command'\)\.textContent = cmd/);
    expect(VIEWER_SRC).not.toMatch(/install-command'\)\.innerHTML/);
  });

  it('every internal link target in the viewer source exists as a route in this repo', () => {
    // /browse and /browse?type=skills both resolve to src/pages/browse.astro.
    expect(existsSync(BROWSE_SRC_PATH)).toBe(true);
    const hrefs = [...VIEWER_SRC.matchAll(/href="(\/[^"?]*)[^"]*"/g)].map((m) => m[1]);
    for (const path of hrefs) {
      if (path === '/browse') {
        expect(existsSync(BROWSE_SRC_PATH)).toBe(true);
      }
    }
    expect(hrefs.length).toBeGreaterThan(0);
  });
});

describe('issue#277 FIX 2 — /skills/external/view renders both install branches (built output)', () => {
  const FETCH_ORIGIN_PAYLOAD = {
    slug: 'github-marketing--co-marketing',
    source: 'github-marketing',
    install_path: 'fetch_origin',
    license: 'mit',
    origin_url: 'https://github.com/coreyhaines31/marketingskills/tree/main/skills/co-marketing',
    raw_url: 'https://raw.githubusercontent.com/coreyhaines31/marketingskills/main/skills/co-marketing/SKILL.md',
    content: '---\nname: co-marketing\ndescription: "Find co-marketing partners."\n---\nBody.',
    quality: 'community · as-is',
    install_command:
      'mkdir -p ~/.claude/skills/co-marketing && curl -fsSL https://raw.githubusercontent.com/coreyhaines31/marketingskills/main/skills/co-marketing/SKILL.md -o ~/.claude/skills/co-marketing/SKILL.md',
  };

  const DEEP_LINK_PAYLOAD = {
    slug: 'marketing-os',
    source: 'hermes-hub',
    install_path: 'deep_link',
    installed: false,
    reason: 'proprietary/locked — deep-link only, never rehosted',
    license: null,
    origin_url: 'https://clawhub.ai/forevercrab321-svg/skills/marketing-os',
    quality: 'community · as-is',
  };

  function stubFetch(mode: 'fetch_origin' | 'deep_link' | '404' | '500' | 'network' | 'malformed-json') {
    return (_url: string) => {
      if (mode === 'network') return Promise.reject(new Error('network down'));
      if (mode === '404') return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      if (mode === '500') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      if (mode === 'malformed-json') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Unexpected token')),
        });
      }
      const body = mode === 'fetch_origin' ? FETCH_ORIGIN_PAYLOAD : DEEP_LINK_PAYLOAD;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
  }

  async function renderViewer(
    ref: string | null,
    mode: 'fetch_origin' | 'deep_link' | '404' | '500' | 'network' | 'malformed-json',
  ) {
    const html = readFileSync(VIEWER_DIST, 'utf-8');
    const url = ref
      ? `https://app.loopskill.io/skills/external/view?ref=${encodeURIComponent(ref)}`
      : 'https://app.loopskill.io/skills/external/view';
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window as any;
    win.fetch = stubFetch(mode);
    win.navigator.clipboard = { writeText: async () => {} };

    const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
    const scripts = Array.from(dom.window.document.querySelectorAll('script')).filter((s: any) => {
      if (s.src) return false;
      if (!s.textContent || !s.textContent.trim()) return false;
      return JS_TYPES.has((s.getAttribute('type') || '').toLowerCase());
    });
    const errors: string[] = [];
    for (const s of scripts) {
      try {
        win.eval((s as any).textContent);
      } catch (err) {
        errors.push(String(err));
      }
    }

    const deadline = Date.now() + 2000;
    const settled = () => {
      const doc = dom.window.document;
      const loading = doc.getElementById('state-loading');
      return !!loading && loading.hasAttribute('hidden');
    };
    while (Date.now() < deadline && !settled()) {
      await new Promise((r) => setTimeout(r, 5));
    }
    return { dom, errors };
  }

  it.runIf(viewerBuilt)('ships at least one inline script that executes without throwing', async () => {
    const { errors } = await renderViewer('github-marketing:github-marketing--co-marketing', 'fetch_origin');
    expect(errors, `inline script threw: ${errors.join(' | ')}`).toEqual([]);
  });

  it.runIf(viewerBuilt)('renders the fetch_origin branch with a real install command, hides deep-link', async () => {
    const { dom } = await renderViewer('github-marketing:github-marketing--co-marketing', 'fetch_origin');
    const doc = dom.window.document;
    expect(doc.getElementById('install-fetch')!.hasAttribute('hidden')).toBe(false);
    expect(doc.getElementById('install-deeplink')!.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('install-command')!.textContent).toContain('curl -fsSL');
  });

  it.runIf(viewerBuilt)('renders the deep_link branch with a real "View at origin" href, hides fetch_origin', async () => {
    const { dom } = await renderViewer('hermes-hub:marketing-os', 'deep_link');
    const doc = dom.window.document;
    expect(doc.getElementById('install-deeplink')!.hasAttribute('hidden')).toBe(false);
    expect(doc.getElementById('install-fetch')!.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('deeplink-btn')!.getAttribute('href')).toBe(DEEP_LINK_PAYLOAD.origin_url);
  });

  it.runIf(viewerBuilt)('splits the colon-form ref on the FIRST colon (slug may legitimately contain "--")', async () => {
    const { dom } = await renderViewer('github-marketing:github-marketing--co-marketing', 'fetch_origin');
    const doc = dom.window.document;
    expect(doc.getElementById('source-badge')!.textContent).toBe('github-marketing');
  });

  it.runIf(viewerBuilt)('accepts the legacy double-dash ref form defensively', async () => {
    const { dom } = await renderViewer('hermes-hub--marketing-os', 'deep_link');
    const doc = dom.window.document;
    expect(doc.getElementById('install-deeplink')!.hasAttribute('hidden')).toBe(false);
  });

  it.runIf(viewerBuilt)('a 404 from the install endpoint renders the not-found state, never a blank page', async () => {
    const { dom } = await renderViewer('hermes-hub:does-not-exist', '404');
    const doc = dom.window.document;
    expect(doc.getElementById('state-notfound')!.hasAttribute('hidden')).toBe(false);
    expect(doc.getElementById('skill-body')!.hasAttribute('hidden')).toBe(true);
  });

  it.runIf(viewerBuilt)('a missing ?ref renders the not-found state', async () => {
    const { dom } = await renderViewer(null, 'fetch_origin');
    const doc = dom.window.document;
    expect(doc.getElementById('state-notfound')!.hasAttribute('hidden')).toBe(false);
  });

  it.runIf(viewerBuilt)('a network failure renders the VISIBLE error state, never a blank page', async () => {
    const { dom } = await renderViewer('hermes-hub:marketing-os', 'network');
    const doc = dom.window.document;
    expect(doc.getElementById('state-error')!.hasAttribute('hidden')).toBe(false);
    expect(doc.getElementById('error-detail')!.textContent!.length).toBeGreaterThan(0);
  });

  it.runIf(viewerBuilt)('a 500 renders the visible error state', async () => {
    const { dom } = await renderViewer('hermes-hub:marketing-os', '500');
    const doc = dom.window.document;
    expect(doc.getElementById('state-error')!.hasAttribute('hidden')).toBe(false);
  });

  it.runIf(viewerBuilt)('a 200 with malformed (non-JSON) body renders the visible error state, never throws uncaught', async () => {
    const { dom, errors } = await renderViewer('hermes-hub:marketing-os', 'malformed-json');
    expect(errors).toEqual([]);
    const doc = dom.window.document;
    expect(doc.getElementById('state-error')!.hasAttribute('hidden')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// FIX 3 — browse.astro federated group (defensive on the new API key)
// ──────────────────────────────────────────────────────────────────────

describe('issue#277 FIX 3 — browse.astro guards on absence of the `federated` key (source shape)', () => {
  it('has a defensive helper that treats a missing/non-array federated key as a no-op', () => {
    expect(BROWSE_SRC).toMatch(/function federatedApiGroupHTML/);
    expect(BROWSE_SRC).toMatch(/if \(!Array\.isArray\(rows\)\) return ''/);
  });

  it('reads the federated key defensively off the /api/search response, not assumed present', () => {
    expect(BROWSE_SRC).toMatch(/data && Array\.isArray\(data\.federated\) \? data\.federated : null/);
  });

  it('checks BOTH federated_cache_status and federated_status key names (API PR may settle on either)', () => {
    expect(BROWSE_SRC).toMatch(/data\.federated_cache_status \|\| data\.federated_status/);
  });

  it('renders a muted "warming up" note only when present-but-empty AND cache status is cold', () => {
    expect(BROWSE_SRC).toMatch(/cacheStatus === 'cold'/);
    expect(BROWSE_SRC.toLowerCase()).toMatch(/warming up/);
  });

  it('federated cards link to /skills/external/view?ref=<install_ref>, URL-encoded', () => {
    expect(BROWSE_SRC).toMatch(/\/skills\/external\/view\?ref=\$\{encodeURIComponent\(ref\)\}/);
  });

  it('the new group is additive at every render call site (appended, never replacing existing output)', () => {
    const appended = [...BROWSE_SRC.matchAll(/\+ apiFederatedGroupHTML/g)];
    // Both live render call sites (the 'all' tab and the single-type tab)
    // append apiFederatedGroupHTML rather than replacing existing output.
    expect(appended.length).toBeGreaterThanOrEqual(2);
  });
});

describe('issue#277 FIX 3 — browse.astro zero-regression when federated key is absent (built output)', () => {
  const SKILLS_PAYLOAD = {
    results: [{ slug: 'stub-alpha', title: 'Stub Alpha', description: 'x', category: 'data', install_count: 1 }],
  };
  const BUNDLES_PAYLOAD = { cookbooks: [] };
  const PERSONALITIES_PAYLOAD: unknown[] = [];
  const LOOPS_PAYLOAD: unknown[] = [];
  // OLD-SHAPE /api/search response — no `federated` key at all. This is the
  // exact shape the current (pre-API-PR) live API returns.
  const OLD_SEARCH_PAYLOAD = {
    loops: [],
    skills: [{ slug: 'q-alpha', title: 'Q Alpha', category: 'data', install_count: 1 }],
    bundles: [],
    personalities: [],
  };

  function stubFetch(requested: string[]) {
    return (url: string) => {
      const raw = String(url);
      let path = raw;
      try {
        path = new URL(raw, 'https://app.loopskill.io').pathname;
      } catch {
        /* recorded raw below */
      }
      requested.push(path);
      const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      switch (path) {
        case '/api/skills/search':
          return json(SKILLS_PAYLOAD);
        case '/api/bundles/discover':
          return json(BUNDLES_PAYLOAD);
        case '/api/personalities':
          return json(PERSONALITIES_PAYLOAD);
        case '/api/composite-loops':
          return json(LOOPS_PAYLOAD);
        case '/api/loops':
          return json([]);
        case '/api/skills/external':
          return json({ external: [], enabled_sources: [], counts: {} });
        case '/api/search':
          return json(OLD_SEARCH_PAYLOAD);
        case '/api/auth/me':
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
        case '/api/library':
          return json({ shelves: {} });
        default:
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
    };
  }

  async function renderBrowse(q: string | null) {
    const html = readFileSync(BROWSE_DIST, 'utf-8');
    const url = q ? `https://app.loopskill.io/browse?q=${encodeURIComponent(q)}` : 'https://app.loopskill.io/browse';
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window as any;
    const requested: string[] = [];
    win.fetch = stubFetch(requested);
    win.matchMedia =
      win.matchMedia ||
      ((m: string) => ({ matches: false, media: m, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

    const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
    const scripts = Array.from(dom.window.document.querySelectorAll('script')).filter((s: any) => {
      if (s.src) return false;
      if (!s.textContent || !s.textContent.trim()) return false;
      return JS_TYPES.has((s.getAttribute('type') || '').toLowerCase());
    });
    const errors: string[] = [];
    for (const s of scripts) {
      try {
        win.eval((s as any).textContent);
      } catch (err) {
        errors.push(String(err));
      }
    }

    const deadline = Date.now() + 2000;
    const settled = () => {
      const loading = dom.window.document.getElementById('browse-loading');
      return !!loading && loading.hasAttribute('hidden');
    };
    while (Date.now() < deadline && !settled()) {
      await new Promise((r) => setTimeout(r, 5));
    }
    return { dom, errors };
  }

  it.runIf(browseBuilt)('a query search against the OLD /api/search shape (no federated key) renders no throw and no "Federated results" group', async () => {
    const { dom, errors } = await renderBrowse('alpha');
    expect(errors, `inline script threw: ${errors.join(' | ')}`).toEqual([]);
    const results = dom.window.document.getElementById('browse-results')!;
    expect(results.innerHTML).toContain('q-alpha');
    expect(results.innerHTML).not.toContain('Federated results');
    expect(results.innerHTML).not.toContain('federated index warming up');
  });
});

// ──────────────────────────────────────────────────────────────────────
// Cross-cutting guards
// ──────────────────────────────────────────────────────────────────────

describe('issue#277 — no light-theme classes in new files', () => {
  const LIGHT_THEME_CLASSES =
    /class="[^"]*\b(bg-white(\/[0-9]+)?|bg-gray-[0-9]{2,3}|text-gray-[0-9]{2,3}|border-gray-[0-9]{2,3}|bg-slate-[0-9]{2,3}(\/[0-9]+)?|text-slate-[0-9]{2,3}|text-black)\b/;

  it('src/pages/skills/external/view.astro carries only dark-theme tokens', () => {
    expect(VIEWER_SRC).not.toMatch(LIGHT_THEME_CLASSES);
  });

  it('the new browse.astro federated-group markup carries only dark-theme tokens', () => {
    const start = BROWSE_SRC.indexOf('function federatedApiGroupHTML');
    expect(start).toBeGreaterThan(-1);
    const chunk = BROWSE_SRC.slice(start, start + 2000);
    expect(chunk).not.toMatch(LIGHT_THEME_CLASSES);
  });

  it.runIf(viewerBuilt)('dist/skills/external/view/index.html ships no light-theme utility classes', () => {
    const html = readFileSync(VIEWER_DIST, 'utf-8');
    expect(html).not.toMatch(LIGHT_THEME_CLASSES);
  });
});

describe('issue#277 — every new internal link target exists as a route', () => {
  // A "route" here means: a static .astro page file exists at the path Astro
  // would resolve that href to (mirrors scripts/audit-links.mjs's model,
  // simplified to the handful of targets this PR's new code introduces).
  const PAGES_DIR = resolve(ROOT, 'src/pages');

  function routeExists(pathname: string): boolean {
    const clean = pathname.split('?')[0].split('#')[0].replace(/^\/+/, '').replace(/\/+$/, '');
    if (clean === '') return existsSync(resolve(PAGES_DIR, 'index.astro'));
    const candidates = [
      resolve(PAGES_DIR, `${clean}.astro`),
      resolve(PAGES_DIR, clean, 'index.astro'),
    ];
    return candidates.some((c) => existsSync(c));
  }

  it('/browse (used by the viewer\'s back-link and not-found CTA) resolves to a real page', () => {
    expect(routeExists('/browse')).toBe(true);
  });

  it('/skills/external/view (the new viewer page itself, linked from browse.astro) resolves to a real page', () => {
    expect(routeExists('/skills/external/view')).toBe(true);
  });

  it('every static href the viewer source emits resolves to a real page (query-string targets stripped before checking)', () => {
    const hrefs = [...VIEWER_SRC.matchAll(/href="(\/[a-zA-Z0-9\/_-]*)[^"]*"/g)].map((m) => m[1]);
    const staticHrefs = hrefs.filter((h) => h && h !== '#');
    expect(staticHrefs.length).toBeGreaterThan(0);
    for (const href of staticHrefs) {
      expect(routeExists(href), `${href} does not resolve to a built page`).toBe(true);
    }
  });
});
