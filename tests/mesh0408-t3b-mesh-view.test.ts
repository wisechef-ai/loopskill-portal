/**
 * mesh0408 T3-B — /mesh: per-assignment fleet convergence view.
 *
 * TDD-first for the phase's actual deliverable: the four-state freshness
 * contract (dead / stale / partitioned / unauthorized — codex-flagged,
 * plan \u00a73 T3-B.5) rendered as FOUR VISUALLY DISTINCT treatments, never
 * collapsed into one "offline" bucket, PLUS never_attempted rendered
 * distinctly from failing (dead).
 *
 * Pattern follows tests/spotify-2607-browse-renders.test.ts: execute the
 * REAL inline script from the REAL built dist/mesh/index.html in jsdom
 * against a stubbed API, and assert on the DOM the render path actually
 * produced \u2014 not a grep of the source.
 *
 * Fixture is the verified prod shape from the parent's live probe
 * (fleet wise-agents-supervision, GET /api/fleets/{id}/convergence):
 *   atomic-habits, cron-watchdog, dreaming -> never_attempted
 *   p4-loop-proof -> converged, age ~897s
 * "dead" (failing) and "stale" (converged past threshold) are added here
 * since prod does not currently have either, so the contract is exercised
 * even though today's fleet happens to be all-green/never-attempted.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const MESH_DIST = join(ROOT, 'dist/mesh/index.html');
const MESH_SRC = join(ROOT, 'src/pages/mesh.astro');

const built = existsSync(MESH_DIST);

const FLEET_ID = '11111111-1111-1111-1111-111111111111';

// Real-shaped fixture: the prod probe rows plus a deliberately-added
// 'failing' (dead) row and a converged-but-old (stale) row so all four
// freshness states are exercised in one render.
const CONVERGENCE_PAYLOAD = {
  fleet_id: FLEET_ID,
  fleet_name: 'wise-agents-supervision',
  status: 'red', // flips red because of the injected 'failing' row below
  assignment_count: 5,
  failing_count: 1,
  never_attempted_count: 3,
  drifting_count: 0,
  assignments: [
    { loop_key: 'atomic-habits', state: 'never_attempted', desired_epoch: 3, observed_epoch: null, consecutive_failures: 0, convergence_age_seconds: null },
    { loop_key: 'cron-watchdog', state: 'never_attempted', desired_epoch: 1, observed_epoch: null, consecutive_failures: 0, convergence_age_seconds: null },
    { loop_key: 'dreaming', state: 'never_attempted', desired_epoch: 2, observed_epoch: null, consecutive_failures: 0, convergence_age_seconds: null },
    { loop_key: 'p4-loop-proof', state: 'converged', desired_epoch: 41, observed_epoch: 41, consecutive_failures: 0, convergence_age_seconds: 897 },
    // stale: converged but the last passing run is far older than the
    // page's STALE_THRESHOLD_SECONDS (1h) — must render distinctly from
    // a fresh converged row.
    { loop_key: 'weekly-report', state: 'converged', desired_epoch: 5, observed_epoch: 5, consecutive_failures: 0, convergence_age_seconds: 7200 },
    // dead: state === 'failing' — must render distinctly from never_attempted.
    { loop_key: 'broken-sync', state: 'failing', desired_epoch: 9, observed_epoch: 7, consecutive_failures: 6, convergence_age_seconds: 1800 },
  ],
};

const FLEETS_PAYLOAD = { fleets: [{ fleet_id: FLEET_ID, name: 'wise-agents-supervision' }] };

const EMPTY_CONVERGENCE_PAYLOAD = {
  fleet_id: FLEET_ID,
  fleet_name: 'wise-agents-supervision',
  status: 'green',
  assignment_count: 0,
  failing_count: 0,
  never_attempted_count: 0,
  drifting_count: 0,
  assignments: [],
};

function stubFetch(mode: 'ok' | 'unauthorized' | 'partitioned-5xx' | 'partitioned-network' | 'empty', requested: string[]) {
  return (url: string) => {
    const raw = String(url);
    let path = raw;
    try { path = new URL(raw, 'https://app.loopskill.io').pathname; } catch { /* recorded raw below */ }
    requested.push(path);

    const json = (body: unknown, status = 200) =>
      Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

    if (path === '/api/fleets') {
      if (mode === 'unauthorized') return json({}, 401);
      return json(FLEETS_PAYLOAD);
    }
    if (path === `/api/fleets/${FLEET_ID}/convergence`) {
      if (mode === 'unauthorized') return json({}, 401);
      if (mode === 'partitioned-5xx') return json({}, 502);
      if (mode === 'partitioned-network') return Promise.reject(new Error('network down'));
      if (mode === 'empty') return json(EMPTY_CONVERGENCE_PAYLOAD);
      return json(CONVERGENCE_PAYLOAD);
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };
}

