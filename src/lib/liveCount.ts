/**
 * liveCount.ts — pure logic shared between LiveCount.astro's static render
 * (frontmatter, build time) and its client swap script (browser, runtime).
 *
 * PROBLEM (owner ask, 2026-09-01): marketing counts (index.astro's
 * liveSkillCount/federatedSkillLabel, federation/index.astro's overview.total)
 * were baked in at BUILD time. They go stale between rebuilds and need a full
 * `astro build` + deploy to correct — even though the live API
 * (/api/marketing/snapshot, /api/skills/external) already has the current
 * number, publicly, with no auth.
 *
 * FIX: LiveCount.astro renders the build-time-baked value as an HONEST
 * static fallback (never blank, never a spinner), then a client script
 * fetches the live snapshot endpoint post-hydration and swaps the text in.
 * On any failure (network error, non-2xx, missing key, NaN, zero, negative)
 * the static fallback is left untouched — never "undefined", never "NaN",
 * never a hardcoded zero.
 *
 * This module is imported by LiveCount.astro's frontmatter (formatCount, for
 * the static render) AND by its `<script>` (a real ES module import — Astro
 * bundles non-`is:inline` scripts through Vite, so this is one source of
 * truth, not a duplicated inline copy). Both are exercised directly by
 * tests/live-count-island.test.ts.
 */

/** Safe dot-path lookup into a parsed JSON response. Never throws. */
export function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

export type CountFormat = 'plain' | 'comma' | 'floor1k-plus';

/** Render a validated positive finite integer per the requested format.
 *  Callers must validate with extractLiveValue()/isFinite first — this
 *  function does not itself guard against NaN etc. beyond the isFinite
 *  check, so it can also format the (already-honest) build-time fallback. */
export function formatCount(n: number, format: CountFormat = 'plain'): string {
  if (!Number.isFinite(n)) return '';
  switch (format) {
    case 'comma':
      return n.toLocaleString('en-US');
    case 'floor1k-plus':
      return `${(Math.floor(n / 1000) * 1000).toLocaleString('en-US')}+`;
    default:
      return String(n);
  }
}

/**
 * Extract a trustworthy live count from a fetched JSON payload. Returns null
 * (never a fabricated number) unless the value at `path` is a finite,
 * positive number — the same fail-closed contract as federatedCounts.ts's
 * positiveInt(). A malformed/hostile payload (string, NaN, negative, 0,
 * array) always yields null, which the caller must treat as "leave the
 * static fallback in place".
 */
export function extractLiveValue(data: unknown, path: string): number | null {
  const v = getByPath(data, path);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
