/**
 * federation.ts — build-time data layer for the /federation/* GEO surfaces
 * (G2-federation).
 *
 * PROBLEM (GEO audit, 2026-08-19, live-confirmed): the federation crawl
 * indexes ~91k external skills across 14 configured upstream registries
 * (config/federation_sources.yaml in loopskill-api) — the single biggest
 * catalog claim on the site — and it is 100% API-only. Zero crawlable URLs.
 * Google/LLM crawlers cannot see it and the "91k+" claim is uncitable.
 *
 * SCOPE / D-035 (proxy-never-rehost): these pages surface METADATA ONLY —
 * name, description, upstream source, trust level, tags, and a link to the
 * entry's ORIGIN. Never rehost external skill content or files.
 *
 * SOURCE OF DATA: GET /api/federation/filter (loopskill-api,
 * app/federation_filter_routes.py) — public, anonymous-safe, already used by
 * the bulk-add UI. `?source=<slug>` filters to one upstream registry;
 * `&limit=1` is the cheap way to read `total` without paying for rows.
 * GET /api/federation/filter/facets returns the live list of upstream_source
 * values — the single source of truth for which source buckets exist today,
 * so this file never hardcodes a source list that can silently drift from
 * the API (the same class of bug AGENTS.md documents for the 14-source count
 * vs the 7 upstream_source buckets — see SOURCE_META below).
 *
 * FAIL-CLOSED CONTRACT (portal#75 pattern — bootcamp-fallback-rot-guard):
 * every fetch here is wrapped. On any failure (network, timeout, non-2xx,
 * malformed body) the function returns an empty/null result — NEVER a
 * fabricated count, NEVER a fabricated entry, NEVER a link built from data
 * that didn't actually come back. `getFederationSourceEntries()` is the
 * single choke point both /federation/index.astro and /federation/[source]
 * .astro build from, so a source can only ever get an index-page table row
 * AND a /federation/{source}/ page together — never a link to a page the
 * build didn't emit (audit-links would refuse it anyway, but the invariant
 * is enforced here, at the source, not discovered at the gate).
 */

import { fetchApi } from './api';

export interface FederationEntry {
  slug: string;
  title: string;
  upstream_source: string;
  trust_level: string | null;
  license: string | null;
  tags: string[];
  origin_url: string | null;
}

export interface FederationSourcePage {
  /** upstream_source slug, e.g. "clawhub", "skills-sh". */
  slug: string;
  meta: SourceMeta;
  /** Real total row count for this source, from the live API. Never fabricated. */
  total: number;
  /** A capped, representative sample of entries with resolvable origin links. */
  sample: FederationEntry[];
}

export interface FederationOverview {
  /** true only if the facets call succeeded — gates whether ANY /federation
   *  page content renders beyond the fail-closed explanatory copy. */
  ok: boolean;
  /** Grand total across the whole federated index, from the unfiltered
   *  /api/federation/filter call. Null when unreachable — NEVER a fallback
   *  literal (never hardcode "91k"; the number must always come from a live
   *  build-time read, or not appear at all). */
  total: number | null;
  /** trust_level facet values from the live API, for badge labels. */
  trustLevels: string[];
  /** One entry per upstream source that BOTH returned a total AND returned
   *  at least one sample row with a usable origin link — i.e. exactly the
   *  set of sources that will get a /federation/{source}/ page. */
  sources: FederationSourcePage[];
}

/**
 * Static display metadata for known upstream sources. This is NOT the count
 * or the existence check (both come from the live API) — it is purely
 * display copy (name/description) for source slugs the API is already
 * telling us are live via /api/federation/filter/facets. A slug the facets
 * call returns that ISN'T in this map still gets a page — falls back to a
 * generic description built from the slug — so a new source added to
 * loopskill-api's config/federation_sources.yaml (self-serve per that
 * file's own docs) is never silently dropped from crawlability here.
 */
const SOURCE_META: Record<string, { name: string; description: string }> = {
  clawhub: {
    name: 'ClawHub',
    description: 'A large community registry of agent skills — the biggest single upstream source in the federated index.',
  },
  'skills-sh': {
    name: 'skills.sh',
    description: 'A community skill-discovery search engine indexing agent skills published across GitHub and beyond.',
  },
  github: {
    name: 'GitHub taps',
    description: 'Individually configured GitHub repositories (Anthropic, OpenAI, Hugging Face, NVIDIA, and community collections) tapped skill-by-skill or repo-by-repo.',
  },
  lobehub: {
    name: 'LobeHub',
    description: 'Agent and prompt entries indexed from the LobeHub community marketplace.',
  },
  'browse-sh': {
    name: 'browse.sh',
    description: 'Browser-automation and site-specific agent skills indexed from the browse.sh registry.',
  },
  official: {
    name: 'Official',
    description: 'Skills published directly by agent-platform vendors and maintainers as their own first-party listings.',
  },
  'claude-marketplace': {
    name: 'Claude Marketplace',
    description: "Skills published through Anthropic's Claude plugin/skill marketplace convention.",
  },
  'well-known': {
    name: 'Well-known discovery',
    description: 'Skills discovered via the `.well-known` agent-skill discovery convention.',
  },
};

type SourceMeta = { name: string; description: string };

