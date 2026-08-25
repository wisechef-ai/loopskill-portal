/**
 * federation.ts — build-time data layer for the /federation/* GEO surfaces
 * (G2-federation, reworked issue#277).
 *
 * PROBLEM (issue #277, live-confirmed 2026-08-25): this file's SOURCE_META
 * hardcoded exactly 8 source slugs (clawhub, skills-sh, github, lobehub,
 * browse-sh, official, claude-marketplace, well-known) and derived the whole
 * source list from GET /api/federation/filter/facets, which STILL only
 * enumerates that same stale 7-bucket taxonomy today
 * (`["browse-sh","claude-marketplace","clawhub","github","lobehub","official",
 * "skills-sh"]` — verified live 2026-08-25). Meanwhile loopskill-api's
 * config/federation_sources.yaml has grown to 28 much more granular per-repo
 * taps (github-anthropic, github-openai, github-huggingface, github-nvidia,
 * github-gstack, github-superpowers, github-marketing, thirteen more
 * community github-* taps, hermes-hub, well-known, ...) that GET
 * /api/skills/external already reports via `available_sources` +
 * `per_source`. 21 of the 28 live sources — including every named GitHub
 * tap — never got a /federation/{source}/ page or an index-table row at all.
 *
 * FIX: the source list (which slugs exist) AND their live per-source counts
 * come from ONE build-time call to GET /api/skills/external — the SAME
 * endpoint the /skills/external browse toggle and issue#82's
 * federatedCounts.ts already trust as the live registry list. This file no
 * longer calls /api/federation/filter or /api/federation/filter/facets at
 * all — that endpoint's source taxonomy has drifted from the one actually
 * being walked and is not a source of truth for "which sources exist".
 *
 * SCOPE / D-035 (proxy-never-rehost): these pages surface METADATA ONLY —
 * name, description, upstream source, license, and a link to the entry's
 * ORIGIN. Never rehost external skill content or files.
 *
 * FAIL-CLOSED CONTRACT (portal#75 pattern — bootcamp-fallback-rot-guard,
 * extended for issue#277's CRITICAL rule):
 *   - every fetch here is wrapped; a network/timeout/non-2xx/malformed-body
 *     failure degrades, never throws and aborts the build.
 *   - a source only gets a page when it has a real, live, non-fabricated
 *     `total` AND at least one real sample entry with a resolvable
 *     http(s) origin_url.
 *   - CRITICAL (issue#277): if the build-time /api/skills/external call
 *     itself fails outright (no data back at all), the SOURCE LIST — which
 *     slugs to even try — falls back to FALLBACK_SOURCE_SLUGS, a full
 *     28-slug snapshot of the live source list captured 2026-08-25. This is
 *     NOT the old stale 8-source hardcode; it exists purely so a transient
 *     failure of the summary call doesn't shrink the set of sources a
 *     still-working sample call can populate. It is a list of NAMES only —
 *     never a fabricated count, never a fabricated entry.
 *   - `getFederationSourceEntries()`-equivalent below is the single choke
 *     point both /federation/index.astro and /federation/[source].astro
 *     build from, so a source can only ever get an index-page table row AND
 *     a /federation/{source}/ page together — never a link to a page the
 *     build didn't emit.
 */

import { fetchApi } from './api';

export interface FederationEntry {
  slug: string;
  title: string;
  upstream_source: string;
  /** GET /api/skills/external does not carry a trust_level field (that was
   *  specific to the old /api/federation/filter shape). Always null here —
   *  never fabricated — the template already renders it conditionally. */
  trust_level: string | null;
  license: string | null;
  /** Not carried by /api/skills/external either. Always []. */
  tags: string[];
  origin_url: string | null;
}

/** One real upstream repository inside a source bucket, derived from live
 *  origin_url values. Never a hardcoded list — see deriveRepos(). */
export interface FederationRepo {
  /** "owner/repo" exactly as it appears in the entries' origin_url. */
  repo: string;
  /** How many sampled entries resolved to this repo. Never fabricated. */
  count: number;
}

