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
 */

const API_BASE =
  (typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.PUBLIC_RECIPES_API_BASE
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
  /** Pass an auth header. Default reads RECIPES_API_KEY env var. */
  apiKey?: string | null;
  /** When false, omit the x-api-key header entirely (use for public endpoints). */
  authed?: boolean;
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
// silently fall back to seed data. Keyed by full URL — simple and correct.
const _cache: Map<string, Promise<ApiResult<any>>> = new Map();

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
    const hit = _cache.get(url);
    if (hit) return hit as Promise<ApiResult<T>>;
  }

  const promise = _fetchApiUncached<T>(url, opts);
  if (!opts.noCache) _cache.set(url, promise);
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
    apiKey = (typeof import.meta !== 'undefined'
      ? (import.meta as any).env?.RECIPES_API_KEY
      : undefined) ?? null,
    authed = true,
  } = opts;

  let lastError = 'fetch failed';
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (authed && apiKey) headers['x-api-key'] = apiKey;

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