async function renderMesh(mode: 'ok' | 'unauthorized' | 'partitioned-5xx' | 'partitioned-network' | 'empty' = 'ok') {
  const html = readFileSync(MESH_DIST, 'utf-8');
  const requested: string[] = [];

  const dom = new JSDOM(html, {
    url: 'https://app.loopskill.io/mesh',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const win = dom.window as any;
  win.fetch = stubFetch(mode, requested);
  win.matchMedia = win.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  // jsdom already provides a real localStorage on window; the page's own
  // try/catch around localStorage access (readApiKey()) covers environments
  // where it's unavailable, so nothing further to stub here.

  const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);
  const allScripts = Array.from(dom.window.document.querySelectorAll('script'));

  // Astro externalizes TS <script> blocks in .astro files to hashed
  // /_astro/*.js bundle files referenced via src=. Inline eval (the
  // spotify-2607-browse-renders.test.ts pattern) only covers scripts with
  // literal textContent, so those must be read off disk and eval'd too, or
  // the page's actual client logic never runs and every assertion below
  // would be testing an inert shell.
  const inlineScripts = allScripts.filter((s: any) => {
    if (s.src) return false;
    if (!s.textContent || !s.textContent.trim()) return false;
    return JS_TYPES.has((s.getAttribute('type') || '').toLowerCase());
  });
  const localBundledScripts = allScripts.filter((s: any) => {
    if (!s.src) return false;
    const type = (s.getAttribute('type') || '').toLowerCase();
    return (type === '' || type === 'module' || type === 'text/javascript') && s.getAttribute('src').startsWith('/_astro/');
  });

  const errors: string[] = [];
  let executedCount = 0;
  for (const s of inlineScripts) {
    try { win.eval((s as any).textContent); executedCount++; } catch (err) { errors.push(String(err)); }
  }
  for (const s of localBundledScripts) {
    const bundlePath = join(ROOT, 'dist', (s as any).getAttribute('src'));
    if (!existsSync(bundlePath)) { errors.push(`bundle not found on disk: ${bundlePath}`); continue; }
    const code = readFileSync(bundlePath, 'utf-8');
    try { win.eval(code); executedCount++; } catch (err) { errors.push(String(err)); }
  }

  const settled = await waitFor(
    win,
    () => {
      const doc = dom.window.document;
      const loading = doc.getElementById('mesh-loading');
      const stageVisible = doc.getElementById('mesh-stage') && !doc.getElementById('mesh-stage').hasAttribute('hidden');
      const unauthVisible = doc.getElementById('mesh-unauthorized') && !doc.getElementById('mesh-unauthorized').hasAttribute('hidden');
      const partVisible = doc.getElementById('mesh-partitioned') && !doc.getElementById('mesh-partitioned').hasAttribute('hidden');
      const emptyVisible = doc.getElementById('mesh-empty') && !doc.getElementById('mesh-empty').hasAttribute('hidden');
      const stillLoading = !!loading && !loading.hasAttribute('hidden');
      return !stillLoading && !!(stageVisible || unauthVisible || partVisible || emptyVisible);
    },
    2500,
  );

  return { dom, win, requested, errors, scriptCount: executedCount, settled };
}

async function waitFor(win: any, cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return cond();
}

describe('/mesh renders per-assignment convergence (not just references the endpoint)', () => {
  it.runIf(built)('ships at least one inline script that executes without throwing', async () => {
    const { scriptCount, errors } = await renderMesh('ok');
    expect(scriptCount).toBeGreaterThan(0);
    expect(errors, `inline script threw: ${errors.join(' | ')}`).toEqual([]);
  });

  it.runIf(built)('settles into a terminal render state within the timeout', async () => {
    const { settled } = await renderMesh('ok');
    expect(settled, 'page never reached a terminal state').toBe(true);
  });

  it.runIf(built)('requests /api/fleets and the fleet-scoped /convergence endpoint', async () => {
    const { requested } = await renderMesh('ok');
    expect(requested).toContain('/api/fleets');
    expect(requested).toContain(`/api/fleets/${FLEET_ID}/convergence`);
  });

  it.runIf(built)('paints one row per assignment into the table', async () => {
    const { dom } = await renderMesh('ok');
    const tbody = dom.window.document.getElementById('mesh-tbody');
    expect(tbody, '#mesh-tbody missing from built page').toBeTruthy();
    const rows = tbody!.querySelectorAll('tr');
    expect(rows.length).toBe(CONVERGENCE_PAYLOAD.assignments.length);
    const rendered = tbody!.innerHTML;
    for (const a of CONVERGENCE_PAYLOAD.assignments) {
      expect(rendered, `row for ${a.loop_key} missing`).toContain(a.loop_key);
    }
  });

  it.runIf(built)('renders loop_key, desired vs observed revision, consecutive failures, and age per row', async () => {
    const { dom } = await renderMesh('ok');
    const tbody = dom.window.document.getElementById('mesh-tbody')!;
    const row = tbody.querySelector('tr[data-loop="p4-loop-proof"]')!;
    expect(row, 'p4-loop-proof row missing').toBeTruthy();
    const text = row.textContent || '';
    expect(text).toContain('p4-loop-proof');
    expect(text).toContain('41'); // desired == observed epoch
    expect(text).toMatch(/\d+m|\d+s|\d+(\.\d+)?h/); // rendered age
  });
});

describe('/mesh — the four-state freshness contract (THE POINT of this phase)', () => {
  it.runIf(built)('dead (failing) renders with data-freshness="dead", distinct from every other state', async () => {
    const { dom } = await renderMesh('ok');
    const row = dom.window.document.querySelector('tr[data-loop="broken-sync"]');
    expect(row, 'broken-sync (failing) row missing').toBeTruthy();
    expect(row!.getAttribute('data-freshness')).toBe('dead');
  });

  it.runIf(built)('stale (converged past threshold) renders with data-freshness="stale", distinct from a fresh converged row', async () => {
    const { dom } = await renderMesh('ok');
    const staleRow = dom.window.document.querySelector('tr[data-loop="weekly-report"]');
    const freshRow = dom.window.document.querySelector('tr[data-loop="p4-loop-proof"]');
    expect(staleRow!.getAttribute('data-freshness')).toBe('stale');
    expect(freshRow!.getAttribute('data-freshness')).toBe('converged');
    expect(staleRow!.getAttribute('data-freshness')).not.toBe(freshRow!.getAttribute('data-freshness'));
  });

  it.runIf(built)('unauthorized (401) renders the sign-in path, never the broken-fleet path', async () => {
    const { dom } = await renderMesh('unauthorized');
    const doc = dom.window.document;
    expect(doc.getElementById('mesh-unauthorized')!.hasAttribute('hidden'), 'unauthorized panel not shown on 401').toBe(false);
    expect(doc.getElementById('mesh-partitioned')!.hasAttribute('hidden'), 'partitioned panel wrongly shown on 401').toBe(true);
    expect(doc.getElementById('mesh-stage')!.hasAttribute('hidden'), 'table wrongly shown on 401').toBe(true);
    const text = doc.getElementById('mesh-unauthorized')!.textContent || '';
    expect(text.toLowerCase()).toContain('sign in');
  });

  it.runIf(built)('partitioned (5xx) renders the visibility-gap path, never claims the fleet is down', async () => {
    const { dom } = await renderMesh('partitioned-5xx');
    const doc = dom.window.document;
    expect(doc.getElementById('mesh-partitioned')!.hasAttribute('hidden'), 'partitioned panel not shown on 5xx').toBe(false);
    expect(doc.getElementById('mesh-unauthorized')!.hasAttribute('hidden'), 'unauthorized panel wrongly shown on 5xx').toBe(true);
    expect(doc.getElementById('mesh-stage')!.hasAttribute('hidden'), 'table wrongly shown on 5xx').toBe(true);
    const text = (doc.getElementById('mesh-partitioned')!.textContent || '').toLowerCase();
    // Must not assert the fleet is unhealthy — only that we cannot see it.
    expect(text).not.toMatch(/fleet is down|fleet is unhealthy|fleet failed/);
  });

  it.runIf(built)('partitioned (network failure) renders the same visibility-gap path as a 5xx', async () => {
    const { dom } = await renderMesh('partitioned-network');
    const doc = dom.window.document;
    expect(doc.getElementById('mesh-partitioned')!.hasAttribute('hidden'), 'partitioned panel not shown on network failure').toBe(false);
  });

  it.runIf(built)('all four freshness states use pairwise-distinct badge treatments', async () => {
    const { dom } = await renderMesh('ok');
    const tbody = dom.window.document.getElementById('mesh-tbody')!;
    const byLoop = (k: string) => tbody.querySelector(`tr[data-loop="${k}"] span`)!.className;
    const deadClass = byLoop('broken-sync');
    const staleClass = byLoop('weekly-report');
    const neverClass = byLoop('atomic-habits');
    const convergedClass = byLoop('p4-loop-proof');
    const classes = [deadClass, staleClass, neverClass, convergedClass];
    // Pairwise distinct — a collapse anywhere shows up as a duplicate.
    expect(new Set(classes).size, `expected 4 distinct badge classes, got: ${classes.join(' || ')}`).toBe(4);
  });
});

describe('/mesh — never_attempted is distinct from failing (dead)', () => {
  it.runIf(built)('never_attempted rows carry data-freshness="never_attempted", not "dead"', async () => {
    const { dom } = await renderMesh('ok');
    for (const key of ['atomic-habits', 'cron-watchdog', 'dreaming']) {
      const row = dom.window.document.querySelector(`tr[data-loop="${key}"]`);
      expect(row, `${key} row missing`).toBeTruthy();
      expect(row!.getAttribute('data-freshness'), `${key} misclassified`).toBe('never_attempted');
    }
  });

  it.runIf(built)('never_attempted badge text differs from the dead/failing badge text', async () => {
    const { dom } = await renderMesh('ok');
    const tbody = dom.window.document.getElementById('mesh-tbody')!;
    const neverText = (tbody.querySelector('tr[data-loop="atomic-habits"] span')!.textContent || '').toLowerCase();
    const deadText = (tbody.querySelector('tr[data-loop="broken-sync"] span')!.textContent || '').toLowerCase();
    expect(neverText).not.toBe(deadText);
    expect(neverText).not.toMatch(/dead|fail/);
    expect(deadText).not.toMatch(/never/);
  });
});

describe('/mesh — honest empty state (not a spinner forever)', () => {
  it.runIf(built)('zero assignments renders an explicit empty message, not the loading spinner', async () => {
    const { dom } = await renderMesh('empty');
    const doc = dom.window.document;
    expect(doc.getElementById('mesh-loading')!.hasAttribute('hidden'), 'stuck on loading spinner with zero assignments').toBe(true);
    expect(doc.getElementById('mesh-stage')!.hasAttribute('hidden')).toBe(false);
    expect(doc.getElementById('mesh-assignments-empty')!.hasAttribute('hidden'), 'assignments-empty state not shown').toBe(false);
    expect(doc.getElementById('mesh-table-wrap')!.hasAttribute('hidden'), 'empty table still shown').toBe(true);
  });
});

describe('/mesh source contract', () => {
  const src = readFileSync(MESH_SRC, 'utf-8');

  it('keeps the convergence fetch on the client, never in frontmatter', () => {
    const frontmatter = (src.match(/^---\s*([\s\S]*?)\s*---/m) || [])[1] || '';
    expect(frontmatter).not.toMatch(/await\s+fetch/);
  });

  it('uses credentials:"include" for the authed fetch (matches library.astro/fleet-map.astro convention)', () => {
    expect(src).toContain("credentials: 'include'");
  });

  it('has NO free-text fleet-id input — the picker is populated only from /api/fleets', () => {
    // Acceptance gate: no cross-tenant leak via an arbitrary fleet_id field.
    expect(src).not.toMatch(/<input[^>]*fleet[^>]*id/i);
    expect(src).toContain('/api/fleets');
  });

  it('carries no chat console (plan lock #4)', () => {
    expect(src.toLowerCase()).not.toMatch(/chat[- ]?console|chat[- ]?input|send message/);
  });

  it('classifies dead/stale/partitioned/unauthorized as four distinct branches, not one "offline" bucket', () => {
    // Strip comments first — the file's own header explains the anti-pattern
    // it avoids ("collapsed into one 'offline' bucket"), which is prose
    // about the defect, not a state literal. Check the CODE, not the docs.
    const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toMatch(/["']offline["']/);
    expect(src).toContain("'dead'");
    expect(src).toContain("'stale'");
    expect(src).toContain('renderPartitioned');
    expect(src).toContain('renderUnauthorized');
  });

  it('never_attempted has its own classification branch, separate from failing', () => {
    expect(src).toContain("'never_attempted'");
    expect(src).toContain("a.state === 'failing'");
  });
});
