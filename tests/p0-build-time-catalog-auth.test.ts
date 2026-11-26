// @vitest-environment node
/**
 * tests/p0-build-time-catalog-auth.test.ts — the build must PRESENT the key on
 * public catalog endpoints, and must still FAIL CLOSED (never invent) when it
 * cannot reach the catalog.
 *
 * THE BUG THIS KILLS (kanban t_c50df5cd, 2026-11-16)
 * --------------------------------------------------
 * `src/pages/index.astro` builds the homepage's flagship fleet-drift-matrix
 * columns from `GET /api/skills/search?page_size=12`. That endpoint is public,
 * so the call was made with `{ authed: false }` — no `x-api-key` — which puts
 * it in loopskill-api's 60/min-per-IP anonymous bucket
 * (`app/middleware/rate_limit.py`: only `auth_ctx.scope != "anonymous"` skips
 * it). A whole static build fires dozens of those from one IP in seconds, so
 * the bucket saturates and the matrix silently disappears from a SHIPPED build.
 * Measured from wisechef-agents the same day: anonymous → 429 on 8 of 8
 * attempts (retries included); the identical request with a `rec_live_*` key →
 * 200, byte-identical body (sha256 `bd32659877cfa9c5…` both ways).
 *
 * THE FIX, AND WHY THE KEY IS SAFE TO SEND
 * ----------------------------------------
 * `fetchApi` gained `sendKeyEvenIfPublic`, which attaches `x-api-key` while the
 * call keeps its public-endpoint semantics: no key, or a bad key, degrades to
 * anonymous — never a 401, never a different page. It is only allowed on
 * endpoints PROVEN to ignore the caller in their response. The second half of
 * this file is the ledger of that proof and the rule that keeps it true:
 *
 *   • a public catalog path in KEY_ON_PUBLIC_VERIFIED must send the key —
 *     silently reverting one to anonymous is what let the matrix vanish;
 *   • a path in KEEP_ANONYMOUS must never send it — `/api/skills/{slug}` opens
 *     its body for paid callers (skill_routes.py:1136-1146), so a keyed build
 *     would bake paywalled text into a public static page;
 *   • every call site must be classified, and every ledger row must carry its
 *     evidence. An unclassified new call site is red, not "unspecified, ship it".
 *
 * WHAT THIS DOES *NOT* DO
 * -----------------------
 * It does not make a degraded build fail. The omission is the DESIGNED
 * fail-closed branch (an unreachable catalog must never mint skill names or
 * versions — see index.astro's claim-discipline header and the identity guards
 * in scripts/assert-dist.sh), and a transient 429 must not block an unrelated
 * deploy. Degradation is made LOUD (build log + `::warning::` annotation + the
 * `catalog-health` stamp assert-dist.sh reads), not fatal. The hard gate lives
 * in tests/landing-onramp.test.ts under REQUIRE_ONRAMP_MATRIX=1, on the
 * unattended rebuilds only.
 *
 * DIST CONTRACT: the built-output block is wired into a post-build CI step
 * with REQUIRE_CATALOG_DIST=1 (see .github/workflows/ci.yml). There, a missing
 * dist throws instead of self-skipping — the rot class killed by
 * tests/dist-guard-coverage.test.ts.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative } from 'node:path';
import { distDescribe, distAssert, ciWarn } from './lib/dist-guard';

const ROOT = resolve(__dirname, '..');
const DIST_INDEX = join(ROOT, 'dist/index.html');
const REQUIRE_DIST = process.env.REQUIRE_CATALOG_DIST;

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — fetchApi's wire behaviour, against a stub that enforces the bucket
// ─────────────────────────────────────────────────────────────────────────────
//
// The stub is the card's negative control in miniature: a request without
// `x-api-key` gets the rate limiter's real 429 body, a request with one gets a
// catalog payload. Everything below is therefore measuring what went ON THE
// WIRE, not what a mock was told to return.

type Hit = { url: string; hasKey: boolean };
const hits: Hit[] = [];

const CATALOG_BODY = {
  total: 61,
  results: [
    { slug: 'super-memory', title: 'super-memory', latest_version: '1.0.2' },
    { slug: 'pr-draft', title: 'pr-draft', latest_version: '1.0.0' },
    { slug: 'arxiv', title: 'arxiv', latest_version: '1.0.0' },
    { slug: 'copywriting', title: 'copywriting', latest_version: '1.0.0' },
    { slug: 'repo-viz', title: 'repo-viz', latest_version: '1.0.0' },
  ],
};

const server: Server = createServer((req, res) => {
  const key = req.headers['x-api-key'];
  const hasKey = typeof key === 'string' && key.length > 0;
  hits.push({ url: req.url ?? '', hasKey });
  if (!hasKey) {
    // Body and status copied from app/middleware/rate_limit.py's JSONResponse.
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Rate limit exceeded. Try again later.' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(CATALOG_BODY));
});

const BASE: string = await new Promise<string>((r) =>
  server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as any).port}`)),
);

afterAll(() => server.close());

// fetchApi dedupes by (auth mode, url) for the lifetime of the module, so every
// case needs its own URL or it would be served an earlier case's promise.
let seq = 0;
const nextUrl = (path = '/api/skills/search?page_size=12') => `${BASE}${path}&_c=${++seq}`;
const hitsFor = (url: string) => hits.filter((h) => h.url === url.slice(BASE.length));

// Fast retries: the production defaults (5 attempts, up to 6s) are the point
// when the bucket is briefly busy; here we only care what the wire looked like.
const FAST = { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 2, timeoutMs: 4000 };

const { fetchApi } = await import('../src/lib/api');

describe('fetchApi — key presentation on public catalog endpoints', () => {
  it('a call that declares itself public sends no key and FAILS CLOSED on the 429', async () => {
    const url = nextUrl();
    const res = await fetchApi<any>(url, { authed: false, apiKey: null, ...FAST });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.data).toBeNull(); // no data, no invented rows — the contract
    const seen = hitsFor(url);
    expect(seen.length).toBe(2); // it did retry
    expect(seen.every((h) => !h.hasKey)).toBe(true); // and never presented a key
  });

  it('sendKeyEvenIfPublic puts x-api-key on a public call and the same request succeeds', async () => {
    const url = nextUrl();
    const res = await fetchApi<any>(url, {
      authed: false,
      sendKeyEvenIfPublic: true,
      apiKey: 'NOT-A-REAL-KEY-stub-only',
      ...FAST,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data?.results?.length).toBe(5); // 5 = exactly what showMatrix needs
    expect(hitsFor(url).every((h) => h.hasKey)).toBe(true);
  });

  it('an authed call still sends the key (no behaviour change for private endpoints)', async () => {
    const url = nextUrl();
    const res = await fetchApi<any>(url, { apiKey: 'NOT-A-REAL-KEY-stub-only', ...FAST });
    expect(res.ok).toBe(true);
    expect(hitsFor(url).every((h) => h.hasKey)).toBe(true);
  });

  it('with NO key available, sendKeyEvenIfPublic changes nothing and the call fails closed', async () => {
    const url = nextUrl();
    const res = await fetchApi<any>(url, {
      authed: false,
      sendKeyEvenIfPublic: true,
      apiKey: null, // the CI-secret-missing / dev-box world
      ...FAST,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.data).toBeNull();
    expect(hitsFor(url).every((h) => !h.hasKey)).toBe(true);
  });

  it('the dedupe cache cannot serve a keyed response to an anonymous caller (or vice versa)', async () => {
    // THE LATENT BUG: the build-time cache was keyed by URL alone, so index
    // .astro's two identical `/api/skills/search?page_size=12` fetches — one
    // authenticated (the popular rail), one `{ authed: false }` (the drift
    // matrix) — collapsed into whichever fired FIRST. The matrix's declared
    // intent was decorative. The same collision in the other direction is
    // worse than a wrong rate class: it hands a keyed response to a page that
    // declared it was fetching publicly.
    const url = nextUrl();

    const anon = await fetchApi<any>(url, { authed: false, apiKey: null, ...FAST });
    const keyed = await fetchApi<any>(url, {
      authed: false,
      sendKeyEvenIfPublic: true,
      apiKey: 'NOT-A-REAL-KEY-stub-only',
      ...FAST,
    });

    expect(anon.ok).toBe(false); // the anonymous caller was NOT served the keyed result
    expect(keyed.ok).toBe(true); // and the keyed caller was not poisoned by the anonymous 429

    const seen = hitsFor(url);
    expect(seen.filter((h) => h.hasKey).length).toBeGreaterThan(0);
    expect(seen.filter((h) => !h.hasKey).length).toBeGreaterThan(0);
  });

  it('identical requests still dedupe to ONE network call (the cache is not broken)', async () => {
    const url = nextUrl();
    const opts = { authed: false, sendKeyEvenIfPublic: true, apiKey: 'NOT-A-REAL-KEY-stub-only', ...FAST };
    const [a, b] = await Promise.all([fetchApi(url, opts), fetchApi(url, opts)]);
    expect(a.ok && b.ok).toBe(true);
    expect(hitsFor(url).length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — the ledger: which endpoints may carry the key, and on the record
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Every entry was read in loopskill-api at HEAD on 2026-11-16, and every
 * payload was diffed live: anonymously from wisechef-hq (a clean IP, so the
 * anonymous bucket answers) against keyed from wisechef-agents (whose bucket is
 * saturated), volatile timestamp fields stripped, sha256 compared. The full
 * table is in the card's evidence (evidence/key-invariance.txt).
 */
