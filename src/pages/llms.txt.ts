// GEO surface (geoseed_0601): llms.txt — the machine-readable catalog manifest
// for LLM agents. This is the single highest-value GEO surface for LoopSkill,
// because the BUYERS here are AI agents: an agent reads this file to learn
// what the marketplace sells, how to install, and where the API lives.
//
// Format follows the emerging llms.txt convention (llmstxt.org): an H1, a
// blockquote summary, then linked sections. Content is grounded in LIVE data
// (build-time fetch of /api/marketing/snapshot + /api/skills/search, both
// public/no-key) so it can never drift from the real catalog. If the API is
// unreachable at build time, counts degrade to honest, non-numeric language
// rather than a hardcoded guess — a stale invented number (e.g. "72 skills",
// "$20/mo") is worse than no number, because it silently drifts from the
// pricing page and the live catalog. See identity-guards fix (2026-07-05):
// the SITE constant and pricing copy had drifted to the legacy
// recipes.wisechef.ai / $20-mo positioning while /pricing had already moved
// to app.loopskill.io + $9.95/mo hosted, never-a-feature-gate.
//
// Static endpoint — emits dist/llms.txt at build time. No deps.
import type { APIRoute } from 'astro';
import { fetchApi } from '../lib/api';

const SITE = 'https://app.loopskill.io';

// Single source of truth for pricing copy — MUST stay consistent with
// src/pages/pricing.astro. Free = self-host the whole platform (MPL-2.0,
// no card). Pro = $9.95/mo hosted convenience; never a feature gate — every
// capability that exists on Pro also exists in the free self-host.
const PRICING_SUMMARY =
  'Free: self-host the whole platform yourself (MPL-2.0, open source, no card needed). ' +
  'Pro — $9.95/mo: we host it for you (managed registry + runner, auto-updated catalog, ' +
  'ed25519-signed delivery). Pro is convenience only, never a feature gate — every ' +
  'capability that exists on Pro also exists in the free self-host.';

// ahfounding_0906 — the capped one-time Founding SKU (#304) is surfaced on
// /api/marketing/snapshot as a top-level `founding` key (#313) and rendered on
// /pricing, but this machine-discovery surface advertised only Pro/Enterprise:
// every LLM crawler and agent reading llms.txt could not see the one SKU built
// to convert. Derived from the snapshot rather than hardcoded, the same
// discipline #106 applied to the portal's founding banner — a literal here
// would silently drift the moment the price or the cap changes.
//
// Deliberately conservative: emits NOTHING unless the API gave us a usable
// price, and never claims availability it cannot back. `remaining <= 0` is a
// real state (the cap is 100) and must read as sold out, not as an offer.
export function foundingPricingLine(
  founding: SnapshotFounding | undefined | null,
): string | null {
  if (!founding || typeof founding.price_usd !== 'number') return null;
  const price = Number.isInteger(founding.price_usd)
    ? String(founding.price_usd)
    : founding.price_usd.toFixed(2);
  const name = founding.display_name || 'Founding Member';
  const remaining = founding.remaining;
  const cap = founding.cap;
  if (typeof remaining === 'number' && remaining <= 0) {
    return `${name} — $${price} one-time: SOLD OUT (all ${typeof cap === 'number' ? cap : remaining} founding seats claimed).`;
  }
  const seats =
    typeof remaining === 'number' && typeof cap === 'number'
      ? ` Only ${remaining} of ${cap} founding seats left.`
      : '';
  return (
    `${name} — $${price} one-time: permanent Pro, no subscription, never billed again. ` +
    `Everything in Pro, locked in at the founding price forever.${seats}`
  );
}

// ─────────────────────────────────────────────────────────────────────────
// unisearch_0709 / P4 — register-FIRST cold-agent onboarding.
//
// The defect this fixes: llms.txt told an agent "point your MCP client at the
// LoopSkill server and call these tools" without ever saying where a key comes
// from or that one is required at all. It is required — a keyless call to the
// MCP endpoint answers `401 {"detail":"Invalid or missing x-api-key header"}`
// (verified live 2026-09-08). A cold agent with no credentials therefore
// bounces off a 401 on its first call and has nothing in this file telling it
// what to do next, so it gives up. That is the single highest-cost failure on
// the surface built FOR agent buyers.
//
// The real cold-start path is enroll -> search -> install, and enrollment is
// public: POST /api/agents/register mints a FREE-tier key against an Ed25519
// proof-of-key, with no human and no prior credential.
//
// Everything variable here is read from the live /.well-known/agent.json at
// build time, NOT restated as literals. The canonical string an agent signs
// carries a version tag (`:v1:`) and the rate-limit constants are policy —
// both will move, and a copy frozen in this file would keep telling agents to
// sign the wrong bytes long after the server stopped accepting them. The
// STRUCTURE (which endpoints exist, that the key rides in a header) is static
// so the section — and the assert-dist guards over it — survive the API being
// unreachable at build time; only the DETAIL degrades, to a pointer at
// /.well-known/agent.json, which is the authority either way.
interface WellKnownRegistration {
  endpoint?: string;
  method?: string;
  version?: string;
  algorithm?: string;
  signature_encoding?: string;
  authentication?: string;
  canonical_string?: string;
  request_fields?: Record<string, string>;
  constraints?: Record<string, number>;
  errors?: Record<string, string[]>;
  grants?: string[];
  denies?: string[];
  issues?: {
    header?: string;
    key_prefix?: string;
    tier?: string;
    shown_once?: boolean;
  };
}
export interface WellKnownAgent {
  api_base?: string;
  registration?: WellKnownRegistration;
  mcp?: {
    endpoint?: string;
    transport?: string;
    descriptor?: string;
    authentication?: { type?: string; header?: string };
  };
  catalog?: Record<string, string>;
}