export interface FederationSourcePage {
  /** upstream_source slug, e.g. "clawhub", "github-anthropic". */
  slug: string;
  meta: SourceMeta;
  /** Real count for this source. Live per_source[slug].indexed when the
   *  summary call succeeded; otherwise the honest count of real sampled
   *  entries with a resolvable origin (a true lower bound) — never a
   *  fabricated or guessed number. */
  total: number;
  /** A capped, representative sample of entries with resolvable origin links. */
  sample: FederationEntry[];
  /** The distinct upstream repos present in `sample`, largest first. Empty
   *  for sources whose origins aren't repo-shaped (non-github registries). */
  repos: FederationRepo[];
}

export interface FederationOverview {
  /** true only if the build-time GET /api/skills/external summary call
   *  itself succeeded — gates whether the index page's live-count copy
   *  renders (vs the honest "temporarily unavailable" explanatory text). */
  ok: boolean;
  /** Grand total across the whole federated index, from that same live
   *  call's `counts.external_indexed`. Null when unreachable — NEVER a
   *  fallback literal (never hardcode a number; it must come from a live
   *  build-time read, or not appear at all). */
  total: number | null;
  /** Kept for interface stability; the current live API carries no
   *  trust-level facet list distinct from per-entry trust_level (which is
   *  itself no longer available — see FederationEntry). Always []. */
  trustLevels: string[];
  /** One entry per upstream source that BOTH returned a real total AND
   *  returned at least one sample row with a usable origin link — i.e.
   *  exactly the set of sources that will get a /federation/{source}/ page. */
  sources: FederationSourcePage[];
}

/**
 * Full snapshot of every upstream_source slug GET /api/skills/external
 * reported live, captured 2026-08-25 (`available_sources`, 28 entries).
 * CRITICAL fail-closed fallback (issue#277): used ONLY when the build-time
 * summary fetch fails outright — never displayed as a live count, never
 * used to fabricate a total. This lets a still-working sample call populate
 * pages for the full real source set even when the summary call is down,
 * rather than silently reverting to a stale 8-source (or empty) list.
 */
export const FALLBACK_SOURCE_SLUGS: string[] = [
  'hermes-hub',
  'skills-sh',
  'well-known',
  'clawhub',
  'lobehub',
  'browse-sh',
  'github-oss',
  'github-anthropic',
  'github-openai',
  'github-huggingface',
  'github-nvidia',
  'github-gstack',
  'github-superpowers',
  'github-marketing',
  'github-agentskillexchange',
  'github-journal-skills',
  'github-alirezarezvani-skills',
  'github-hoangnguyen-skills-standard',
  'github-wshobson-agents',
  'github-kdense-scientific-skills',
  'github-jimliu-baoyu-skills',
  'github-thedotmack-claude-mem',
  'github-skill-seekers',
  'github-litestar-skills',
  'github-runcomfy-skills',
  'github-atc-agentic-toolkit',
  'github-orchestra-research-skills',
  'github-awesome-agent-skills',
];

/**
 * Static display metadata for known upstream sources — hand-written, nicer
 * copy for the sources we can say something specific about. This is NOT the
 * count or the existence check (both come from the live API) — purely
 * display copy. Ported from src/pages/skills/external.astro's SOURCE_META
 * (the toggle-UI page authored these first) plus github-marketing, which
 * this file's own live probe (2026-08-25) identified as
 * coreyhaines31/marketingskills, MIT, 50 skills.
 */
