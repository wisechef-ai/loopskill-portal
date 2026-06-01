// GEO surface (geoseed_0601): robots.txt was a 404 before this.
// Recipes is a marketplace whose BUYERS are AI agents, so we explicitly
// welcome AI/LLM crawlers and point them at the sitemap + llms.txt manifest.
// Static endpoint — emits dist/robots.txt at build time. No deps.
import type { APIRoute } from 'astro';

const SITE = 'https://recipes.wisechef.ai';

const body = `# recipes.wisechef.ai — the vertical skill marketplace for AI agents
# Agents and their crawlers are first-class visitors here. Index freely.

User-agent: *
Allow: /

# Keep auth'd / per-user surfaces out of the index (no public value, churns crawl budget)
Disallow: /dashboard
Disallow: /signin
Disallow: /signup
Disallow: /referrals
Disallow: /cookbooks/view

# Discovery manifests
Sitemap: ${SITE}/sitemap.xml
# llms.txt: machine-readable catalog manifest for LLM agents — ${SITE}/llms.txt
`;

export const GET: APIRoute = () =>
  new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
