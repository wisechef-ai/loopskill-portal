/**
 * spotify_2607 Phase −1 — /browse actually RENDERS its catalog.
 *
 * WHY THIS FILE EXISTS (Codex adversarial review of PR #24, MUST-FIX):
 *
 * The CI guard this replaces greps the built HTML for the string
 * `/api/skills/search`. Codex's objection is correct and worth writing down:
 * a string match passes when the endpoint appears in a comment, in dead code,
 * or in a fetch whose result is never rendered — and it passes when a
 * client-side exception stops `load()` before a single card is painted. The
 * deploy readiness gate does not close the hole either: it asserts `/browse`
 * RESPONDS, never that it renders.
 *
 * That is the exact production shape this repo keeps getting burned by:
 *   - fc0d01f shipped `limit=50` against an API capped at `le=20`. Every
 *     search on this page 422'd, the page showed its generic error state, and
 *     NOTHING in CI or the console said so.
 *   - The 2026-07-17 deploy outage: builds green for 8 days, nothing live.
 * Both are "the artifact exists and answers 200, but the user sees nothing."
 *
 * So this test executes the REAL inline script extracted from the REAL built
 * `dist/browse/index.html`, in jsdom, against a stubbed API, and asserts that
 * skill cards appear in the DOM. It fails if the fetch is removed, if the
 * endpoint is renamed, if a render throw is introduced, or if the API contract
 * shifts under us — the failure modes a grep is blind to.
 *
 * Requires a build (`npm run build`) to have produced dist/. Skips with a loud
 * message when dist is absent so a bare `vitest run` on a fresh clone does not
 * report a false failure; CI always builds first, so CI always runs it.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const BROWSE_DIST = join(ROOT, 'dist/browse/index.html');
const HOME_DIST = join(ROOT, 'dist/index.html');
const BROWSE_SRC = join(ROOT, 'src/pages/browse.astro');

const built = existsSync(BROWSE_DIST);

/** Stub payloads shaped like the real API responses browse.astro consumes. */
const SKILLS_PAYLOAD = {
  results: [
    { slug: 'stub-alpha', title: 'Stub Alpha', description: 'first', category: 'data', install_count: 3 },
    { slug: 'stub-beta', title: 'Stub Beta', description: 'second', category: 'ops', install_count: 1 },
  ],
};
const BUNDLES_PAYLOAD = { bundles: [{ slug: 'stub-bundle', name: 'Stub Bundle', skill_count: 2 }] }; // issue #157 Ph 3: `bundles` is the only emitted key
const PERSONALITIES_PAYLOAD = [{ slug: 'stub-persona', name: 'Stub Persona', category: 'research' }];
const LOOPS_PAYLOAD = [{ slug: 'stub-loop', title: 'Stub Loop', schedule: 'daily', install_count: 0 }];
// issue #82: envelope metadata the header binds to. 3 enabled sources but
// only 'clawhub' present in rows — pins that the REGISTRY count comes from
// enabled_sources (not distinct row sources) and the skill count from
// counts.external_installable. On pre-fix main the header rendered the
// hardcoded literal "7 registries" and this suite went RED.
const FEDERATED_PAYLOAD = {
  external: [{ slug: 'stub-community', title: 'Stub Community', source: 'clawhub', origin_url: 'https://example.invalid/x' }],
  enabled_sources: ['clawhub', 'skills-sh', 'well-known'],
  counts: { external_installable: 1234 },
};

/**
 * Route a stubbed fetch by URL.
 *
 * Matches on the parsed **pathname**, exactly — never on a substring. Codex's
 * round-2 review made the point that `u.includes('/api/skills/search')` keeps
 * answering happily after a production-breaking rename to
 * `/api/skills/search-v2` (the substring is still present), so the "unrouted
 * endpoint" detector would never fire and CI would stay green through the
 * regression it exists to catch. Exact pathname matching means any rename,
 * prefix, or version bump falls through to `unmatched` and turns the suite red.
 *
 * Requested paths are recorded so tests can assert the page asked for what it
 * is supposed to ask for, rather than only that nothing unexpected was called.
 */
