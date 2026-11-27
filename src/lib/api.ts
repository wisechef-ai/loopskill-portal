/**
 * Build-time helper for fetching the LoopSkill API with retry-and-backoff.
 *
 * Why this exists: during `astro build`, every page that calls the API does
 * so in parallel within a few hundred milliseconds. The API's rate limiter
 * (~ small bucket) returns HTTP 429 to all but the first request. The page
 * then falls back to seed data — silently — and the build ships a broken
 * catalog. This module retries 429 responses with exponential backoff and
 * full-jitter so concurrent build-time fetches actually succeed.
 *
 * Usage from .astro frontmatter:
 *   import { fetchApi } from '../lib/api';
 *   const data = await fetchApi<MySkill[]>('/api/skills/search?page_size=200');
 *   if (data.error) { ...fall back... }
 *
 * DONE (bundle-vocab cutover): /api/bundles/* aliases for the former
 * /api/cookbooks/* routes are live in prod and return identical payloads
 * (verified). The portal's fetch call sites now use /api/bundles/*; the
 * /api/cookbooks/* paths remain accepted legacy aliases, and response
 * readers still fall back to legacy `cookbooks`/`cookbook_id` keys.
 */

const API_BASE =
  (typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.PUBLIC_LOOPSKILL_API_BASE || (import.meta as any).env?.PUBLIC_RECIPES_API_BASE
    : undefined) || 'https://app.loopskill.io';

export interface ApiResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  status: number | null;
}

interface FetchOpts {
  /** Total attempts including the first try. Default 5. */
  maxAttempts?: number;
  /** Initial backoff in ms. Default 400. */
  initialDelayMs?: number;
  /** Max backoff cap in ms. Default 6000. */
  maxDelayMs?: number;
  /** Per-request timeout in ms. Default 12000. */
  timeoutMs?: number;
  /** Pass an auth header. Default reads LOOPSKILL_API_KEY env var, falls back to RECIPES_API_KEY. */
  apiKey?: string | null;
  /** When false, omit the x-api-key header entirely (use for public endpoints). */
  authed?: boolean;
  /**
   * Attach `x-api-key` to a call whose endpoint is PUBLIC, purely so the
   * request escapes loopskill-api's 60/min-per-IP ANONYMOUS bucket.
   *
   * WHY (kanban t_c50df5cd). The homepage's drift matrix and its live counts
   * are fetched at BUILD time from public catalog endpoints
   * (`/api/skills/search`, `/api/mcp/healthz`, `/api/bootcamp`,
   * `/api/connectors`, `/api/skills/external`). They live in
   * `app/middleware/_public_paths.py` PUBLIC_PREFIXES, so no key is REQUIRED —
   * but `app/middleware/rate_limit.py` only skips the per-IP minute bucket
   * when `request.state.auth_ctx.scope` is non-anonymous, and on a public path
   * `app/middleware/api_key.py` stamps that scope opportunistically from
   * `x-api-key` (`_auth_ctx_from_api_key`). Measured from wisechef-agents on
   * 2026-11-16: anonymous `GET /api/skills/search?page_size=12` → 429 (8 of 8,
   * retries included), the identical call with a `rec_live_*` user key → 200.
   *
   * THE KEY BUYS THE BUCKET AND NOTHING ELSE. Verified two ways: the handlers
   * touch `auth_ctx` only for zero-result demand telemetry (skill_routes.py
   * search_skills:296-299, never on a keyless-vs-keyed fork) and never for the
   * response; and the live payloads are byte-identical both ways (10 endpoints
   * diffed anonymously from wisechef-hq against keyed from here —
   * /api/skills/search, /api/skills/external, /api/mcp/healthz,
   * /api/connectors, /api/bootcamp + detail, /api/stats,
   * /api/marketing/snapshot; search body sha256 `bd32659877cfa9c5…` both ways).
   *
   * SEMANTICS — this does NOT make the call authenticated. The endpoint stays
   * public and must keep working with no key at all: loopskill-api degrades an
   * absent/invalid key on a public path to the anonymous scope, never a 401.
   * So a build with no RECIPES_API_KEY exported still fails CLOSED to the same
   * honest omission. That is the whole point — presence of a key changes the
   * ODDS of getting data, never the honesty of what gets rendered.
   *
   * WHEN NOT TO USE IT: any endpoint whose RESPONSE varies with the caller's
   * scope or tier. Baking caller-scoped bytes (a paywall-opened skill body, an
   * admin-only count) into a public static page is a content leak, not a rate
   * fix. `/api/skills/{slug}` is exactly that class: the detail handler opens
   * its readme body for paid callers (skill_routes.py:1136-1146 reads
   * auth_ctx.tier / caller_is_master through _is_paid_tier), so a keyed build
   * would bake paywalled text into a public static page. It stays anonymous.
   * (Checked and NOT in that class: `/api/bundles/public/{slug}` —
   * bundle_routes.py:922 `public_cookbook_page(slug, db)` has no caller
   * argument at all and 404s unless visibility='public'.)
   * tests/p0-build-time-catalog-auth.test.ts enforces which call sites may
   * send a key and keeps every exception on record with a reason.
   */
  sendKeyEvenIfPublic?: boolean;
}

