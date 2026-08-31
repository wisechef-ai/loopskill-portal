// GEO surface (geoseed_0601): sitemap.xml was a 404 before this.
// Enumerates the public, indexable static routes + every blog post
// (pulled from the same `blog` content collection /blog uses, so it can
// never drift from the actual published posts).
//
// atomic-0613 WIS-949: enumerate ALL public skill detail pages (/skills/{slug})
// so the full 72-skill catalog is indexed by Google / GEO crawlers.
// Before: only 20 static routes → 52 paid skills invisible to crawlers.
// After:  static routes + ALL skill pages + blog posts.
//
// Static endpoint — emits dist/sitemap.xml at build time.
// No deps (avoids @astrojs/sitemap, which isn't installed and would require
// a `site` config + network install).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { fetchApi } from '../lib/api';
import { getFederationSourcePages } from '../lib/federation';

const SITE = 'https://app.loopskill.io';

// Public, indexable top-level routes. Auth'd / per-user surfaces
// (dashboard, signin, signup, referrals, bundles/view) are intentionally
// excluded — they carry no public SEO value and are Disallow'd in robots.txt.
//
// feat/spotify-ia (council report §9): removed the dead aggregator routes
// /skills and /bundles (now thin client-side redirect stubs to /browse —
// see src/pages/skills/index.astro, src/pages/bundles/index.astro; real
// Caddy 301s land in PR 2). Added /browse and /home, the new canonical
// destinations. /skills/<slug> detail pages remain indexed via
// fetchAllSkillSlugs() below — unaffected by this change (council §8 SEO).
//
// qa0208-w3 (Portal lane, D6 page-cut policy): /graph, /stats, /vs,
// /whitepaper, /compatibility, /whats-new were cut (Adam-confirmed
// 2026-06-12) and are 301'd at Caddy on wisechef-hq — see AGENTS.md
// "Redirects" section. Never a hard-404, but they must not ship in the
// sitemap either: crawlers following a sitemap <loc> that immediately
// 301s is a soft-404 signal. CUT_PATHS is the single source of truth for
// exclusion — filtered out below rather than removed inline, so a future
// re-add is a one-line diff and the exclusion is self-documenting.
const CUT_PATHS = new Set(['/graph', '/stats', '/vs', '/whitepaper', '/compatibility', '/whats-new']);

const STATIC_ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/home', priority: '0.9', changefreq: 'daily' },
  { path: '/browse', priority: '0.9', changefreq: 'daily' },
  { path: '/pricing', priority: '0.9', changefreq: 'weekly' },
  { path: '/docs', priority: '0.8', changefreq: 'weekly' },
  { path: '/blog', priority: '0.7', changefreq: 'weekly' },
  { path: '/compatibility', priority: '0.7', changefreq: 'weekly' },
  { path: '/integrations', priority: '0.6', changefreq: 'weekly' },
  { path: '/vs', priority: '0.6', changefreq: 'weekly' },
  { path: '/stats', priority: '0.5', changefreq: 'daily' },
  { path: '/whats-new', priority: '0.5', changefreq: 'weekly' },
  { path: '/graph', priority: '0.5', changefreq: 'weekly' },
  { path: '/publish', priority: '0.5', changefreq: 'monthly' },
  { path: '/security', priority: '0.4', changefreq: 'monthly' },
  { path: '/docs/share-tokens', priority: '0.6', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
  // G2-federation: the federation overview index. Per-source pages are
  // enumerated separately below (federationUrls) — same no-hard-500
  // contract, built from the same getFederationSourcePages() call the
  // pages themselves use, so the sitemap can never list a source page the
  // build didn't actually emit.
  { path: '/federation', priority: '0.6', changefreq: 'weekly' },
].filter((r) => !CUT_PATHS.has(r.path));