function stubFetch(unmatched: string[], requested: string[]) {
  return (url: string) => {
    const raw = String(url);
    let path = raw;
    try {
      path = new URL(raw, 'https://app.loopskill.io').pathname;
    } catch {
      // A URL we cannot even parse is itself a defect — record it verbatim and
      // let it land in `unmatched` below.
    }
    requested.push(path);

    const json = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

    switch (path) {
      case '/api/skills/search':
        return json(SKILLS_PAYLOAD);
      case '/api/bundles/discover':
        return json(BUNDLES_PAYLOAD);
      case '/api/personalities':
        return json(PERSONALITIES_PAYLOAD);
      case '/api/composite-loops':
        return json(LOOPS_PAYLOAD);
      case '/api/skills/external':
        return json(FEDERATED_PAYLOAD);
      // Verifier-registry fallback: only consulted when /api/composite-loops
      // fails or returns empty. Answering [] here keeps the composite path the
      // one under test.
      case '/api/loops':
        return json([]);
      case '/api/auth/me':
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
      case '/api/library':
        return json({ shelves: {} });
      default:
        unmatched.push(path);
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }
  };
}

async function renderBrowse() {
  const html = readFileSync(BROWSE_DIST, 'utf-8');
  const unmatched: string[] = [];
  const requested: string[] = [];

  const dom = new JSDOM(html, {
    url: 'https://app.loopskill.io/browse',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const win = dom.window as any;
  win.fetch = stubFetch(unmatched, requested);
  win.matchMedia = win.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

  // Execute every inline JAVASCRIPT block the BUILT page ships.
  // `runScripts:'outside-only'` means jsdom parsed but did not run them; we run
  // them explicitly so a script that throws surfaces here as a test failure
  // instead of being swallowed.
  //
  // Filter by type: the page also emits `application/ld+json` (JSON-LD for
  // SEO). That is DATA, not code — eval'ing it throws `Unexpected token ':'`
  // and would report a phantom failure on a perfectly healthy page. Only
  // untyped scripts and the explicit JS mimetypes are executable.
  const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
  const scripts = Array.from(dom.window.document.querySelectorAll('script'))
    .filter((s: any) => {
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

  // Wait for a DETERMINISTIC observable end-state, not an arbitrary tick count.
  //
  // The previous form (`for i in 0..25: await setTimeout(0)`) had no causal
  // relationship to `load()` finishing — Codex's round-2 SHOULD-FIX. It happened
  // to be enough for immediately-resolving stubs, but would flake under CI
  // scheduling variance or if the render path gained another await.
  //
  // The real completion condition is browse.astro's own contract: `load()` calls
  // hide('browse-loading') on every terminal branch (success, degraded, error),
  // so the loading element carrying `hidden` means the render path has finished
  // one way or another. Bounded, and it reports WHY it gave up.
  const settled = await waitFor(
    win,
    () => {
      const loading = dom.window.document.getElementById('browse-loading');
      return !!loading && loading.hasAttribute('hidden');
    },
    2000,
  );

  return { dom, win, unmatched, requested, errors, scriptCount: scripts.length, settled };
}

/**
 * Poll `cond` until true or `timeoutMs` elapses. Returns whether it settled, so
 * a caller can produce a useful failure message rather than an opaque assertion
 * on downstream state.
 */
async function waitFor(win: any, cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return cond();
}

describe('/browse ships real content in its RAW served HTML (no-JS / curl reader)', () => {
  // bugfix 2026-08-20: the previous defect was invisible to every prior test
  // in this file, because they all execute the page's JS in jsdom first —
  // exactly what a plain `curl` or a non-JS crawler never does. This suite
  // reads dist/browse/index.html RAW, strips tags the same way the live
  // bug was verified (fetch + strip tags, no JS engine at all), and asserts
  // on the plain visible text a non-JS reader actually receives.
  function stripTags(html: string): string {
    const noScript = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ' ').replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ');
    return noScript.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  it.runIf(built)('does not contain the literal error-placeholder text "Couldn\'t load results"', () => {
    const visible = stripTags(readFileSync(BROWSE_DIST, 'utf-8'));
    expect(visible).not.toContain("Couldn't load results");
  });

  it.runIf(built)('does not contain the literal loading-placeholder text as page content', () => {
    const visible = stripTags(readFileSync(BROWSE_DIST, 'utf-8'));
    expect(visible).not.toContain('Loading…');
  });

  it.runIf(built)('contains at least one real prerendered catalog card (title text) with no JS executed', () => {
    const visible = stripTags(readFileSync(BROWSE_DIST, 'utf-8'));
    // Any of the four artifact-type group headers is proof real catalog
    // sections were baked into the static HTML, not just chrome/nav copy.
    const hasGroupHeader = /Popular loops|Curated skills|Public bundles|Personalities/.test(visible);
    expect(hasGroupHeader, `no prerendered catalog group found in raw HTML — visible text was: ${visible.slice(0, 500)}`).toBe(true);
  });

  it.runIf(built)('#browse-results is non-empty in the RAW (unexecuted) served HTML', () => {
    const html = readFileSync(BROWSE_DIST, 'utf-8');
    const m = html.match(/<div id="browse-results"[^>]*>([\s\S]*?)<\/div>\s*<\/main>/);
    // The results container itself may have nested content; a coarse but
    // reliable proxy is that its innerHTML (as shipped, before any JS runs)
    // contains an artifact-card class, which only the prerender emits.
    expect(html, '#browse-results has no artifact-card markup in the raw build output').toMatch(/id="browse-results"[\s\S]{0,50}>[\s\S]*artifact-card/);
  });
});

describe('/browse renders its catalog (not just references the endpoint)', () => {
  it.runIf(built)('ships at least one inline script that executes without throwing', async () => {
    const { scriptCount, errors } = await renderBrowse();
    expect(scriptCount).toBeGreaterThan(0);
    expect(errors, `inline script threw: ${errors.join(' | ')}`).toEqual([]);
  });

  it.runIf(built)('paints real skill cards into #browse-results from the stubbed API', async () => {
    const { dom } = await renderBrowse();
    const results = dom.window.document.getElementById('browse-results');
    expect(results, '#browse-results missing from built page').toBeTruthy();

    const rendered = results!.innerHTML;
    // The load path must have replaced the empty container with card markup
    // built from OUR stub payload — proof the fetch ran AND the result was
    // rendered, which a grep can never establish.
    expect(rendered.length, 'browse-results stayed empty — load() never rendered').toBeGreaterThan(0);
    expect(rendered).toContain('stub-alpha');
    expect(rendered).toContain('stub-beta');
  });

  it.runIf(built)('renders every artifact type, so a single broken endpoint cannot silently empty a shelf', async () => {
    const { dom } = await renderBrowse();
    const rendered = dom.window.document.getElementById('browse-results')!.innerHTML;
    expect(rendered, 'bundles shelf empty').toContain('stub-bundle');
    expect(rendered, 'personalities shelf empty').toContain('stub-persona');
    expect(rendered, 'loops shelf empty').toContain('stub-loop');
    expect(rendered, 'federated/community shelf empty').toContain('stub-community');
  });

  it.runIf(built)('binds the Community-skills header to the LIVE feed envelope, not a hardcoded literal (issue #82)', async () => {
    const { dom } = await renderBrowse();
    const rendered = dom.window.document.getElementById('browse-results')!.innerHTML;
    // The stub feeds 3 enabled_sources and 1234 installable — the header
    // must echo THOSE, proving it is derived from the payload. On pre-fix
    // main this rendered the hardcoded "federated · 7 registries ·
    // install as-is" regardless of what the API said.
    expect(rendered).toContain('federated · 3 registries · 1,234 skills · install as-is');
    expect(rendered).not.toContain('7 registries');
  });

  it.runIf(built)('leaves the loading state and does NOT show the error state', async () => {
    const { dom } = await renderBrowse();
    const doc = dom.window.document;
    const loading = doc.getElementById('browse-loading');
    const error = doc.getElementById('browse-error');
    // `hidden` is how browse.astro's show()/hide() toggle these.
    expect(loading?.hasAttribute('hidden'), 'still stuck on the loading state').toBe(true);
    expect(error?.hasAttribute('hidden'), 'rendered the error state on a healthy API').toBe(true);
  });

  it.runIf(built)('reports a non-zero live item count', async () => {
    const { dom } = await renderBrowse();
    const count = dom.window.document.getElementById('browse-live-count')?.textContent || '';
    expect(count).toMatch(/\d+\s+items?/);
    expect(count).not.toMatch(/^0 items/);
  });

  it.runIf(built)('settles into a terminal render state within the timeout', async () => {
    const { settled } = await renderBrowse();
    expect(settled, 'load() never reached a terminal state — the loading element stayed visible').toBe(true);
  });

  it.runIf(built)('requests the exact endpoints its shelves depend on', async () => {
    // Pins the call graph explicitly rather than inferring it from rendered
    // output. Codex's round-2 review asserted from a static read that
    // /api/composite-loops would not be called (claiming /api/loops instead)
    // and that fetchFederated('') short-circuits on an empty query, so
    // /api/skills/external would never fire. Both were incorrect: browse.astro
    // calls /api/composite-loops FIRST and only falls back to /api/loops when
    // it fails or returns empty, and fetchFederated runs on empty-query browse
    // by design (feat/browse-federated-defaults — "where are all the skills?").
    // This assertion turns that disagreement into an executable fact.
    const { requested } = await renderBrowse();
    for (const path of [
      '/api/skills/search',
      '/api/bundles/discover',
      '/api/personalities',
      '/api/composite-loops',
      '/api/skills/external',
    ]) {
      expect(requested, `page never requested ${path} — got: ${requested.join(', ')}`).toContain(path);
    }
    // The verifier registry is a FALLBACK. Seeing it on a healthy composite
    // fetch means the primary path silently failed.
    expect(requested, '/api/loops was called despite a healthy /api/composite-loops response').not.toContain('/api/loops');
  });

  it.runIf(built)('called no unrouted API path (catches a silently renamed endpoint)', async () => {
    const { unmatched } = await renderBrowse();
    expect(unmatched, `browse called endpoints this test does not know about: ${unmatched.join(', ')}`).toEqual([]);
  });

  it.runIf(built)('is not an SPA-fallback copy of the homepage', () => {
    // Byte-count equality was the old, weak form of this check. Compare the
    // actual documents — a fallback that differs by one byte of injected
    // metadata would slip past a size comparison.
    const home = readFileSync(HOME_DIST, 'utf-8');
    const browse = readFileSync(BROWSE_DIST, 'utf-8');
    expect(browse).not.toEqual(home);
    expect(browse).toContain('browse-results');
  });
});

describe('/browse source contract', () => {
  // Source-level guards. These run without a build so a fresh clone still gets
  // signal, and they pin the specific regressions this page has already shipped.
  const src = readFileSync(BROWSE_SRC, 'utf-8');

  it('build-time prerender (if any) only ever calls fetchApi (retry+fallback), never a raw fetch', () => {
    // bugfix 2026-08-20: /browse now DOES do a build-time catalog prerender
    // in frontmatter — the sanctioned pattern AGENTS.md carves out for
    // catalog pages (see index.astro, skills/[slug].astro getStaticPaths),
    // added specifically so curl/non-JS crawlers see a real catalog instead
    // of the literal strings "Loading…" / "Couldn't load results." that used
    // to ship in static HTML. AGENTS.md's ban is on RAW, un-retried,
    // fallback-less fetches for USER data — not on this. The guard that
    // still matters: frontmatter must never call the bare `fetch(` directly
    // (which has no retry/backoff/timeout and no ok/error discriminated
    // result), only the wrapped `fetchApi()` helper from ../lib/api, which
    // has both — and the whole prerender block must be wrapped so a failure
    // degrades to empty groups, never an unhandled build failure.
    const frontmatter = (src.match(/^---\s*([\s\S]*?)\s*---/m) || [])[1] || '';
    // No bare `fetch(` call — only through the fetchApi wrapper.
    const rawFetchCalls = frontmatter.match(/(?<!\.)\bawait\s+fetch\(/g) || [];
    expect(rawFetchCalls, 'frontmatter calls the raw fetch() directly instead of the retry+fallback fetchApi() wrapper').toEqual([]);
    // The prerender fetches must be inside a try/catch so an API-down build
    // degrades to empty groups rather than failing the whole build (WIS-737
    // class — see AGENTS.md "Build-time fetch ban").
    if (/fetchApi/.test(frontmatter)) {
      expect(frontmatter, 'frontmatter calls fetchApi without a surrounding try/catch fallback').toMatch(/try\s*{[\s\S]*fetchApi[\s\S]*}\s*catch/);
    }
  });

  it('keeps the LIVE re-fetch on the client (progressive enhancement stays intact)', () => {
    // The build-time prerender above is a first paint only — load() in the
    // client <script> must still exist and still hit the live endpoints, so
    // JS-capable visitors get freshened/live data, not a frozen build-time
    // snapshot forever.
    const scriptMatch = src.match(/<script[^>]*define:vars[\s\S]*?<\/script>/);
    expect(scriptMatch, 'client <script> block not found').toBeTruthy();
    const clientScript = scriptMatch![0];
    expect(clientScript, 'client script lost its live catalog fetch (fetchBrowseDefaults)').toMatch(/fetchBrowseDefaults/);
    expect(clientScript, 'client script lost its live search fetch (fetchSearch)').toMatch(/fetchSearch/);
  });

  it('does not request more than the API caps (limit<=20 on /api/search)', () => {
    // fc0d01f shipped limit=50 against `le=20` and 422'd every search silently.
    const searchCalls = src.match(/\/api\/search\?[^`'"]*/g) || [];
    for (const call of searchCalls) {
      const m = call.match(/limit=(\d+)/);
      if (m) expect(Number(m[1]), `/api/search limit ${m[1]} exceeds the API cap of 20`).toBeLessThanOrEqual(20);
    }
  });

  it('does not request page_size above the API cap of 100', () => {
    const calls = src.match(/page_size=(\d+)/g) || [];
    for (const call of calls) {
      const n = Number(call.split('=')[1]);
      expect(n, `page_size ${n} exceeds the API cap of 100`).toBeLessThanOrEqual(100);
    }
  });
});