// Turn `registrations_per_ip_per_day` into `registrations per ip per day` —
// the keys are policy names we do not control, so render them rather than
// maintaining a translation table that silently drops a new constraint.
function humanizeKey(k: string): string {
  return k.replace(/_/g, ' ');
}

export function coldStartSection(agent: WellKnownAgent | null | undefined): string {
  const reg = agent?.registration;
  const wellKnown = `${SITE}/.well-known/agent.json`;
  const registerUrl = reg?.endpoint || `${SITE}/api/agents/register`;
  const registerMethod = (reg?.method || 'POST').toUpperCase();
  const mcpUrl = agent?.mcp?.endpoint || `${SITE}/api/mcp/http`;
  // Verified live: POST to the published no-slash form answers 307 to the
  // trailing-slash form. A 307 preserves method and body, but a client that
  // does not follow redirects on POST fails its first MCP call, so name the
  // form that answers 200 directly.
  const mcpPost = mcpUrl.endsWith('/') ? mcpUrl : `${mcpUrl}/`;
  // The header name is the one thing an agent cannot guess and cannot recover
  // from getting wrong — every code path below falls back to it rather than
  // omitting it, because a section that renders without it is the exact 401
  // dead end this whole block exists to remove.
  const keyHeader =
    agent?.mcp?.authentication?.header || reg?.issues?.header || 'x-api-key';

  // Inline, one line, no code fence: this whole section is emitted inside a
  // markdown bullet list and a fenced block would break the list for every
  // reader that actually parses the markdown.
  const canonical = reg?.canonical_string
    ? `As of this build it is \`${reg.canonical_string}\`, but fetch it from \`registration.canonical_string\` at ${wellKnown} rather than copying that line — it is versioned and will move.`
    : `Read it from \`registration.canonical_string\` at ${wellKnown}. Do not guess it — an unrecognised string fails signature verification with no useful hint.`;

  const fields = reg?.request_fields
    ? Object.entries(reg.request_fields)
        .map(([k, v]) => `  - \`${k}\` — ${v}`)
        .join('\n')
    : `  - See \`registration.request_fields\` at ${wellKnown}.`;

  const constraints = reg?.constraints
    ? Object.entries(reg.constraints)
        .map(([k, v]) => `${humanizeKey(k)}: ${v}`)
        .join(' · ')
    : '';
  const constraintLine = constraints
    ? `\n- Enrollment limits (live from \`registration.constraints\`): ${constraints}. Exceeding the per-IP cap returns \`429 {"error":"ip_registration_limit"}\` with a \`retry_after\` in seconds — back off, do not retry in a loop.`
    : `\n- Enrollment is rate limited per IP and globally; see \`registration.constraints\` at ${wellKnown}. A \`429\` carries \`retry_after\` in seconds — back off, do not retry in a loop.`;

  const errorLine = reg?.errors
    ? `\n- Failure codes: ${Object.entries(reg.errors)
        .map(([code, causes]) => `\`${code}\` (${(causes ?? []).join(', ')})`)
        .join(' · ')}`
    : '';

  const grantLine = reg?.grants?.length
    ? `\n- The minted key is FREE tier by construction. It grants: ${reg.grants
        .map((g) => `\`${g}\``)
        .join(', ')}.${
        reg.denies?.length
          ? ` It is denied: ${reg.denies.map((d) => `\`${d}\``).join(', ')} — do not attempt those, they will not be granted by retrying.`
          : ''
      }`
    : `\n- The minted key is FREE tier by construction; see \`registration.grants\` and \`registration.denies\` at ${wellKnown} for exactly what it may do.`;

  const issuedLine = (() => {
    const parts: string[] = [];
    if (reg?.issues?.key_prefix) parts.push(`prefixed \`${reg.issues.key_prefix}\``);
    if (reg?.issues?.tier) parts.push(`tier \`${reg.issues.tier}\``);
    const shape = parts.length ? ` (${parts.join(', ')})` : '';
    const once =
      reg?.issues?.shown_once === false
        ? ''
        : ' It is stored only as a hash and is shown exactly ONCE — persist it before you make your next call.';
    return `- On success you get \`200\` with an \`api_key\`${shape}.${once}`;
  })();

  return `## Cold start — you have no key yet (enroll → search → install)
You are an agent with no credentials and no prior knowledge of this service. This section is the whole path, in three calls. Nothing below needs a human.

**The authoritative machine-readable version of this section is ${wellKnown}** (plus ${agent?.mcp?.descriptor || `${SITE}/.well-known/mcp.json`} for the MCP descriptor). If that document and this file ever disagree, that document wins — fetch it first.

### Step 1 — Enroll: mint your own key (public, no credentials required)
\`${registerMethod} ${registerUrl}\` — this endpoint takes NO api key. You authenticate by proving you hold an Ed25519 private key.
- Generate an Ed25519 keypair and sign the UTF-8 bytes of the canonical registration string. ${canonical}
- Send a JSON body with:
${fields}
${issuedLine}${grantLine}${constraintLine}${errorLine}

### Step 2 — Search: find a skill
**Every MCP call must carry your key in the \`${keyHeader}\` header.** Omit it and the server answers \`401 {"detail":"Invalid or missing ${keyHeader} header"}\` — that 401 is the single most common reason a cold agent stops here. It is not a rejection of your agent; it means you have not done Step 1 yet.
- MCP endpoint: \`POST ${mcpPost}\` (streamable-http; \`${keyHeader}: <your key>\`). Post to the trailing-slash form — \`${mcpUrl}\` answers \`307\` to it, and a client that does not follow redirects on POST will fail its first call. Standard MCP handshake: \`initialize\` → \`notifications/initialized\` → \`tools/call\`.
- \`loopskill_search\` — the curated-catalog search tool. Arguments: \`query\`, and optionally \`category\`, \`tier\`, \`limit\`. Response: \`{results, total, backend, hybrid_augmented}\`.
- **Not using MCP, or want the federated superset?** \`GET ${SITE}/api/skills/metasearch?q=<query>\` is public — no key, no headers. It fans out across every enabled source and is where community skills that are not in the curated catalog show up. Only \`q\` is honoured; other query params are ignored, so do not rely on them to cap your result set.
- The envelope carries \`skills\`, \`result_count\`, \`sources_ok\`, \`sources_degraded\`, \`source_count\`, \`render_contract\` and \`cache\`. Freshness is reported honestly, never faked: \`cache.cache_hit\`, \`cache.cache_age_s\` and \`cache.cache_ttl_s\` are always present, and a cache hit additionally reports \`cache.cache_stale\`. Any source that failed this fan-out is named in \`sources_degraded\` rather than silently dropped — a degraded source means fewer results, not wrong ones, so check it before concluding a skill does not exist.
- Each row carries \`install_ref\`, \`deployable\`, \`install_path\`, \`quality\`, \`origin_url\`. **\`install_ref\` is the only identifier you need for Step 3** — carry it verbatim, it is source-qualified (e.g. \`skills-sh:trailhq--graft--graft\`).
- A row with \`deployable: false\` / \`install_path: "deep_link"\` is a pointer, not a package: we cannot hand you its body (it is not redistributable or has no fetchable content). Go to its \`origin_url\`. Do not treat it as an install failure.

### Step 3 — Install: fetch the skill body
- MCP: \`loopskill_install\`. Its parameter is named \`slug\` and it accepts BOTH a curated catalog slug and a federated \`install_ref\` — pass the \`install_ref\` from Step 2 verbatim as \`slug\`. It returns the resolved skill including \`content\`, \`install_path\`, \`origin_url\`, \`raw_url\` and \`attribution\`.
- Not using MCP: \`GET ${SITE}/api/skills/metasearch/install?install_ref=<install_ref>\` — public, no key. Returns \`{resolved, source, slug, body, origin_url, preview_only, reason, commands}\`, where \`body\` is the real SKILL.md from origin and \`commands\` carries a ready-to-run line per agent runtime.
- An \`install_ref\` we cannot resolve returns \`404 {"resolved": false, "reason": "unresolvable"}\`. That is an honest miss, not an outage — re-search rather than retrying the same ref.
- \`preview_only: true\` means you are being shown a preview, not given redistributable content. Respect it: fetch from \`origin_url\` and keep the \`attribution\`.

`;
}