const KEY_ON_PUBLIC_VERIFIED: Array<{ path: string; handler: string; evidence: string }> = [
  {
    path: '/api/skills/search',
    handler: 'skill_routes.py:search_skills',
    evidence:
      'filters Skill.is_public == True unconditionally; the only auth-derived lines (296-299) attribute ' +
      'ZERO-RESULT queries to a key for demand telemetry, and build-time calls send no ?q=. ' +
      'Anon-vs-keyed body sha256 identical (bd32659877cfa9c5… for page_size=12).',
  },
  {
    path: '/api/skills/external',
    handler: 'skill_routes.py:get_external_skills',
    evidence:
      'auth-derived lines are force_refresh = bool(refresh) and caller_is_master (a MASTER-ONLY live ' +
      're-walk + cache write — see the FORBIDDEN_PARAMS rule below) and zero-result demand telemetry ' +
      '(needs ?q= plus enabled sources). Anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/skills/graph',
    handler: 'skill_routes.py:get_full_skill_graph',
    evidence: 'handler reads no caller state; anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/mcp/healthz',
    handler: 'mcp/server.py:mcp_healthz',
    evidence: '7-line handler, no caller state; anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/connectors',
    handler: 'connector_routes.py:browse_connectors',
    evidence: 'is_public/is_archived filters unconditional; no request param at all.',
  },
  {
    path: '/api/bootcamp',
    handler: 'bootcamp_routes.py:list_bootcamp_tracks',
    evidence: 'no caller state; anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/bootcamp/{x}',
    handler: 'bootcamp_routes.py:get_bootcamp_track',
    evidence: 'no caller state; anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/marketing/counts',
    handler: 'marketing_routes.py:marketing_counts',
    evidence: 'no auth-derived token in the handler; anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/marketing/snapshot',
    handler: 'marketing_routes.py:marketing_snapshot',
    evidence: 'no auth-derived token in 167 lines; anon-vs-keyed payloads identical.',
  },
  {
    path: '/api/stats',
    handler: 'core_routes.py:marketplace_stats',
    evidence: 'api_key_id appears only as an InstallEvent join column, never from the caller.',
  },
  {
    path: '/api/personalities',
    handler: 'personality_routes.py:list_personalities',
    evidence: '19-line handler, args (db) only — no request/caller parameter exists to branch on.',
  },
  {
    path: '/api/personalities/{x}',
    handler: 'personality_routes.py:get_personality',
    evidence: '29-line handler, args (slug, db) — no request/caller parameter exists to branch on.',
  },
  {
    path: '/api/loops',
    handler: 'verifier_routes.py:list_verifiers (mounted as /api/loops + /api/verifiers)',
    evidence: 'args are (q, category, tag, limit, db) — no request/caller at all.',
  },
  {
    path: '/api/loops/{x}',
    handler: 'verifier_routes.py:get_verifier',
    evidence: 'args are (slug, db) — no request/caller at all.',
  },
  {
    path: '/api/composite-loops',
    handler: 'composite_loop_routes.py:list_composite_loops',
    evidence: 'no auth-derived token.',
  },
  {
    path: '/api/composite-loops/{x}',
    handler: 'composite_loop_routes.py:get_composite_loop',
    evidence: 'no auth-derived token.',
  },
  {
    path: '/api/bundles/discover',
    handler: 'bundle_routes.py:discover_cookbooks',
    evidence: 'visibility == "public" filter, args (db, limit, offset, sort) — docstring: public, no auth.',
  },
  {
    path: '/api/bundles/public/{x}',
    handler: 'bundle_routes.py:public_cookbook_page',
    evidence: 'args (slug, db); docstring "Public cookbook page by slug. No auth. 404 unless visibility=public".',
  },
  {
    path: '/.well-known/agent.json',
    handler: 'agent_wellknown_routes.py:agent_descriptor',
    evidence: 'static agent descriptor; no caller state.',
  },
];