const SOURCE_META: Record<string, { name: string; description: string }> = {
  'hermes-hub': {
    name: 'Hermes Hub',
    description: 'Nous Research bundled skills (MIT) — the largest single upstream source in the federated index.',
  },
  'skills-sh': {
    name: 'skills.sh',
    description: 'A community skill-discovery search engine indexing agent skills published across GitHub and beyond.',
  },
  'well-known': {
    name: 'Well-known discovery',
    description: 'Any site exposing /.well-known/skills/index.json — real SKILL.md files discovered via the open convention.',
  },
  clawhub: {
    name: 'ClawHub',
    description: 'A large community registry of agent skills (clawhub.ai). Deep-link only — supply-chain unvetted, as-is.',
  },
  lobehub: {
    name: 'LobeHub',
    description: 'Agent and prompt entries indexed from the LobeHub community marketplace.',
  },
  'browse-sh': {
    name: 'browse.sh',
    description: 'Browser-automation and site-specific agent skills indexed from the browse.sh (Browserbase) registry.',
  },
  'github-oss': {
    name: 'GitHub OSS',
    description: 'Open-source SKILL.md repos tapped individually. Redistributable licenses install from origin; others deep-link.',
  },
  'github-anthropic': {
    name: 'GitHub · Anthropic',
    description: "Official Anthropic-maintained agent skills. Apache-2.0 entries install from origin; source-available ones deep-link.",
  },
  'github-openai': {
    name: 'GitHub · OpenAI',
    description: 'Curated OpenAI agent skills. The redistributable subset installs from origin.',
  },
  'github-huggingface': {
    name: 'GitHub · Hugging Face',
    description: 'Hugging Face Hub skills (Apache-2.0) — install straight from origin.',
  },
  'github-nvidia': {
    name: 'GitHub · NVIDIA',
    description: 'NVIDIA agent skills (Apache-2.0 / CC-BY-4.0) — install from origin.',
  },
  'github-gstack': {
    name: 'GitHub · gstack',
    description: 'gstack community skills (MIT) — install straight from origin.',
  },
  'github-superpowers': {
    name: 'GitHub · Superpowers',
    description: 'obra/superpowers skill pack (MIT) — install straight from origin.',
  },
  'github-marketing': {
    name: 'GitHub · Marketing',
    description: "coreyhaines31/marketingskills (MIT) — a marketing-focused skill pack tapped repo-by-repo.",
  },
};

type SourceMeta = { name: string; description: string };

/** Turn "github-awesome-agent-skills" into "GitHub · Awesome Agent Skills",
 *  "hoangnguyen-skills-standard" into "Hoangnguyen Skills Standard". Used
 *  ONLY for slugs the live API reports that aren't in the hand-authored
 *  SOURCE_META above (issue#277: "auto-generate a sane label from the slug
 *  for unknown ones") — so a new source self-served into
 *  config/federation_sources.yaml is never silently dropped from
 *  crawlability here just because nobody wrote it a blurb yet. */
function autoLabel(slug: string): string {
  const isGithubTap = slug.startsWith('github-');
  const rest = isGithubTap ? slug.slice('github-'.length) : slug;
  const words = rest
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const label = words.join(' ') || slug;
  return isGithubTap ? `GitHub · ${label}` : label;
}

function metaFor(slug: string): SourceMeta {
  const known = SOURCE_META[slug];
  if (known) return known;
  const name = autoLabel(slug);
  return {
    name,
    description: `Agent skills indexed from the ${slug} upstream registry.`,
  };
}

/** Sample cap per source. GET /api/skills/external returns at most ~20 rows
 *  per source per call regardless of the `limit` query param (measured live
 *  2026-08-25: limit=5/20/100 on a single source all returned the same 20
 *  rows; a combined 28-source request returned exactly min(20, real count)
 *  per source). There is no offset/pagination support on this endpoint, so
 *  unlike the old /api/federation/filter-backed implementation this is not
 *  a "how many do we ask for" knob — it is what the API hands back. */
const SAMPLE_CAP = 20;

/** Raw row shape from GET /api/skills/external's `external[]` array. */
interface RawExternalRow {
  slug?: unknown;
  title?: unknown;
  source?: unknown;
  license?: unknown;
  origin_url?: unknown;
}

/** Extract "owner/repo" from a GitHub-shaped origin URL. Null for anything
 *  else — non-github registries legitimately have no repo identity, and a
 *  guess would be a fabricated attribution (D-035). */
export function repoFromOriginUrl(originUrl: string | null | undefined): string | null {
  if (typeof originUrl !== 'string') return null;
  const m = originUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  return `${m[1]}/${m[2].replace(/\.git$/, '')}`;
}