interface SnapshotCounts {
  skills_total?: number;
  free_skills?: number;
  pro_skills?: number;
  mcp_tools_count?: number;
  // fedtotal_0901 — the server-side, dedupe-aware federated figures. These are
  // the SINGLE SOURCE for the superset headline. Previously this file summed /
  // rounded `/api/skills/external`'s counts itself, which meant the published
  // number depended on which endpoint we happened to read. Both API surfaces
  // now derive from one function (federation_cache.sum_federated_total), so
  // reading the snapshot here makes the portal agree with the API by
  // construction rather than by coincidence.
  federated_skills_total?: number;
  total_reachable_skills?: number;
  personalities_total?: number;
  connectors_total?: number;
}
interface SnapshotFounding {
  display_name?: string;
  price_usd?: number;
  one_time?: boolean;
  cap?: number;
  remaining?: number;
  cta?: string;
  checkout_path?: string;
  bullets?: string[];
}
interface Snapshot {
  counts?: SnapshotCounts;
  mcp_tools?: string[];
  rest_endpoints?: string[];
  founding?: SnapshotFounding;
}
interface CatalogSkill {
  slug: string;
  title?: string;
  description?: string;
  tier?: string;
  category?: string;
  install_count_total?: number;
}
interface CatalogLoop {
  slug: string;
  title?: string;
  description?: string;
  category?: string;
  run_count?: number;
  // ah_0730 rank-8: the converting copy shipped onto /api/loops in #135/#153.
  // llms.txt rendered raw truncated `description` prose instead, throwing away
  // the hook three REVENUE picks paid to write. Always prefer value_tagline.
  value_tagline?: string | null;
  tags?: string[] | null;
}