/**
 * The ONE place the build-time API key is resolved. Exported so a page can ask
 * "did this build have a key?" with the same answer fetchApi used, instead of
 * re-deriving it and drifting.
 *
 * READ IT FROM process.env, NEVER import.meta.env. Vite substitutes
 * `import.meta.env.FOO` with the LITERAL value at build time, so reading the
 * secret that way writes it verbatim into the build output — measured
 * 2026-11-16 on wisechef-agents: `dist/.prerender/chunks/api_*.mjs` contained
 * the live `rec_live_*` string. Nothing was exposed (the deployed dist carries
 * no .prerender and the live web root grepped clean the same day, verified over
 * SSH), and the directory sitting in a web root ready to ship on the next
 * rsync tweak is not a control. `scripts/assert-no-secret-in-dist.sh` now fails
 * the build if a key literal appears at all; this function is why it does not.
 *
 * Frontmatter runs in Node, and CI exports both names as step env
 * (.github/workflows/ci.yml:110-111), so nothing is lost. No key in the
 * environment is a supported state: every caller fails closed.
 */
export function buildTimeApiKey(): string | null {
  // Reached via globalThis, not the bare `process` identifier: this repo
  // deliberately has no @types/node, and `process` would be an astro-check
  // error (TS2591) rather than a working runtime read.
  const proc = (globalThis as any)?.process?.env as Record<string, string | undefined> | undefined;
  return proc?.LOOPSKILL_API_KEY || proc?.RECIPES_API_KEY || null;
}

/**
 * Hosts the build key may be sent to. The base URL comes from
 * `PUBLIC_LOOPSKILL_API_BASE` — a PUBLIC_* variable, i.e. one any PR may set —
 * so without this guard a one-line change of that value would turn every
 * keyed build-time call into an exfiltration of the CI secret to whatever host
 * the diff named. Unknown host, or a URL that will not parse, means NO key: the
 * build degrades to the honest fail-closed branch it already supports.
 * 127.0.0.1/localhost is here for the stub-catalog negative controls in
 * tests/p0-build-time-catalog-auth.test.ts and for local builds.
 */