/** Group entries by their real upstream repo, largest first. Purely derived
 *  from live data — never a hardcoded repo list. */
export function deriveRepos(entries: FederationEntry[]): FederationRepo[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const repo = repoFromOriginUrl(e.origin_url);
    if (repo) counts.set(repo, (counts.get(repo) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([repo, count]) => ({ repo, count }))
    .sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo));
}

/**
 * Pick up to `cap` entries so that every distinct upstream repo present in
 * `entries` is represented before any single repo takes a second slot.
 * Deterministic (stable input order, repos ordered largest-first), so the
 * built page is reproducible across builds. Entries with no repo identity
 * (non-github origins) share one bucket and are never dropped wholesale.
 */
export function roundRobinSample(entries: FederationEntry[], cap: number): FederationEntry[] {
  if (entries.length <= cap) return entries;
  const buckets = new Map<string, FederationEntry[]>();
  for (const e of entries) {
    const key = repoFromOriginUrl(e.origin_url) || '\u0000other';
    const b = buckets.get(key);
    if (b) b.push(e);
    else buckets.set(key, [e]);
  }
  // Largest bucket first so the biggest upstream leads, but every bucket
  // gets its first slot in round 0 — that is the invisibility fix.
  const ordered = [...buckets.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const out: FederationEntry[] = [];
  for (let round = 0; out.length < cap; round++) {
    let placedThisRound = false;
    for (const [, bucket] of ordered) {
      if (round >= bucket.length) continue;
      out.push(bucket[round]);
      placedThisRound = true;
      if (out.length >= cap) break;
    }
    if (!placedThisRound) break;
  }
  return out;
}

function toEntry(row: RawExternalRow): FederationEntry {
  const source = typeof row.source === 'string' ? row.source : '';
  const slug = typeof row.slug === 'string' ? row.slug : '';
  const title = typeof row.title === 'string' && row.title ? row.title : slug;
  const license = typeof row.license === 'string' ? row.license : null;
  const originUrl = typeof row.origin_url === 'string' ? row.origin_url : null;
  return {
    slug,
    title,
    upstream_source: source,
    trust_level: null,
    license,
    tags: [],
    origin_url: originUrl,
  };
}

/** Fetch the live source list + per-source indexed counts + grand total, all
 *  from ONE call to GET /api/skills/external (no `sources` param — this
 *  shape always returns `available_sources`/`per_source`/`counts` regardless
 *  of which, if any, sources are "enabled"). Null on any failure. */
async function fetchSourceSummary(): Promise<{
  slugs: string[];
  perSourceIndexed: Record<string, number | null>;
  grandTotal: number | null;
} | null> {
  const res = await fetchApi<{
    available_sources?: unknown;
    per_source?: Record<string, { indexed?: unknown } | undefined>;
    counts?: { external_indexed?: unknown };
  }>('/api/skills/external', { authed: false, maxAttempts: 6, initialDelayMs: 500, maxDelayMs: 8000 });

  if (!res.ok || !res.data || !Array.isArray(res.data.available_sources) || res.data.available_sources.length === 0) {
    return null;
  }
  const slugs = res.data.available_sources.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (slugs.length === 0) return null;

  const perSource = res.data.per_source || {};
  const perSourceIndexed: Record<string, number | null> = {};
  for (const slug of slugs) {
    const v = perSource[slug]?.indexed;
    perSourceIndexed[slug] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  const gt = res.data.counts?.external_indexed;
  const grandTotal = typeof gt === 'number' && Number.isFinite(gt) ? gt : null;

  return { slugs, perSourceIndexed, grandTotal };
}

/**
 * Fetch a sample of entries for EVERY source in `slugs` in a single call —
 * GET /api/skills/external?sources=<comma-joined>&limit=… returns up to
 * SAMPLE_CAP rows per source in one round trip (measured live 2026-08-25:
 * a 28-source combined request returned min(20, real count) rows per
 * source). Returns a map of slug -> raw rows; a slug absent from the map
 * (or with an empty array) means the API returned nothing usable for it —
 * that source is dropped by the caller's fail-closed gate, never guessed.
 */
async function fetchAllSamples(slugs: string[]): Promise<Record<string, RawExternalRow[]>> {
  if (slugs.length === 0) return {};
  const res = await fetchApi<{ external?: unknown }>(
    `/api/skills/external?sources=${slugs.join(',')}&limit=100`,
    { authed: false, maxAttempts: 6, initialDelayMs: 500, maxDelayMs: 8000 },
  );
  if (!res.ok || !res.data || !Array.isArray(res.data.external)) return {};

  const bySource: Record<string, RawExternalRow[]> = {};
  for (const row of res.data.external as RawExternalRow[]) {
    const s = row && typeof row.source === 'string' ? row.source : null;
    if (!s) continue;
    (bySource[s] ||= []).push(row);
  }
  return bySource;
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
    let slugs: string[] = [];
    let perSourceIndexed: Record<string, number | null> = {};
    let grandTotal: number | null = null;
    let summaryOk = false;

    try {
      const summary = await fetchSourceSummary();
      if (summary) {
        slugs = summary.slugs;
        perSourceIndexed = summary.perSourceIndexed;
        grandTotal = summary.grandTotal;
        summaryOk = true;
      }
      // Rationale: this whole file must degrade, never throw and abort the
      // build — a build-time fetch failure here must not couple the WHOLE
      // portal build to federation-API uptime (WIS-737 incident class).
    } catch {
      // Rationale: see above — fail closed and continue with the fallback
      // slug list below.
    }

    // CRITICAL fail-closed rule (issue#277): the summary call failed outright
    // (not just returned a short list) — fall back to the FULL current-list
    // snapshot, never the old stale 8-source hardcode, so a still-working
    // sample call below can populate pages for the real 28-source set.
    if (slugs.length === 0) {
      slugs = [...FALLBACK_SOURCE_SLUGS];
    }

    let samplesBySource: Record<string, RawExternalRow[]> = {};
    try {
      samplesBySource = await fetchAllSamples(slugs);
    } catch {
      // Rationale: see above — every source ends up with zero sample rows,
      // which the gate below excludes cleanly. Never a fabricated entry.
    }

    const perSource = slugs.map((slug) => {
      const rawRows = samplesBySource[slug] || [];
      const entries = rawRows
        .map(toEntry)
        .filter((e) => typeof e.origin_url === 'string' && /^https?:\/\//.test(e.origin_url));
      // Total: the live indexed count when the summary call actually gave us
      // one; otherwise the honest count of real, origin-linked sample rows
      // (a true lower bound — never a number larger than what we verified).
      const liveTotal = perSourceIndexed[slug];
      const total = typeof liveTotal === 'number' ? liveTotal : (entries.length > 0 ? entries.length : null);
      return {
        slug,
        total,
        sample: roundRobinSample(entries, SAMPLE_CAP),
        repos: deriveRepos(entries),
      };
    });

    // A source only becomes a built page (and an index table row) when it
    // has BOTH a real total AND at least one sample entry with a real,
    // resolvable origin link. This is the choke point that keeps the index
    // page's table and the set of emitted /federation/{source}/ pages in
    // lockstep — no dead links, ever, by construction.
    const sources: FederationSourcePage[] = perSource
      .filter(
        (s): s is { slug: string; total: number; sample: FederationEntry[]; repos: FederationRepo[] } =>
          s.total !== null && s.sample.length > 0,
      )
      .map((s) => ({ slug: s.slug, meta: metaFor(s.slug), total: s.total, sample: s.sample, repos: s.repos }))
      .sort((a, b) => b.total - a.total);

    return { ok: summaryOk, total: grandTotal, trustLevels: [], sources };
  })();
  return _cachedOverview;
}

/** Convenience: the flat list of source pages that will actually be built. */
export async function getFederationSourcePages(): Promise<FederationSourcePage[]> {
  const overview = await getFederationOverview();
  return overview.sources;
}
