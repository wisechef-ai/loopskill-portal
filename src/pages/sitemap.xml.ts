// GEO surface (geoseed_0601): sitemap.xml was a 404 before this.
// Enumerates the public, indexable static routes + every blog post
// (pulled from the same `blog` content collection /blog uses, so it can
// never drift from the actual published posts). Static endpoint — emits
// dist/sitemap.xml at build time. No deps (avoids @astrojs/sitemap, which
// isn't installed and would require a `site` config + network install).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://recipes.wisechef.ai';

// Public, indexable top-level routes. Auth'd / per-user surfaces
// (dashboard, signin, signup, referrals, cookbooks/view) are intentionally
// excluded — they carry no public SEO value and are Disallow'd in robots.txt.
const STATIC_ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/skills', priority: '0.9', changefreq: 'daily' },
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
  { path: '/privacy', priority: '0.3', changefreq: 'monthly' },
];

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().slice(0, 10);

  const posts = await getCollection('blog');
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
  </url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...blogUrls].join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