const KEY_TRUSTED_HOSTS: ReadonlySet<string> = new Set([
  'app.loopskill.io',
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

function keySafeForTarget(rawUrl: string): boolean {
  try {
    return KEY_TRUSTED_HOSTS.has(new URL(rawUrl, API_BASE).hostname);
  } catch {
    return false;
  }
}

/**
 * Would a build-time call to the CATALOG (a relative URL resolved against
 * API_BASE) actually carry the key? Pages use THIS, not `buildTimeApiKey() !==
 * null`, for their catalog-health stamp: a stamp that reports key=1 while the
 * host guard was silently withholding the key would be exactly the
 * self-contradicting evidence this file exists to prevent.
 */
export function buildTimeKeyForCatalog(): boolean {
  return buildTimeApiKey() !== null && keySafeForTarget('/api/skills/search');
}

/**
 * Will this call actually carry `x-api-key`? Single source of truth for both
 * the request header AND the dedupe cache key — they must agree, or the cache
 * hands one caller's response to a caller that made a different request.
 */
function willSendApiKey(url: string, opts: FetchOpts): boolean {
  const apiKey = opts.apiKey === undefined ? buildTimeApiKey() : opts.apiKey;
  const authed = opts.authed ?? true;
  return Boolean(apiKey) && (authed || opts.sendKeyEvenIfPublic === true) && keySafeForTarget(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function jitter(base: number, capMs: number): number {
  // Full jitter: random value in [0, min(base, cap)]
  return Math.floor(Math.random() * Math.min(base, capMs));
}

// In-process build-time cache: when Astro builds N static pages in parallel,
// they all fire the same API requests at once. Without this cache the rate
// limiter returns 429 to all but the first, retry storms ensue, and pages
// silently fall back to seed data.
//
// KEYED BY (auth mode, url), not url alone. With a url-only key, two call
// sites asking for the SAME url under DIFFERENT auth intents collapse into
// whichever promise arrived first, and the loser's option is silently
// decorative. That is not hypothetical: index.astro fetched
// `/api/skills/search?page_size=12` twice — once authenticated (the popular
// rail), once with `{ authed: false }` (the drift matrix) — and the matrix's
// `authed: false` was never honoured, because the rail's authenticated promise
// was already in the map. The fix this enables cuts both ways: an anonymous
// cache entry could just as well have been served to a caller that needed the
// key to escape the bucket, and — far worse — a keyed response could be baked
// into a page whose fetch declared itself public. If the header decision and
// the cache key cannot disagree, neither failure mode can happen.
const _cache: Map<string, Promise<ApiResult<any>>> = new Map();

function cacheKey(url: string, opts: FetchOpts): string {
  return `${willSendApiKey(url, opts) ? 'keyed' : 'anon'}\u0000${url}`;
}

/**
 * Fetch a JSON endpoint with retry on 429/5xx and exponential backoff.
 * Returns a discriminated result so callers don't need to try/catch.
 *
 * Build-time concurrent calls for the same URL are deduplicated via an
 * in-process cache; pass `noCache: true` to bypass.
 */
export async function fetchApi<T = any>(
  path: string,
  opts: FetchOpts & { noCache?: boolean } = {},
): Promise<ApiResult<T>> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // Cache lookup before any side-effect work
  if (!opts.noCache) {
    const hit = _cache.get(cacheKey(url, opts));
    if (hit) return hit as Promise<ApiResult<T>>;
  }

  const promise = _fetchApiUncached<T>(url, opts);
  if (!opts.noCache) _cache.set(cacheKey(url, opts), promise);
  return promise;
}

async function _fetchApiUncached<T>(
  url: string,
  opts: FetchOpts,
): Promise<ApiResult<T>> {
  const {
    maxAttempts = 5,
    initialDelayMs = 400,
    maxDelayMs = 6000,
    timeoutMs = 12000,
    apiKey = buildTimeApiKey(),
  } = opts;

  let lastError = 'fetch failed';
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      // `authed` = the endpoint is private, the key is the credential.
      // `sendKeyEvenIfPublic` = the endpoint is public, the key is only there
      // to dodge the anonymous rate bucket (see FetchOpts). Both put the same
      // header on the wire; neither may change WHAT is rendered on a miss.
      // The SAME predicate decides the cache key, so a cached response can
      // never be served to a caller that made a different request — and
      // keySafeForTarget inside it is what stops a PUBLIC_* base-url redirect
      // from shipping the CI secret to an attacker-chosen host.
      if (willSendApiKey(url, opts)) headers['x-api-key'] = apiKey as string;

      const res = await fetch(url, { headers, signal: ctrl.signal });
      lastStatus = res.status;

      if (res.ok) {
        const data = (await res.json()) as T;
        return { ok: true, data, error: null, status: res.status };
      }

      // Retry transient errors only
      if (res.status === 429 || res.status >= 500) {
        lastError = `API ${res.status}`;
        if (attempt < maxAttempts) {
          const wait = jitter(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
          await sleep(wait);
          continue;
        }
      } else {
        // 4xx other than 429 → don't retry, that's our bug
        return {
          ok: false,
          data: null,
          error: `API ${res.status}`,
          status: res.status,
        };
      }
    } catch (e: any) {
      lastError = e?.message || 'network error';
      if (attempt < maxAttempts) {
        const wait = jitter(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
        await sleep(wait);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, data: null, error: lastError, status: lastStatus };
}