/**
 * Endpoints that MUST stay keyless. Each reason is a hazard the key creates,
 * not a preference — sending a key here would change what a PUBLIC static page
 * is allowed to print.
 */
const KEEP_ANONYMOUS: Array<{ path: string; reason: string }> = [
  {
    path: '/api/skills/{x}',
    reason:
      'public skill DETAIL. The body paywall opens for paid callers (skill_routes.py:1136-1146 reads ' +
      'auth_ctx.tier / caller_is_master via _is_paid_tier), so a build that presented a key would bake ' +
      'caller-scoped readme text into a public, indexable static page. It must render what a visitor ' +
      'with no credentials sees.',
  },
];

/** Params that must NEVER appear on a build-time call, whatever the endpoint. */
const FORBIDDEN_PARAMS: Array<{ path: string; param: RegExp; why: string }> = [
  {
    path: '/api/skills/external',
    param: /[?&]refresh=/,
    why:
      '?refresh=1 is MASTER-ONLY and forces a live federated re-walk + cache write ' +
      '(skill_routes.py:535-536). A build triggering an admin re-index is both a slow-build ' +
      'and an upstream-hammering defect; it is unreachable today only because nobody passes it.',
  },
];

function listSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (p.endsWith('.astro') || p.endsWith('.ts')) out.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  return out;
}

