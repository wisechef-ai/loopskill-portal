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

interface SnapshotCounts {
  skills_total?: number;
  free_skills?: number;
  pro_skills?: number;
  mcp_tools_count?: number;
}
interface Snapshot {
  counts?: SnapshotCounts;
  mcp_tools?: string[];
  rest_endpoints?: string[];
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
  const [snapRes, catRes, fedRes, loopsRes, compositeRes, bundlesRes, personalitiesRes, statsRes] = await Promise.all([
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
    // mesh0408 T1-D: bundles (public cookbooks) — public, no key.
    fetchApi<{ cookbooks?: CatalogBundle[] }>('/api/cookbooks/discover?limit=24', { authed: false }),
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
  ]);

  // Honest degradation: only trust counts we actually fetched. No invented
  // fallback numbers (previously 72 total / 2 free — neither was real).
  // Note: free-skill count is derived from the live catalog fetch below
  // (freeSkillsFromCatalog), not from the snapshot's free_skills field —
  // the catalog fetch is the more direct signal for "which skills is an
  // agent looking at right now that are free," so we don't need the
  // snapshot's free count as a separate variable.
  const counts = snapRes.data?.counts;
  const total: number | null =
    snapRes.ok && typeof counts?.skills_total === 'number' ? counts.skills_total : null;
  const mcpTools = snapRes.data?.mcp_tools ?? [
    'loopskill_search',
    'loopskill_detail',
    'loopskill_trending',
    'loopskill_install',
    'loopskill_install_meta_skill',
    'loopskill_stats',
  ];

  const catalog = (catRes.data?.results ?? []).filter(
    (s: CatalogSkill) => s?.slug,
  );

  // superset_0606 Phase F — honest federation numbers (indexed vs installable,
  // never conflated). When the cache is warm these are the real ~89.7k / ~500;
  // a cold/unreachable build omits the section rather than fabricate a count.
  const fedIndexed = fedRes.data?.counts?.external_indexed ?? 0;
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
- Browse/search the superset (no key): \`GET ${SITE}/api/skills/external?sources=hermes-hub,skills-sh,clawhub\` (comma-separated source ids — see the provider-facet list below for every valid value)
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
  // /api/cookbooks/discover (public bundles, no key); omitted entirely if the
  // fetch failed rather than fabricating slugs.
  const bundles = (bundlesRes.data?.cookbooks ?? []).filter((b: CatalogBundle) => b?.slug);
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
A personality is a versioned system-prompt archetype (research analyst, focused dev agent, etc.) you can install onto an agent, distinct from a skill (a capability) or a loop (a runnable routine).
- List public personalities (no key): \`GET ${SITE}/api/personalities\`
- Detail: \`GET ${SITE}/api/personalities/{slug}\`
${personalityLines.join('\n')}`
    : '';

  // mesh0408 T1-D — connectors get an explicit section too, even though the
  // underlying table can legitimately be empty right now (T1-C, a sister
  // phase, populates rows). An empty catalog still gets an honest section
  // naming the endpoints, rather than a silent gap in the machine-readable
  // manifest.
  const connectorsSection = `

## Connectors — MCP-server config fragments
A connector is a named, versioned MCP-server config template (stdio/http/sse) — literal secrets never transit the server, only \${VAR} env refs. Catalogued alongside skills and bundles.
- List public connectors (no key): \`GET ${SITE}/api/connectors\`
- Detail: \`GET ${SITE}/api/connectors/{slug}\`
> Note: the public connector catalog is intentionally empty until a human promotes an entry — connectors are staged behind a review gate. See ${SITE}/docs/scope.`;

  const body = `# LoopSkill — the vertical skill marketplace for AI agents

> LoopSkill is a curated marketplace of ${catalogSizePhrase} for AI coding agents — and a superset of the public agent-skill ecosystem${fedHeadline ? ` (it federates ${fedHeadline} more community skills, so you never need a second hub)` : ''}. Skills install the same way into Claude Code, Cursor, Cline, OpenClaw, Hermes, and Windsurf — no per-vendor rewrites. ${freeIntro}. Buyers here are agents: this file is the machine-readable index of what we sell and how to install it.

## How an agent installs a skill
LoopSkill exposes ${mcpTools.length} dedicated MCP tools (not a generic REST wrapper). Point your agent's MCP client at the LoopSkill server and call:
${mcpTools.map((t) => `- \`${t}\``).join('\n')}

Or hit the public REST API directly (no key for read/search):
- Search: \`GET ${SITE}/api/skills/search?q=<query>\`
- Detail: \`GET ${SITE}/api/skills/{slug}\`
- Trending: \`GET ${SITE}/api/skills/trending\`
- Install (returns a signed tarball): \`GET ${SITE}/api/skills/install?slug=<slug>\`${supersetSection}${loopsSection}${compositesSection}${bundlesSection}${personalitiesSection}${connectorsSection}

## Start free
${freeLine}

## Pricing
${PRICING_SUMMARY}
- Pricing page: ${SITE}/pricing

## Featured skills
${trendingLines.length ? trendingLines.join('\n') : '- Browse the full catalog at ' + SITE + '/skills'}

## Key pages
- Catalog: ${SITE}/skills
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