// WIS-949: Walk the full public skill catalog and emit one <loc> per skill
// detail page.  Uses the same paginated strategy as skills/index.astro so we
// never miss skills beyond page 1.  Failures fall back to an empty list (the
// static routes + blog posts still ship; no hard 500 on sitemap build).
async function fetchAllSkillSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const first = await fetchApi<{ results: { slug: string; updated_at?: string }[]; total: number }>(
    '/api/skills/search?page_size=100',
    { authed: false, maxAttempts: 8, initialDelayMs: 600, maxDelayMs: 12000 },
  );

  if (!first.ok || !first.data) {
    return [];
  }

  const { results, total } = first.data;
  let all: { slug: string; updatedAt: string }[] = results.map((s) => ({
    slug: s.slug,
    updatedAt: s.updated_at ? new Date(s.updated_at).toISOString().slice(0, 10) : '',
  }));

  // Walk remaining pages if catalog > 100 entries
  if (results.length === 100 && total > 100) {
    const lastPage = Math.ceil(total / 100);
    for (let p = 2; p <= lastPage; p++) {
      const r = await fetchApi<{ results: { slug: string; updated_at?: string }[] }>(
        `/api/skills/search?page_size=100&page=${p}`,
        { authed: false, maxAttempts: 8, initialDelayMs: 600, maxDelayMs: 12000 },
      );
      if (r.ok && r.data?.results) {
        all = all.concat(
          r.data.results.map((s) => ({
            slug: s.slug,
            updatedAt: s.updated_at ? new Date(s.updated_at).toISOString().slice(0, 10) : '',
          })),
        );
      } else {
        break;
      }
    }
  }

  return all;
}

// atomic_0714: enumerate the public loop catalog (small, stable list — no
// pagination needed today) so /loops/{slug} detail pages are crawlable.
// Falls back to an empty list on API failure; static routes + skill pages
// still ship (same no-hard-500 contract as fetchAllSkillSlugs above).
async function fetchAllLoopSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const res = await fetchApi<{ slug: string; updated_at?: string }[]>('/api/loops', {
    authed: false,
    maxAttempts: 8,
    initialDelayMs: 600,
    maxDelayMs: 12000,
  });
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data.map((l) => ({
    slug: l.slug,
    updatedAt: l.updated_at ? new Date(l.updated_at).toISOString().slice(0, 10) : '',
  }));
}

// fallback_2607: composite loops (atomic-habits, dreaming, ...) live at the
// same /loops/{slug} route (see [slug].astro union fix) but were never
// enumerated here, so sitemap.xml had ZERO composite-loop URLs despite 5 days
// of catalog work landing (deploy_hint, agent_instructions, value_tagline).
// Same no-hard-500 contract — empty list on API failure, everything else ships.
async function fetchAllCompositeLoopSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const res = await fetchApi<{ slug: string; updated_at?: string }[]>('/api/composite-loops', {
    authed: false,
    maxAttempts: 8,
    initialDelayMs: 600,
    maxDelayMs: 12000,
  });
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data.map((l) => ({
    slug: l.slug,
    updatedAt: l.updated_at ? new Date(l.updated_at).toISOString().slice(0, 10) : '',
  }));
}

// gap/pages: enumerate public bundles (/bundles/{slug}) — same no-hard-500
// contract as fetchAllSkillSlugs/fetchAllLoopSlugs above. Before this,
// sitemap.xml carried ZERO /bundles/* entries despite 10 public bundles
// actively sold and listed in llms.txt (live-verified 2026-08-20).
async function fetchAllBundleSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const res = await fetchApi<{ bundles: { slug: string; visibility?: string; created_at?: string }[] }>(
    '/api/bundles/discover',
    { authed: false, maxAttempts: 8, initialDelayMs: 600, maxDelayMs: 12000 },
  );
  if (!res.ok || !Array.isArray(res.data?.bundles)) return [];
  return res.data.bundles
    .filter((b) => !b.visibility || b.visibility === 'public')
    .map((b) => ({
      slug: b.slug,
      updatedAt: b.created_at ? new Date(b.created_at).toISOString().slice(0, 10) : '',
    }));
}

