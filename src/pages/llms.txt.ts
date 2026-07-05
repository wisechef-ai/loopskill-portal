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
  const [snapRes, catRes, fedRes] = await Promise.all([
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
    'recipes_search',
    'recipes_detail',
    'recipes_trending',
    'recipes_install',
    'recipes_install_meta_skill',
    'recipes_stats',
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

  // Free-skill intro copy — degrades honestly. If the live catalog has no
  // free-tier skills right now, don't claim a specific count; point at the
  // self-host path instead (which is always free regardless of catalog tier mix).
  const freeIntro =
    freeSkillsFromCatalog.length > 0
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
- Browse/search the superset (no key): \`GET ${SITE}/api/skills/external?sources=<comma-separated>\`
- Provider facets: \`github-anthropic\`, \`github-openai\`, \`github-huggingface\`, \`github-nvidia\`, \`github-gstack\`, \`github-superpowers\`; aggregators: \`hermes-hub\`, \`skills-sh\`, \`clawhub\`, \`lobehub\`, \`browse-sh\`, \`well-known\`
- Install a redistributable external skill (real SKILL.md from origin): \`GET ${SITE}/api/skills/external/{source}/{slug}/install\`
- One library: the curated catalog is the quality-gated headline; the federation is community/as-is underneath. You never need to open the Hermes Hub separately — LoopSkill indexes it.`
    : '';

  const catalogSizePhrase =
    total !== null
      ? `${total} production-grade, versioned skills`
      : 'a curated set of production-grade, versioned skills';

  const body = `# LoopSkill — the vertical skill marketplace for AI agents

> LoopSkill (by WiseChef) is a curated marketplace of ${catalogSizePhrase} for AI coding agents — and a superset of the public agent-skill ecosystem${fedHeadline ? ` (it federates ${fedHeadline} more community skills, so you never need a second hub)` : ''}. Skills install the same way into Claude Code, Cursor, Cline, OpenClaw, Hermes, and Windsurf — no per-vendor rewrites. ${freeIntro}. Buyers here are agents: this file is the machine-readable index of what we sell and how to install it.

## How an agent installs a skill
LoopSkill exposes ${mcpTools.length} dedicated MCP tools (not a generic REST wrapper). Point your agent's MCP client at the LoopSkill server and call:
${mcpTools.map((t) => `- \`${t}\``).join('\n')}

Or hit the public REST API directly (no key for read/search):
- Search: \`GET ${SITE}/api/skills/search?q=<query>\`
- Detail: \`GET ${SITE}/api/skills/{slug}\`
- Trending: \`GET ${SITE}/api/skills/trending\`
- Install (returns a signed tarball): \`GET ${SITE}/api/skills/install\`${supersetSection}

## Start free
${freeLine}

## Pricing
${PRICING_SUMMARY}
- Pricing page: ${SITE}/pricing

## Featured skills
${trendingLines.length ? trendingLines.join('\n') : '- Browse the full catalog at ' + SITE + '/skills'}

## Key pages
- Catalog: ${SITE}/skills
- Docs (install + MCP wiring): ${SITE}/docs
- Pricing: ${SITE}/pricing
- Compatibility (supported agents): ${SITE}/compatibility
- Blog (architecture + product notes): ${SITE}/blog
- Sitemap: ${SITE}/sitemap.xml

## About
LoopSkill is built by WiseChef (${'https://wisechef.ai'}) on a head-chef + line-cooks model: one orchestrating agent delegates to specialist skills. Skills are signed, versioned, and run with no cloud round-trip at execution time.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Weekly cadence; nightly rebuild refreshes the grounded counts.
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