function metaFor(slug: string): SourceMeta {
  return (
    SOURCE_META[slug] || {
      name: slug,
      description: `Agent skills indexed from the ${slug} upstream registry.`,
    }
  );
}

const SAMPLE_CAP = 80;

/** Fetch one upstream source's total row count. Null on any failure. */
async function fetchSourceTotal(source: string): Promise<number | null> {
  const res = await fetchApi<{ total?: number }>(
    `/api/federation/filter?source=${encodeURIComponent(source)}&limit=1`,
    { authed: false, maxAttempts: 6, initialDelayMs: 500, maxDelayMs: 8000 },
  );
  if (!res.ok || !res.data || typeof res.data.total !== 'number') return null;
  return res.data.total;
}

/**
 * Fetch a capped sample of entries for one source. An entry only survives
 * into the returned list if it carries a non-empty `origin_url` — D-035
 * requires linking to the origin, and audit-links refuses a dead/empty href,
 * so an entry with no usable link is metadata without a citation and is
 * dropped rather than rendered with a broken or fabricated link.
 */
async function fetchSourceSample(source: string): Promise<FederationEntry[]> {
  const res = await fetchApi<{ results?: FederationEntry[] }>(
    `/api/federation/filter?source=${encodeURIComponent(source)}&limit=${SAMPLE_CAP}`,
    { authed: false, maxAttempts: 6, initialDelayMs: 500, maxDelayMs: 8000 },
  );
  if (!res.ok || !res.data || !Array.isArray(res.data.results)) return [];
  return res.data.results.filter(
    (e) => typeof e?.origin_url === 'string' && /^https?:\/\//.test(e.origin_url),
  );
}

/** Fetch the grand total across the whole federated index (no source filter). */
async function fetchGrandTotal(): Promise<number | null> {
  const res = await fetchApi<{ total?: number }>('/api/federation/filter?limit=1', {
    authed: false,
    maxAttempts: 6,
    initialDelayMs: 500,
    maxDelayMs: 8000,
  });
  if (!res.ok || !res.data || typeof res.data.total !== 'number') return null;
  return res.data.total;
}

let _cachedOverview: Promise<FederationOverview> | null = null;

/**
 * Build the whole federation overview: which sources exist, their real
 * totals, a live-verified sample per source, and the grand total. Fails
 * closed at every layer — a partial API outage degrades gracefully (some
 * sources missing) rather than emitting fabricated data anywhere.
 *
 * Module-level-cached (in addition to fetchApi's own URL cache) because
 * both /federation/index.astro and /federation/[source].astro call this
 * during the same `astro build` process and must see the identical set of
 * sources — the whole "never link to a page that wasn't built" invariant
 * depends on both call sites resolving to the same list.
 */
export function getFederationOverview(): Promise<FederationOverview> {
  if (_cachedOverview) return _cachedOverview;
  _cachedOverview = (async () => {
    // Rationale: a facets-endpoint failure means we cannot even enumerate
    // which sources exist — fail the whole surface closed (ok=false, no
    // sources, no total) rather than guess.
    let sourceSlugs: string[] = [];
    let trustLevels: string[] = [];
    try {
      const facets = await fetchApi<{ sources?: string[]; trust_levels?: string[] }>(
        '/api/federation/filter/facets',
        { authed: false, maxAttempts: 6, initialDelayMs: 500, maxDelayMs: 8000 },
      );
      if (facets.ok && facets.data && Array.isArray(facets.data.sources)) {
        sourceSlugs = facets.data.sources;
        trustLevels = Array.isArray(facets.data.trust_levels) ? facets.data.trust_levels : [];
      }
      // Rationale: this whole file must degrade, never throw and abort the
      // build — a build-time fetch failure here must not couple the WHOLE
      // portal build to federation-API uptime (WIS-737 incident class).
    } catch {
      // Rationale: see above — fail closed to sourceSlugs=[] and continue;
      // grand total below still gets its own independent attempt.
    }

    if (sourceSlugs.length === 0) {
      return { ok: false, total: null, trustLevels: [], sources: [] };
    }

    const grandTotalPromise = fetchGrandTotal();
    const perSource = await Promise.all(
      sourceSlugs.map(async (slug) => {
        const [total, sample] = await Promise.all([fetchSourceTotal(slug), fetchSourceSample(slug)]);
        return { slug, total, sample };
      }),
    );
    const grandTotal = await grandTotalPromise;

    // A source only becomes a built page (and an index table row) when it
    // has BOTH a real total AND at least one sample entry with a real,
    // resolvable origin link. This is the choke point that keeps the index
    // page's table and the set of emitted /federation/{source}/ pages in
    // lockstep — no dead links, ever, by construction.
    const sources: FederationSourcePage[] = perSource
      .filter((s): s is { slug: string; total: number; sample: FederationEntry[] } => s.total !== null && s.sample.length > 0)
      .map((s) => ({ slug: s.slug, meta: metaFor(s.slug), total: s.total, sample: s.sample }))
      .sort((a, b) => b.total - a.total);

    return { ok: true, total: grandTotal, trustLevels, sources };
  })();
  return _cachedOverview;
}

/** Convenience: the flat list of source pages that will actually be built. */
export async function getFederationSourcePages(): Promise<FederationSourcePage[]> {
  const overview = await getFederationOverview();
  return overview.sources;
}