// gap/pages: enumerate public personalities (/personalities/{slug}). Before
// this, sitemap.xml carried ZERO /personalities/* entries despite 2 public
// personalities actively sold and listed in llms.txt (live-verified
// 2026-08-20). Same no-hard-500 contract — empty list on API failure.
async function fetchAllPersonalitySlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const res = await fetchApi<{ slug: string; is_public?: boolean; updated_at?: string }[]>(
    '/api/personalities',
    { authed: false, maxAttempts: 8, initialDelayMs: 600, maxDelayMs: 12000 },
  );
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data
    .filter((p) => p.is_public !== false)
    .map((p) => ({
      slug: p.slug,
      updatedAt: p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : '',
    }));
}

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);

  const [posts, skillSlugs, loopSlugs, compositeLoopSlugs, bundleSlugs, personalitySlugs, federationSources] =
    await Promise.all([
      getCollection('blog'),
      fetchAllSkillSlugs(),
      fetchAllLoopSlugs(),
      fetchAllCompositeLoopSlugs(),
      fetchAllBundleSlugs(),
      fetchAllPersonalitySlugs(),
      // G2-federation: same source of truth the pages themselves build
      // from (getStaticPaths in federation/[source]/index.astro) — empty
      // array on API failure, same no-hard-500 contract as every other
      // fetch* helper in this file.
      getFederationSourcePages(),
    ]);

  const blogUrls = posts.map((p) => {
    const lastmod = p.data.pubDate
      ? new Date(p.data.pubDate).toISOString().slice(0, 10)
      : today;
    return `  <url>
    <loc>${SITE}/blog/${p.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
  });

  const staticUrls = STATIC_ROUTES.map(
    (r) => `  <url>
    <loc>${SITE}${r.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  );

  // WIS-949: per-skill detail pages — one <loc> per public skill in the catalog.
  // Priority 0.8: skill pages are the primary discovery surface for GEO crawlers
  // and human buyers alike; only / and /skills index rank higher.
  const skillUrls = skillSlugs.map(
    (s) => `  <url>
    <loc>${SITE}/skills/${s.slug}</loc>
    <lastmod>${s.updatedAt || today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
  );

  // atomic_0714: per-loop detail pages — one <loc> per public loop.
  // Priority 0.7: below skill pages (primary catalog) but above blog.
  // fallback_2607: unioned with composite loop slugs (same /loops/{slug} route).
  const loopUrls = [...loopSlugs, ...compositeLoopSlugs].map(
    (l) => `  <url>
    <loc>${SITE}/loops/${l.slug}</loc>
    <lastmod>${l.updatedAt || today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
  );

  // gap/pages: per-bundle detail pages — one <loc> per public bundle.
  // Priority 0.7: same tier as loops — a curated collection, not the
  // primary catalog, but a real buyer-facing, GEO-citable product page.
  const bundleUrls = bundleSlugs.map(
    (b: { slug: string; updatedAt: string }) => `  <url>
    <loc>${SITE}/bundles/${b.slug}</loc>
    <lastmod>${b.updatedAt || today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
  );

  // gap/pages: per-personality detail pages — one <loc> per public
  // personality. Small, stable catalog (2 today) — same tier as bundles.
  const personalityUrls = personalitySlugs.map(
    (p: { slug: string; updatedAt: string }) => `  <url>
    <loc>${SITE}/personalities/${p.slug}</loc>
    <lastmod>${p.updatedAt || today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
  );

  // G2-federation: per-source federation pages — one <loc> per upstream
  // source that actually got a /federation/{source}/ page built (see
  // federation.ts getFederationOverview — a source only qualifies with a
  // real total AND at least one sample entry carrying a resolvable origin
  // link). Priority 0.6: a real, citable metadata surface, but one tier
  // below the primary skill/loop/bundle catalog pages.
  const federationUrls = federationSources.map(
    (s: { slug: string }) => `  <url>
    <loc>${SITE}/federation/${s.slug}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...skillUrls, ...loopUrls, ...bundleUrls, ...personalityUrls, ...federationUrls, ...blogUrls].join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