function callSpan(src: string, openParen: number): number {
  let depth = 0;
  let started = false;
  for (let j = openParen; j < Math.min(src.length, openParen + 2000); j++) {
    const c = src[j];
    if (c === '(') {
      depth += 1;
      started = true;
    } else if (c === ')') {
      depth -= 1;
      if (started && depth === 0) return j + 1;
    }
  }
  return -1;
}

type Site = { file: string; line: number; path: string; anon: boolean; sendsKey: boolean; call: string };

function collectCallSites(): Site[] {
  const sites: Site[] = [];
  for (const file of listSourceFiles()) {
    const src = readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/\bfetchApi\b/g)) {
      const from = m.index + m[0].length;
      const open = src.indexOf('(', from);
      if (open < 0) continue;
      // Between the name and its '(' only whitespace or a complete <generic>
      // list may sit. Anything else (an import clause, prose in a comment) is
      // not a call. NOTE: skipping on "any non-space" would silently drop every
      // `fetchApi<T>(…)` call — i.e. almost all of them — and the rules below
      // would go green while scanning nothing. The count floor at the end of
      // this block is the belt to that pair of braces.
      const between = src.slice(from, open);
      if (between.trim() !== '' && !/^\s*<[\s\S]*>\s*$/.test(between)) continue;
      const end = callSpan(src, open);
      if (end < 0) continue;
      const call = src.slice(m.index, end);
      const pathMatch = call.match(/\(\s*(?:<[\s\S]*?>\s*)?(`[^`]*`|'[^']*'|"[^"]*")/);
      if (!pathMatch) continue; // computed URL the parser cannot name — fails the total-count rule below
      const raw = pathMatch[1].slice(1, -1);
      const path = raw.replace(/\$\{[^}]*\}/g, '{x}').split('?')[0];
      sites.push({
        file: relative(ROOT, file),
        line: src.slice(0, m.index).split('\n').length,
        path,
        anon: /authed\s*:\s*false/.test(call),
        sendsKey: /sendKeyEvenIfPublic\s*:\s*true/.test(call),
        call,
      });
    }
  }
  return sites;
}

const VERIFIED_PATHS = new Set(KEY_ON_PUBLIC_VERIFIED.map((e) => e.path));
const KEEP_PATHS = new Set(KEEP_ANONYMOUS.map((e) => e.path));

/**
 * A ledger over an empty set proves nothing — the exact shape of the rot
 * dist-guard-coverage.test.ts kills for built-output guards, applied here to a
 * source-scanning rule. If the parser regresses (a new call syntax it cannot
 * name), these must go red rather than green.
 */
function assertScannerIsNotBlind(sites: Site[]): void {
  const seen = new Set(sites.map((s) => s.path));
  const mustSee = ['/api/skills/search', '/api/skills/external', '/api/mcp/healthz', '/api/stats'];
  for (const p of mustSee) {
    if (!seen.has(p)) {
      throw new Error(
        `the call-site scanner found no ${p} fetch anywhere in src/ — it is parsing nothing, ` +
          `so every rule in this block is vacuously green. Fix collectCallSites() before ` +
          `trusting a single verdict here.`,
      );
    }
  }
  if (sites.length < 40) {
    throw new Error(
      `scanner found ${sites.length} fetchApi call sites; this repo has ~60. A drop that large is a ` +
        `parser regression, not a mass deletion of build-time fetches.`,
    );
  }
}

describe('build-time catalog auth ledger', () => {
  const sites = collectCallSites();

  it('the scanner itself sees the calls it claims to police', () => {
    assertScannerIsNotBlind(sites);
  });

  it('the ledger is not self-contradictory and every row carries its proof', () => {
    for (const p of [...VERIFIED_PATHS].filter((p) => KEEP_PATHS.has(p))) {
      throw new Error(`ledger contradiction: ${p} is both KEY_ON_PUBLIC_VERIFIED and KEEP_ANONYMOUS`);
    }
    for (const e of KEY_ON_PUBLIC_VERIFIED) {
      expect(e.handler, `${e.path}: a verified entry must name the handler it was read in`).toBeTruthy();
      expect(e.evidence.length, `${e.path}: a verified entry must state WHY it is content-neutral`).toBeGreaterThan(20);
    }
    for (const e of KEEP_ANONYMOUS) {
      expect(e.reason.length, `${e.path}: a keep-anonymous entry must state the hazard`).toBeGreaterThan(20);
    }
  });

  it('every fetchApi call site is classified — no undeclared auth intent', () => {
    // A call site WITHOUT `authed: false` is a private endpoint: the key is the
    // credential there and no ledger row is owed. An ANONYMOUS call site is a
    // deliberate claim that the endpoint is public, and that claim is what the
    // ledger must vouch for.
    const offenders = sites.filter((s) => {
      if (!s.anon) return false;
      return !VERIFIED_PATHS.has(s.path) && !KEEP_PATHS.has(s.path);
    });
    if (offenders.length) {
      throw new Error(
        'anonymous build-time call sites outside the ledger (declare them — keyless-by-accident is ' +
          'how the drift matrix silently disappeared):\n' +
          offenders.map((o) => `   • ${o.file}:${o.line}  ${o.path}`).join('\n'),
      );
    }
    expect(offenders).toEqual([]);
  });

  it('every VERIFIED public catalog call presents the key when one exists', () => {
    // The regression this catches: someone reverts one of these to a bare
    // `{ authed: false }`, the endpoint goes back to the 60/min anonymous
    // bucket, and the section it feeds starts vanishing from shipped builds.
    const offenders = sites.filter((s) => s.anon && !s.sendsKey && VERIFIED_PATHS.has(s.path));
    if (offenders.length) {
      throw new Error(
        'these public catalog fetches are proven content-neutral but send no key — they are one ' +
          'saturated anonymous bucket away from shipping a degraded page:\n' +
          offenders.map((o) => `   • ${o.file}:${o.line}  ${o.path}`).join('\n') +
          '\n\nAdd { authed: false, sendKeyEvenIfPublic: true } (see src/lib/api.ts FetchOpts).',
      );
    }
    expect(offenders).toEqual([]);
  });

  it('no KEEP_ANONYMOUS (caller-scoped) endpoint ever sends the key', () => {
    // Content-leak guard, deliberately doubled with the rule above: a key here
    // would bake paywalled content into a public static page.
    const offenders = sites.filter((s) => s.sendsKey && KEEP_PATHS.has(s.path));
    if (offenders.length) {
      throw new Error(
        'x-api-key on a caller-scoped public endpoint would bake paid content into a public page:\n' +
          offenders.map((o) => `   • ${o.file}:${o.line}  ${o.path}`).join('\n'),
      );
    }
    expect(offenders).toEqual([]);
  });

  it('no build-time call passes an admin-only or telemetry-triggering param', () => {
    for (const rule of FORBIDDEN_PARAMS) {
      for (const s of sites) {
        if (s.path !== rule.path) continue;
        if (rule.param.test(s.call)) {
          throw new Error(`${s.file}:${s.line} passes a forbidden param on ${rule.path}: ${rule.why}`);
        }
      }
    }
  });

  it('the build key is read from process.env, never import.meta.env (Vite inlines the latter)', () => {
    // Vite substitutes `import.meta.env.FOO` with the LITERAL value at build
    // time. api.ts used to read the secret that way, and a keyed build wrote
    // the live `rec_live_*` string into dist/.prerender/chunks/api_*.mjs
    // (measured 2026-11-16). A runtime assertion cannot catch that — the value
    // is only inlined when the member expression is written literally — so the
    // rule is on the SOURCE TEXT, and it stays red if anyone re-adds it.
    const src = readFileSync(join(ROOT, 'src/lib/api.ts'), 'utf-8');
    for (const name of ['LOOPSKILL_API_KEY', 'RECIPES_API_KEY']) {
      const inlined = new RegExp(`import\\.meta\\.env[?\\s]*\\.?\\.?${name}`);
      expect(inlined.test(src), `src/lib/api.ts reads ${name} via import.meta.env — Vite will inline ` +
        `the secret into the build artifact. Read it from process.env (buildTimeApiKey).`).toBe(false);
    }
    expect(src).toContain('buildTimeApiKey');
  });

  it('the artifact secret gate exists and is wired into assert-dist.sh as a HARD gate', () => {
    // The gate is worth nothing if it can be quietly un-wired: assert it is
    // present, called, and that its failure aborts the build (exit 1) rather
    // than printing a note. This is the only catalog-adjacent rule allowed to
    // block a deploy — a secret in dist is not a degradation.
    const gate = join(ROOT, 'scripts/assert-no-secret-in-dist.sh');
    expect(existsSync(gate), 'scripts/assert-no-secret-in-dist.sh must exist').toBe(true);
    const gateSrc = readFileSync(gate, 'utf-8');
    expect(gateSrc).toContain('rec_');
    expect(gateSrc).toMatch(/exit 1/);
    const assert = readFileSync(join(ROOT, 'scripts/assert-dist.sh'), 'utf-8');
    expect(assert, 'assert-dist.sh must call the secret gate').toContain('assert-no-secret-in-dist.sh');
    expect(assert).toMatch(/assert-no-secret-in-dist\.sh[^\n]*\|\|\s*\{[\s\S]{0,200}exit 1/);
  });

  it('an untrusted host never receives the key, even with sendKeyEvenIfPublic', async () => {
    // The base URL comes from PUBLIC_LOOPSKILL_API_BASE — a PUBLIC_* var, so a
    // one-line PR could point it anywhere. Without the host allowlist, every
    // keyed build-time call would then hand the CI secret to that host. Same
    // stub, same server, unreachable-by-policy hostname: the request must go
    // out WITHOUT the header and fail closed on the 429.
    const url = nextUrl('/api/skills/search?page_size=12').replace('127.0.0.1', '0.0.0.0');
    const res = await fetchApi<any>(url, {
      authed: false,
      sendKeyEvenIfPublic: true,
      apiKey: 'NOT-A...ly',
      ...FAST,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    // The stub logs the request path, so match on the path this case asked for.
    const pathOnly = new URL(url).pathname + new URL(url).search;
    const logged = hits.filter((h) => h.url === pathOnly);
    expect(logged.length, 'the untrusted-host request never reached the stub').toBeGreaterThan(0);
    expect(logged.every((h) => !h.hasKey), 'x-api-key was sent to an untrusted host').toBe(true);
  });

  it('the homepage drift-matrix fetch is one of the key-presenting calls', () => {
    // The specific line the card is titled for, asserted by name rather than
    // through the generic rule. index.astro fetches this URL TWICE (the popular
    // rail and the matrix columns), so match on intent, not on the URL alone:
    // exactly one of them declares itself public — the matrix — and that one
    // must carry the key. The rail's copy stays authenticated; both must end up
    // keyed, and the (auth mode, url) cache key is what makes each get what it
    // asked for instead of whichever fired first.
    const matrixFetches = sites.filter(
      (s) => s.file === 'src/pages/index.astro' && s.call.includes("'/api/skills/search?page_size=12'"),
    );
    expect(matrixFetches.length, 'index.astro no longer fetches /api/skills/search?page_size=12 twice').toBe(2);

    const declaredPublic = matrixFetches.filter((s) => s.anon);
    expect(declaredPublic.length, 'exactly the drift-matrix fetch declares itself public').toBe(1);
    expect(declaredPublic[0].sendsKey).toBe(true);
    // …and it must still be a PUBLIC call: the key buys the bucket, never access.
    expect(declaredPublic[0].call).toContain('authed: false');
  });

  it('the fail-closed contract in index.astro is untouched', () => {
    // The card forbids weakening this: showMatrix stays `=== 5`, and the
    // honest omission sentence stays rendered.
    const src = readFileSync(join(ROOT, 'src/pages/index.astro'), 'utf-8');
    expect(src).toContain('const showMatrix = matrixSkills.length === 5;');
    expect(src).toContain('could not be built against the live catalog');
    expect(src).toContain('catalogDegradations');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — built output: the degraded branch stays non-fatal and stays honest
// ─────────────────────────────────────────────────────────────────────────────

// Collection-safe by design: distDescribe() only picks describe vs describe.skip,
// it never throws at import time. The hard failure lands on the cases.
const describeBuilt = distDescribe('REQUIRE_CATALOG_DIST', DIST_INDEX);

describeBuilt('built output — catalog degradation', () => {
  it('scripts/assert-dist.sh still exits 0 — the note must never block a deploy', () => {
    // Existence check only — distAssert() asserts paths, it does not execute
    // them. The spawn below is what actually gates on the exit code.
    distAssert('assert-dist.sh and the built homepage', ['scripts/assert-dist.sh', DIST_INDEX]);
    // `npm run build` is `astro build && bash scripts/assert-dist.sh`, so if
    // this ever goes non-zero, every deploy dies with it. The whole point of
    // the catalog-health note is that it informs WITHOUT gating: a transient
    // catalog 429 must not hold an unrelated portal deploy hostage.
    let stdout = '';
    let status = 0;
    try {
      stdout = execFileSync('bash', ['scripts/assert-dist.sh', 'dist'], {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      status = e?.status ?? -1;
      stdout = `${e?.stdout ?? ''}\n${e?.stderr ?? ''}`;
    }
    expect(status, `assert-dist.sh must stay green on a degraded-but-honest build:\n${stdout}`).toBe(0);
    expect(stdout).toMatch(/fleet drift matrix|fleet-drift-matrix/i);
  });

  it('the build stamps its catalog health into the artifact', () => {
    distAssert('catalog-health stamp', DIST_INDEX);
    const html = readFileSync(DIST_INDEX, 'utf-8');
    // A DIV, not an HTML comment: Astro's build strips comments containing
    // template expressions (measured 2026-11-16 — the 19 static comments in
    // this page survive, an expression-bearing one does not). Matching the
    // element then reading each attribute keeps this working whatever order
    // the compiler emits the attributes in.
    const stampEl = html.match(/<div id="catalog-health"[^>]*>/);
    expect(
      stampEl,
      'index.astro must stamp key/matrix/degraded into dist/index.html so assert-dist.sh reports ' +
        'what the BUILD saw instead of guessing from a later shell. If this ever regressed to an ' +
        'HTML comment, Astro optimised the stamp away and the degradation signal is dead.',
    ).toBeTruthy();
    const attr = (name: string) =>
      new RegExp(`data-${name}="(\\d+)"`).exec(stampEl![0])?.[1];
    const key = attr('key');
    const matrix = attr('matrix');
    const degraded = attr('degraded');
    expect(key, 'stamp missing data-key').toBeTruthy();
    expect(matrix, 'stamp missing data-matrix').toBeTruthy();
    expect(degraded, 'stamp missing data-degraded').toBeTruthy();
    // The stamp must be self-consistent, not merely present: a page that
    // dropped the flagship section while reporting ZERO degradations is a build
    // that printed "all good" about a section it did not ship.
    if (matrix === '0') {
      expect(
        Number(degraded) > 0,
        `stamp says matrix=0 but degraded=${degraded} — the build omitted the section without ` +
          `recording a single degradation, so the diagnostics block is not tracking the page`,
      ).toBe(true);
    }
    const matrixRendered = html.includes('data-component="fleet-drift-matrix"');
    const omission = html.includes('could not be built against the live catalog');

    // The stamp describes the page, so it may never disagree with it.
    expect(matrix === '1').toBe(matrixRendered);
    if (matrix === '0') {
      // Fail-closed contract: no matrix means the honest sentence, and it means
      // ZERO matrix markup — a stripped grid that still claims 29 cells is the
      // WIS-737 class this whole guard set exists to catch.
      expect(omission, 'matrix omitted without the honesty sentence').toBe(true);
      expect((html.match(/data-dm-cell/g) || []).length).toBe(0);
      expect((html.match(/dm-col-link/g) || []).length).toBe(0);
    }

    if (key === '1' && matrix === '0') {
      // Loud where it is cheap: the build had a key, so the anonymous bucket
      // is NOT the explanation — the catalog was unreachable. Annotation on
      // stderr so it survives every reporter (see tests/lib/dist-guard.ts).
      ciWarn(
        '::warning:: homepage shipped WITHOUT the drift matrix although the build had an API key — ' +
          'the catalog was unreachable or returned nothing usable. On schedule/workflow_dispatch ' +
          'runs tests/landing-onramp.test.ts turns this red (REQUIRE_ONRAMP_MATRIX=1).',
      );
    }
    if (matrix === '0' && REQUIRE_DIST === '1') {
      ciWarn(
        '::warning:: built-output catalog guard ran with REQUIRE_CATALOG_DIST=1 and the matrix is ' +
          'absent — legal on push/PR (designed fail-closed branch), red on the unattended rebuilds.',
      );
    }
  });
});