// mesh0408 T1-D — explicit per-type listings for bundles/personalities so the
// cold-discovery canary can assert every catalog type it covers actually
// appears in llms.txt (not "where applicable" — an explicit list per type).
// Grounded in the same public, no-key endpoints the portal's other pages use;
// omitted entirely (never fabricated) if the build-time fetch fails.
interface CatalogBundle {
  slug: string;
  name?: string;
  description?: string;
  skill_count?: number;
}
interface CatalogPersonality {
  slug: string;
  title?: string;
  description?: string;
  category?: string;
  tier?: string;
}

// ah_0730 rank-2: composite loops (scheduled, multi-step compositions) were
// absent from llms.txt entirely — /api/composite-loops was never fetched, so
// `atomic-habits` and `dreaming` scored ZERO hits in the machine-readable index
// while sitting in sitemap.xml. Humans could find them; agents could not, which
// is backwards for a marketplace whose buyers are agents.
interface CompositeLoop {
  slug: string;
  title?: string;
  description?: string;
  value_tagline?: string | null;
  tags?: string[] | null;
  schedule?: string | null;
  verifier_slug?: string | null;
  tier?: string | null;
}

// Truncate on a word boundary (no mid-word cuts like "Whit…").
function clip(s: string, max: number): string {
  const flat = (s ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export const GET: APIRoute = async () => {
  // Public endpoints — no API key needed. We use search (not trending):
  // install-based trending is too thin to be representative (only a couple
  // of skills have install traction yet), whereas an empty-query search
  // returns a broad, current catalog slice across categories.
  const [snapRes, catRes, fedRes, loopsRes, compositeRes, bundlesRes, personalitiesRes, statsRes, agentRes] = await Promise.all([
    fetchApi<Snapshot>('/api/marketing/snapshot', { authed: false }),
    fetchApi<{ results?: CatalogSkill[] }>(
      '/api/skills/search?q=&limit=24',
      { authed: false },
    ),
    // superset_0606 Phase F — the federation surface is the superset story.
    // Grounded at build time from the public cache-backed counts (no key).
    fetchApi<{
      counts?: { external_indexed?: number; external_installable?: number };
      available_sources?: string[];
    }>('/api/skills/external', { authed: false }),
    // ah_0706 rank-1 (external floor): the runnable-loop registry is the star
    // wedge, but it had ZERO machine-discovery presence — an agent reading this
    // manifest could not learn a single loop slug or how to run one. Ground the
    // Loops section in live /api/loops (public, no key); if unreachable at build
    // time the section is simply omitted (honest degradation, never fabricated).
    fetchApi<CatalogLoop[]>('/api/loops', { authed: false }),
    // ah_0730 rank-2: composite loops are the SCHEDULED, multi-step tier of the
    // registry (a composition + a verifier + a cadence). Six of last week's
    // ★feats poured value_tagline / agent_instructions / deploy hints into this
    // exact surface, yet llms.txt never fetched it. Public, no key; if the fetch
    // fails at build time the section is omitted entirely (honest degradation,
    // never a fabricated slug).
    fetchApi<CompositeLoop[]>('/api/composite-loops', { authed: false }),
    // mesh0408 T1-D: bundles (public bundle catalog) — public, no key.
    // 260901 fix: /api/cookbooks/discover returns { bundles: [...] } post
    // cookbook→bundle rename (P2, #92) — this still read the pre-rename
    // `cookbooks` key, so bundlesRes.data?.cookbooks was always undefined
    // and the ## Bundles section silently vanished from llms.txt despite
    // 10 live public bundles existing. Caught by loopskill-identity-canary.
    fetchApi<{ bundles?: CatalogBundle[]; cookbooks?: CatalogBundle[] }>(
      '/api/bundles/discover?limit=24',
      { authed: false }
    ),
    // mesh0408 T1-D: personalities — public, no key.
    fetchApi<CatalogPersonality[]>('/api/personalities', { authed: false }),
    // first-impression fix (2): the free-skill COUNT below used to be derived
    // from the `/api/skills/search?limit=24` slice above — a hard page_size
    // cap, so the count silently tracked "free skills within the first 24
    // results" rather than the true catalog total. Verified live 2026-08-19:
    // llms.txt said "23 skills are free" while /api/stats.by_tier.free=56.
    // Bind the free-COUNT specifically to the live, unpaginated /api/stats
    // endpoint (public, no key) so it can never drift with catalog growth or
    // page-size changes; the free-skill LISTING below still samples from the
    // 24-item catalog fetch (a full 56-line listing would balloon the file),
    // but the number quoted in prose is now the honest total.
    fetchApi<{ by_tier?: Record<string, number> }>('/api/stats', { authed: false }),
    // unisearch_0709/P4 — the agent-discovery document. Public, no key. This is
    // the ONE source for the register-first cold-start details (canonical
    // signing string, request fields, rate-limit constraints, granted scopes,
    // the MCP endpoint + auth header). Restating any of it as a literal here
    // would drift the moment the API bumps the `:v1:` canonical tag or moves a
    // cap, and a stale signing string does not degrade gracefully — it makes
    // every registration attempt fail signature verification. If this fetch
    // fails at build time the cold-start section still renders with its
    // endpoints and header intact and points the reader at /.well-known/
    // for the detail, so an agent is never left without a path.
    fetchApi<WellKnownAgent>('/.well-known/agent.json', { authed: false }),
  ]);

  // Honest degradation: only trust counts we actually fetched. No invented
  // fallback numbers (previously 72 total / 2 free — neither was real).
  // Note: free-skill count is derived from the live catalog fetch below
  // (freeSkillsFromCatalog), not from the snapshot's free_skills field —
  // the catalog fetch is the more direct signal for "which skills is an
  // agent looking at right now that are free," so we don't need the
  // snapshot's free count as a separate variable.
  // ahfounding_0906 — derive the founding line from the SAME snapshot fetch
  // this endpoint already performs (line ~127). Never fabricated: falls back
  // to omitting the SKU entirely if the snapshot didn't carry it.
  const foundingLine = foundingPricingLine(snapRes.data?.founding);

  // unisearch_0709/P4 — register-first cold start. Rendered unconditionally:
  // an agent that cannot reach /.well-known at OUR build time still gets the
  // endpoints and the x-api-key requirement, which is the part it cannot
  // recover from on its own.
  const coldStart = coldStartSection(agentRes.data);

  const counts = snapRes.data?.counts;
  const total: number | null =
    snapRes.ok && typeof counts?.skills_total === 'number' ? counts.skills_total : null;
  const mcpTools = snapRes.data?.mcp_tools ?? [
    'loopskill_search',
    'loopskill_detail',
    'loopskill_trending',
    'loopskill_install',
    'loopskill_install_meta_skill',
    'loopskill_seeker',
    'loopskill_skillify',
    'loopskill_stats',
  ];

  const catalog = (catRes.data?.results ?? []).filter(
    (s: CatalogSkill) => s?.slug,
  );

  // superset_0606 Phase F — honest federation numbers (indexed vs installable,
  // never conflated).
  //
  // fedtotal_0901: the INDEXED headline now comes from the marketing snapshot's
  // `federated_skills_total`, the server-side dedupe-aware total. The portal
  // must not compute or round this itself — the dedupe topology (hermes-hub
  // contributes its deduped count; the direct clawhub walk is a strict SUBSET
  // of the hub snapshot and is excluded) lives server-side in ONE function.
  // A client-side sum of `per_source` double-counts clawhub by ~77k.
  // Falls back to /api/skills/external's own total (same function, same value)
  // only if the snapshot is unreachable; omits the section if neither answers.
  const fedIndexed =
    typeof counts?.federated_skills_total === 'number'
      ? counts.federated_skills_total
      : (fedRes.data?.counts?.external_indexed ?? 0);
  const fedInstallable = fedRes.data?.counts?.external_installable ?? 0;
  const fedSources = (fedRes.data?.available_sources ?? []).length;
  // Round the headline DOWN to a defensible "+" figure (89,748 → "89,000+"),
  // so the copy is always true even as the giants' counts drift between walks.
  const fedHeadline =
    fedIndexed >= 1000
      ? `${Math.floor(fedIndexed / 1000)}k+`
      : fedIndexed > 0
        ? `${fedIndexed}`
        : '';

  // Free skills — derived from the live catalog fetch (tier === 'free'), not
  // hardcoded names. Catalog composition changes over time; naming specific
  // skills that may no longer exist would itself become a stale-brand defect.
  const freeSkillsFromCatalog = catalog.filter((s) => (s.tier ?? '').toLowerCase() === 'free');
  const freeLine = freeSkillsFromCatalog.length
    ? freeSkillsFromCatalog
        .map(
          (s) =>
            `- [${s.title ?? s.slug}](${SITE}/skills/${s.slug}): free — ${clip(s.description ?? '', 140)}`,
        )
        .join('\n')
    : `- Self-host the whole platform for free (MPL-2.0) — see [/pricing](${SITE}/pricing) for details.`;

  // first-impression fix (2): the free-skill COUNT quoted in prose is bound
  // to the live, unpaginated /api/stats.by_tier.free — NOT to
  // freeSkillsFromCatalog.length, which only reflects free skills inside the
  // first 24 catalog results (see the fetchApi call above). Falls back to the
  // paginated count only if /api/stats is unreachable at build time (honest
  // degradation, never a fabricated number).
  const liveFreeCount =
    statsRes.ok && typeof statsRes.data?.by_tier?.free === 'number'
      ? statsRes.data.by_tier.free
      : freeSkillsFromCatalog.length;

  // Free-skill intro copy — degrades honestly. If the live catalog has no
  // free-tier skills right now, don't claim a specific count; point at the
  // self-host path instead (which is always free regardless of catalog tier mix).
  //
  // issue-58 fix: this count MUST come from the full-catalog snapshot
  // (snapRes.counts.free_skills, backed by marketing_counts()'s unfiltered DB
  // query), never from freeSkillsFromCatalog.length — that array is capped at
  // the 24-row search slice used to build the sample listing below, so its
  // length silently undercounts the moment the catalog exceeds 24 skills.
  const freeSkillsTotal =
    snapRes.ok && typeof counts?.free_skills === 'number' ? counts.free_skills : null;
  const freeIntro =
    // Two independent live sources fix the same defect (main's first-impression
    // pass bound this to /api/stats.by_tier.free; issue-58 bound it to the
    // marketing snapshot's unfiltered free_skills). Keeping both as ONE
    // fallback chain rather than two competing expressions: whichever source
    // answers first wins, the paginated catalog slice is the last resort, and
    // if nothing is reachable we claim no number at all. Never two variables
    // that can disagree about the same published figure.
    liveFreeCount > 0
      ? `${liveFreeCount} skill${liveFreeCount === 1 ? ' is' : 's are'} free to use hosted`
      : freeSkillsTotal !== null && freeSkillsTotal > 0
        ? `${freeSkillsTotal} skill${freeSkillsTotal === 1 ? ' is' : 's are'} free to use hosted`
        : freeSkillsFromCatalog.length > 0
          ? `${freeSkillsFromCatalog.length} skill${freeSkillsFromCatalog.length === 1 ? ' is' : 's are'} free to use hosted`
          : 'Self-hosting the whole platform is always free';

  // Featured = a representative spread of paid skills. One per category where
  // possible, so an agent skimming the manifest sees the catalog's breadth,
  // not just one vertical.
  const seenCat = new Set<string>();
  const featured: CatalogSkill[] = [];
  const rest: CatalogSkill[] = [];
  for (const s of catalog) {
    const cat = (s.category ?? '').toLowerCase();
    if (cat && !seenCat.has(cat)) {
      seenCat.add(cat);
      featured.push(s);
    } else {
      rest.push(s);
    }
  }
  const featuredSet = [...featured, ...rest].slice(0, 10);

  const trendingLines = featuredSet.map((s) => {
    const tier = s.tier ? ` [${s.tier}]` : '';
    const desc = clip(s.description ?? '', 100);
    return `- [${s.title ?? s.slug}](${SITE}/skills/${s.slug})${tier}: ${desc}`;
  });

  const supersetSection = fedHeadline
    ? `

## Beyond the curated catalog — the superset
LoopSkill is a superset of the public agent-skill ecosystem, not just its curated catalog. The federation layer indexes **${fedHeadline}** community skills across ${fedSources} sources (every skill the Hermes Skills Hub lists, plus GitHub provider taps — Anthropic, OpenAI, Hugging Face, NVIDIA, gstack, Superpowers — and aggregators like skills.sh and ClawHub). Counts are honest and never conflated: **${fedIndexed.toLocaleString()} indexed**, **${fedInstallable.toLocaleString()} installable** today (redistributable-licensed skills install straight from origin into a bundle; supply-chain-unvetted or source-available ones deep-link to origin and are never rehosted).
- Browse the superset with ZERO params (no key, no sources needed — verified live, returns real rows): \`GET ${SITE}/api/federation/filter\` (optional filters: \`?source=<id>&license=<spdx>&trust_level=<level>&tag=<tag>&limit=<n>\`)
- Multi-source search variant (no key): \`GET ${SITE}/api/skills/external?sources=hermes-hub,skills-sh,clawhub\` (comma-separated source ids — see the provider-facet list below for every valid value). Note: this endpoint requires an explicit \`sources=\` param — a bare call with no \`sources\` returns zero results by design (nothing is enabled by default), so \`/api/federation/filter\` above is the simpler no-config entry point.
- Provider facets: \`github-anthropic\`, \`github-openai\`, \`github-huggingface\`, \`github-nvidia\`, \`github-gstack\`, \`github-superpowers\`; aggregators: \`hermes-hub\`, \`skills-sh\`, \`clawhub\`, \`lobehub\`, \`browse-sh\`, \`well-known\`
- Install a redistributable external skill (real SKILL.md from origin): \`GET ${SITE}/api/skills/external/{source}/{slug}/install\`
- One library: the curated catalog is the quality-gated headline; the federation is community/as-is underneath. You never need to open the Hermes Hub separately — LoopSkill indexes it.`
    : '';

  const catalogSizePhrase =
    total !== null
      ? `${total} production-grade, versioned skills`
      : 'a curated set of production-grade, versioned skills';

  // ah_0706 rank-1 (external floor): Loops section. The loop registry is the
  // wedge that separates LoopSkill from a static skill catalog — these are
  // runnable, safety-bounded agentic loops an agent can POST-run in ~30s. We
  // list slug + one-liner + the run hero (empty-body POST works since #48).
  // Grounded in live /api/loops; omitted entirely if the fetch failed.
  const loops = (loopsRes.data ?? []).filter((l: CatalogLoop) => l?.slug);
  const loopLines = loops.map((l) => {
    // ah_0730 rank-8: prefer the value_tagline (the deliberately-written
    // conversion hook) over truncated description prose. Fall back to
    // description only when the tagline is null, so a loop that predates the
    // tagline rollout still renders something. Tags are appended so the facets
    // shipped in portal #28 are machine-discoverable too.
    const hook = clip(l.value_tagline ?? l.description ?? '', 140);
    const tags = (l.tags ?? []).filter(Boolean);
    const tagLine = tags.length ? `\n  Tags: ${tags.join(', ')}` : '';
    return `- \`${l.slug}\` — ${l.title ?? l.slug}${hook ? `: ${hook}` : ''}${tagLine}\n  Run it: \`curl -X POST ${SITE}/api/loops/${l.slug}/run\` (empty body OK; returns \`passed: true/false\`)`;
  });
  const loopsSection = loopLines.length
    ? `

## Runnable loops — the wedge (POST and it runs)
Loops are safety-bounded agentic verifiers you can execute directly against the API — not just prose to install. Each carries its own bounds (max_turns, budget, tool_allowlist). The whole point is *prove-it-runs* trust: one POST and you get a real pass/fail.
- List all loops (no key): \`GET ${SITE}/api/loops\`
- Loop detail (README + bounds): \`GET ${SITE}/api/loops/{slug}\`
- Run a loop (returns pass/fail): \`POST ${SITE}/api/loops/{slug}/run\`
${loopLines.join('\n')}`
    : '';

  // ah_0730 rank-2: composite loops — the scheduled, multi-step tier. Each is a
  // composition (skills + a verifier + a cadence) that DEPLOYS onto a fleet
  // rather than being POST-run ad hoc, so it gets its own section with the
  // deploy deep-link instead of the run-it curl. Grounded in live
  // /api/composite-loops; omitted entirely if that fetch failed.
  const composites = (compositeRes.data ?? []).filter((l: CompositeLoop) => l?.slug);
  const compositeLines = composites.map((l) => {
    const hook = clip(l.value_tagline ?? l.description ?? '', 160);
    const tags = (l.tags ?? []).filter(Boolean);
    const tagLine = tags.length ? `\n  Tags: ${tags.join(', ')}` : '';
    const cadence = l.schedule ? `\n  Cadence: every ${l.schedule}` : '';
    const verifier = l.verifier_slug ? ` · verified by \`${l.verifier_slug}\`` : '';
    return `- \`${l.slug}\` — ${l.title ?? l.slug}${hook ? `: ${hook}` : ''}${tagLine}${cadence}${verifier}\n  Deploy it: ${SITE}/loops/view?slug=${l.slug} (or \`POST ${SITE}/api/composite-loops/${l.slug}/deploy\` with a signed-in session and \`{fleet_id, member_id}\`)`;
  });
  const compositesSection = compositeLines.length
    ? `

## Composite loops — scheduled, multi-step (deploy once, runs nightly)
A composite loop is a *standing* agentic routine: a composition of steps plus its own verifier plus a cadence. You do not POST-run these ad hoc — you place a composite loop onto an agent in your fleet and it runs on schedule from then on, verifying its own output each cycle. This is the tier that turns a skill catalog into an operating agent.
- List composite loops (no key): \`GET ${SITE}/api/composite-loops\`
- Detail (full composition): \`GET ${SITE}/api/composite-loops/{slug}\`
- Deploy to a fleet agent (session required): \`POST ${SITE}/api/composite-loops/{slug}/deploy\`
${compositeLines.join('\n')}`
    : '';

  // mesh0408 T1-D — explicit per-type listing: bundles. Grounded in live
  // /api/bundles/discover (public bundles, no key; /api/cookbooks/discover is
  // the accepted legacy alias); omitted entirely if the
  // fetch failed rather than fabricating slugs.
  const bundles = (bundlesRes.data?.bundles ?? bundlesRes.data?.cookbooks ?? []).filter(
    (b: CatalogBundle) => b?.slug
  );
  const bundleLines = bundles.map((b) => {
    const desc = clip(b.description ?? '', 140);
    const count = typeof b.skill_count === 'number' ? ` (${b.skill_count} skills)` : '';
    return `- \`${b.slug}\` — ${b.name ?? b.slug}${count}${desc ? `: ${desc}` : ''}`;
  });
  const bundlesSection = bundleLines.length
    ? `

## Bundles — curated skill collections (install one, get many)
A bundle groups multiple skills (and connectors) into one install. Bundles are the "playlist" primitive — public bundles are browsable and installable with no key.
- List public bundles (no key): \`GET ${SITE}/api/bundles/discover\`
- Detail: \`GET ${SITE}/api/bundles/public/{slug}\`
${bundleLines.join('\n')}`
    : '';

  // mesh0408 T1-D — explicit per-type listing: personalities. Grounded in
  // live /api/personalities (public, no key); omitted entirely if the fetch
  // failed rather than fabricating slugs.
  const personalities = (personalitiesRes.data ?? []).filter((p: CatalogPersonality) => p?.slug);
  const personalityLines = personalities.map((p) => {
    const tier = p.tier ? ` [${p.tier}]` : '';
    const desc = clip(p.description ?? '', 140);
    return `- \`${p.slug}\` — ${p.title ?? p.slug}${tier}${desc ? `: ${desc}` : ''}`;
  });
  const personalitiesSection = personalityLines.length
    ? `

## Personalities — system-prompt archetypes for your agent
A personality is a versioned system-prompt archetype (research analyst, focused dev agent, etc.) you can install onto an agent, distinct from a skill (a capability) or a loop (a runnable routine).${
        typeof counts?.personalities_total === 'number'
          ? ` ${counts.personalities_total} public personalit${counts.personalities_total === 1 ? 'y' : 'ies'} today.`
          : ''
      }
- List public personalities (no key): \`GET ${SITE}/api/personalities\`
- Detail: \`GET ${SITE}/api/personalities/{slug}\`
${personalityLines.join('\n')}`
    : '';

  // mesh0408 T1-D — connectors get an explicit section too, even though the
  // underlying table can legitimately be empty right now (T1-C, a sister
  // phase, populates rows). An empty catalog still gets an honest section
  // naming the endpoints, rather than a silent gap in the machine-readable
  // manifest.
  const connectorCount = counts?.connectors_total;
  const connectorsNote =
    typeof connectorCount === 'number' && connectorCount > 0
      ? `> ${connectorCount} public connector${connectorCount === 1 ? '' : 's'} available today.`
      : `> Note: the public connector catalog is intentionally empty until a human promotes an entry — connectors are staged behind a review gate. See ${SITE}/docs/scope.`;
  const connectorsSection = `

## Connectors — MCP-server config fragments
A connector is a named, versioned MCP-server config template (stdio/http/sse) — literal secrets never transit the server, only \${VAR} env refs. Catalogued alongside skills and bundles.
- List public connectors (no key): \`GET ${SITE}/api/connectors\`
- Detail: \`GET ${SITE}/api/connectors/{slug}\`
${connectorsNote}`;

  const body = `# LoopSkill — the vertical skill marketplace for AI agents

> LoopSkill is a curated marketplace of ${catalogSizePhrase} for AI coding agents — and a superset of the public agent-skill ecosystem${fedHeadline ? ` (it federates ${fedHeadline} more community skills, so you never need a second hub)` : ''}. Skills install the same way into Claude Code, Cursor, Cline, OpenClaw, Hermes, and Windsurf — no per-vendor rewrites. ${freeIntro}. Buyers here are agents: this file is the machine-readable index of what we sell and how to install it.

${coldStart}## Everything else an agent can call
LoopSkill exposes ${mcpTools.length} dedicated MCP tools (not a generic REST wrapper). Configure your MCP client with the endpoint and the \`x-api-key\` from Step 1 above — every one of these needs it — then call:
${mcpTools.map((t) => `- \`${t}\``).join('\n')}

Or hit the public REST API directly (no key for read/search):
- Search: \`GET ${SITE}/api/skills/search?q=<query>\`
- Detail: \`GET ${SITE}/api/skills/{slug}\`
- Trending: \`GET ${SITE}/api/skills/trending\`
- Install (returns a signed tarball): \`GET ${SITE}/api/skills/install?slug=<slug>\`${supersetSection}${loopsSection}${compositesSection}${bundlesSection}${personalitiesSection}${connectorsSection}

## Start free
${freeLine}

## Pricing
${PRICING_SUMMARY}${foundingLine ? `\n${foundingLine}` : ''}
- Pricing page: ${SITE}/pricing

## Featured skills
${trendingLines.length ? trendingLines.join('\n') : '- Browse the full catalog at ' + SITE + '/skills'}

## Key pages
- Catalog: ${SITE}/skills
- Seeker (scan local installs, diff vs catalog): ${SITE}/seeker (tool: \`loopskill_seeker\`)
- Skillify (runbook → installable skill): ${SITE}/skillify (tool: \`loopskill_skillify\`)
- Share tokens (hand a client one install command): ${SITE}/docs/share-tokens
- Runnable loops: ${SITE}/browse?type=loops (API: ${SITE}/api/loops)
- Composite loops (scheduled): ${SITE}/browse?type=loops (API: ${SITE}/api/composite-loops)
- Docs (install + MCP wiring): ${SITE}/docs
- Pricing: ${SITE}/pricing
- Compatibility (supported agents): ${SITE}/compatibility
- Blog (architecture + product notes): ${SITE}/blog
- Sitemap: ${SITE}/sitemap.xml

## About
LoopSkill runs on a head-chef + line-cooks model: one orchestrating agent delegates to specialist skills. Skills are signed, versioned, and run with no cloud round-trip at execution time.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Weekly cadence; nightly rebuild refreshes the grounded counts.
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
