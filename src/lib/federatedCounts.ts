/**
 * federatedCounts.ts — live counts for the /browse "Community skills" header.
 *
 * PROBLEM (issue #82, live-confirmed 2026-08-21): the section header said
 * `federated · 7 registries · install as-is` with the "7" HARDCODED at
 * browse.astro. The federation config is the source of truth — a source
 * added/removed/paused made the header silently lie, and the section never
 * showed how many federated skills were actually behind it (demand-side
 * visibility: live `counts.external_installable` is ~21k, invisible).
 *
 * SOURCE OF DATA: the SAME /api/skills/external payload that populates the
 * cards — no extra fetch, no new endpoint, no build-time read (static-site
 * constraint; the count is derived client-side, same island pattern as the
 * cards). The envelope already carries:
 *   - `enabled_sources`: string[] — the upstream registries this request
 *     federated across (live: 7). This is the REGISTRY count. It can exceed
 *     the distinct sources present in the returned rows (a source can be
 *     enabled but currently return zero rows — well-known does today), which
 *     is exactly why the count is read from the envelope and NOT derived
 *     from rows.
 *   - `counts.external_installable`: number — federated skills installable
 *     as-is. Matches the section's "install as-is" promise; deliberately NOT
 *     `external_indexed` (~91k), which counts everything the crawl saw,
 *     including entries you cannot install.
 *
 * FAIL-CLOSED CONTRACT (portal#75 / federation.ts pattern): every field is
 * validated before use and degrades to omission, NEVER to a fabricated
 * literal. If the envelope is missing, the registry count falls back to the
 * distinct `source` values in the actual rows (what the visitor can SEE —
 * honest, if conservative); the skill-count segment is omitted entirely.
 * Numbers are coerced with Number() and checked with Number.isFinite, so a
 * hostile/malformed string in either field ("7<script>", NaN, -3) can never
 * reach the DOM as markup — only finite positive integers render, and they
 * render AS numbers (toLocaleString'd), never as raw strings.
 *
 * NOTE ON DUPLICATION: browse.astro's client <script> uses define:vars,
 * which forces Astro's is:inline mode — ESM imports are UNAVAILABLE there.
 * This module is the CANONICAL implementation (pure, unit-tested in
 * tests/federated-counts.test.ts); the few lines mirrored inside
 * browse.astro's fetchFederated must be kept in sync with it. Same pattern
 * as src/lib/likeControl.ts vs its inline mirror.
 */

export interface FederatedFeedEnvelope {
  /** Row array the cards render from. Each row may carry a `source`. */
  external?: unknown;
  /** Enabled upstream registry slugs for this request, from the envelope. */
  enabled_sources?: unknown;
  counts?: {
    external_installable?: unknown;
  };
}

export interface FederatedRow {
  source?: unknown;
}

export interface FederatedCounts {
  /** Registry count. ≥1 whenever the caller renders any row. */
  sourceCount: number;
  /**
   * Installable federated skill total, or null when the envelope did not
   * carry a finite positive number — the header then omits the segment
   * rather than guess.
   */
  skillCount: number | null;
}

/** Coerce to a finite positive integer, or null. Never trusts a raw string. */
function positiveInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * Derive live header counts from a /api/skills/external payload plus the
 * already-mapped row list. `rows` is passed separately because browse.astro
 * maps raw rows to card items before rendering; the fallback needs only
 * each row's `source`.
 */
export function federatedCountsFromFeed(
  d: FederatedFeedEnvelope | null | undefined,
  rows: FederatedRow[],
): FederatedCounts {
  // Registry count: envelope first, row-derived fallback second.
  let sourceCount: number | null = null;
  if (d && Array.isArray(d.enabled_sources)) {
    sourceCount = positiveInt(d.enabled_sources.length);
  }
  if (sourceCount === null) {
    // Fallback: count distinct sources actually present in the rows. This
    // can UNDERCOUNT registries (zero-row sources vanish) but never
    // fabricates — used only when the envelope lacks the metadata.
    const seen = new Set<string>();
    for (const r of rows || []) {
      const s = r && typeof r.source === 'string' && r.source ? r.source : 'community';
      seen.add(s);
    }
    sourceCount = positiveInt(seen.size) ?? 0;
  }

  // Skill count: envelope only. No row-derived fallback — rows are capped
  // (limit=24/48), so "N skills" from rows would understate the catalog by
  // orders of magnitude. Omit the segment instead.
  let skillCount: number | null = null;
  const raw = d && d.counts ? d.counts.external_installable : undefined;
  if (raw !== undefined && raw !== null) {
    skillCount = positiveInt(raw);
  }

  return { sourceCount, skillCount };
}

/**
 * Render the header suffix, e.g. `federated · 7 registries · 20,994 skills ·
 * install as-is`. Pure string math on validated numbers only — safe for
 * innerHTML interpolation by construction (no caller-controlled substring
 * survives: both counts passed Number.isFinite gates, and the remainder is
 * literal).
 */
export function federatedHeaderSuffix(c: FederatedCounts | null | undefined): string {
  if (!c || !(c.sourceCount > 0)) return 'federated · install as-is';
  const reg = `${c.sourceCount.toLocaleString('en-US')} ${c.sourceCount === 1 ? 'registry' : 'registries'}`;
  const skills = c.skillCount && c.skillCount > 0
    ? ` · ${c.skillCount.toLocaleString('en-US')} ${c.skillCount === 1 ? 'skill' : 'skills'}`
    : '';
  return `federated · ${reg}${skills} · install as-is`;
}
