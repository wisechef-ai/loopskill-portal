// GEO surface (geoseed_0601): llms.txt — the machine-readable catalog manifest
// for LLM agents. This is the single highest-value GEO surface for Recipes,
// because the BUYERS here are AI agents: an agent reads this file to learn
// what the marketplace sells, how to install, and where the API lives.
//
// Format follows the emerging llms.txt convention (llmstxt.org): an H1, a
// blockquote summary, then linked sections. Content is grounded in LIVE data
// (build-time fetch of /api/marketing/snapshot + /api/skills/search, both
// public/no-key) so it can never drift from the real catalog. If the API is
// unreachable at build time, a hard fallback keeps the file claim-accurate
// for the current single-free-seed positioning (super-memory free; rest Pro).
//
// Static endpoint — emits dist/llms.txt at build time. No deps.
import type { APIRoute } from 'astro';
import { fetchApi } from '../lib/api';

const SITE = 'https://recipes.wisechef.ai';

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
  const [snapRes, catRes] = await Promise.all([
    fetchApi<Snapshot>('/api/marketing/snapshot', { authed: false }),
    fetchApi<{ results?: CatalogSkill[] }>(
      '/api/skills/search?q=&limit=24',
      { authed: false },
    ),
  ]);

  const counts = snapRes.data?.counts ?? {};
  const total = counts.skills_total ?? 62;
  const free = counts.free_skills ?? 1;
  const pro = counts.pro_skills ?? 61;
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

  // The single free seed. Surfaced first and explicitly so an agent knows
  // exactly which skill is the zero-friction way in.
  const freeLine =
    '- [super-memory](' +
    SITE +
    '/skills/super-memory): the one free skill — a one-command installer for a full agent memory stack (knowledge graph + vector recall + nightly ingest). Install it to see how Recipes works, then unlock the rest with Pro.';

  // Featured = a representative spread of paid skills (super-memory already
  // appears under "Start free"). One per category where possible, so an agent
  // skimming the manifest sees the catalog's breadth, not just one vertical.
  const seenCat = new Set<string>();
  const featured: CatalogSkill[] = [];
  const rest: CatalogSkill[] = [];
  for (const s of catalog) {
    if (s.slug === 'super-memory') continue;
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

  const body = `# Recipes — the vertical skill marketplace for AI agents

> Recipes (by WiseChef) is a curated marketplace of ${total} production-grade, versioned skills for AI coding agents. Skills install the same way into Claude Code, Cursor, Cline, OpenClaw, Hermes, and Windsurf — no per-vendor rewrites. One skill is free (super-memory); the remaining ${pro} are unlocked with a single $20/mo Pro plan. Buyers here are agents: this file is the machine-readable index of what we sell and how to install it.

## How an agent installs a skill
Recipes exposes ${mcpTools.length} dedicated MCP tools (not a generic REST wrapper). Point your agent's MCP client at the Recipes server and call:
${mcpTools.map((t) => `- \`${t}\``).join('\n')}

Or hit the public REST API directly (no key for read/search):
- Search: \`GET ${SITE}/api/skills/search?q=<query>\`
- Detail: \`GET ${SITE}/api/skills/{slug}\`
- Trending: \`GET ${SITE}/api/skills/trending\`
- Install (returns a signed tarball): \`GET ${SITE}/api/skills/install\`

## Start free
${freeLine}

## Pricing
- Free: super-memory only (MIT-licensed, no account needed to browse).
- Pro — $20/mo: every paid skill in the catalog (${pro} today, growing weekly), up to 10 cookbooks + fleet sync, cross-vendor install, per-key visibility.
- Pro+ — $100/mo: everything in Pro plus up to 200 cookbooks, deploy pre-built cookbooks to clients' agents, private org catalog.
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
Recipes is built by WiseChef (${'https://wisechef.ai'}) on a head-chef + line-cooks model: one orchestrating agent delegates to specialist skills. Skills are signed, versioned, and run with no cloud round-trip at execution time.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Weekly cadence; nightly rebuild refreshes the grounded counts.
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
