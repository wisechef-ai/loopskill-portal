#!/usr/bin/env node
/**
 * audit-links.mjs — fail the build when an internal link points at a route the
 * build did not emit.
 *
 * WHY THIS EXISTS
 * ---------------
 * The apex (loopskill.io) shipped three dead links for weeks and nothing
 * caught them, because "the file exists" and "HTTP 200 on /" are both lies
 * about whether a *route* resolves (trap E7). `assert-dist.sh` already asserts
 * that specific pages exist; it cannot know which pages the copy links TO.
 * This script closes that gap from the other direction: it reads every anchor
 * the build actually emitted and resolves it the way the production web server
 * would.
 *
 * RESOLUTION MODEL
 * ----------------
 * Caddy serves dist/ with `try_files {path} {path}/index.html {path}.html`
 * (ops/Caddyfile). We resolve a link the same way, so a PASS here means the
 * same thing it means in production. Anything else is a 404 for a real visitor.
 *
 * Usage:
 *   node scripts/audit-links.mjs [dist_dir]
 *
 * Exit 0 = every internal link resolves. Exit 1 = at least one 404.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, posix, relative } from 'node:path';

/**
 * Paths that a real visitor CAN reach but that never appear in dist/, because
 * the production web server answers them before the file server does. Each
 * entry names the ops/Caddyfile rule that serves it — an entry with no server
 * rule behind it is a bug in this list, not an exemption.
 *
 * Keep this list narrow. Every addition is a promise that something outside
 * the build serves that path; the smoke probe in scripts/smoke-deploy.sh is
 * what keeps that promise honest.
 */
const SERVED_OUTSIDE_DIST = [
  // ops/Caddyfile: `handle /api/*` → reverse_proxy localhost:8200
  { prefix: '/api/', why: 'Caddyfile: reverse_proxy to the API on :8200' },
  // ops/Caddyfile: `redir /skill …` → the meta-skill SKILL.md on GitHub raw
  { exact: '/skill', why: 'Caddyfile: 302 to the meta-skill SKILL.md' },
  { exact: '/skill/', why: 'Caddyfile: 302 to the meta-skill SKILL.md' },
  { exact: '/SKILL.md', why: 'Caddyfile: 302 to the meta-skill SKILL.md' },
  // ops/Caddyfile: `redir /fleet …` → the fleet installer on GitHub raw
  { exact: '/fleet', why: 'Caddyfile: 302 to install-fleet.sh' },
  // astro.config.mjs header: Caddy rewrites /cookbooks/<uuid> and
  // /cookbooks/p/<slug> onto the query-string pages that DO exist in dist.
  { regex: /^\/cookbooks\/[A-Za-z0-9][A-Za-z0-9-]*\/?$/, why: 'Caddyfile: rewrite → /cookbooks/view?id=' },
  { regex: /^\/cookbooks\/p\/[A-Za-z0-9][A-Za-z0-9-]*\/?$/, why: 'Caddyfile: rewrite → /cookbooks/p?slug=' },
];

const SKIP_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Blank out <script> and <style> bodies, preserving byte offsets so reported
 * line numbers still point at the right source line.
 *
 * LIMITATION, stated on purpose: links that only exist inside client JS
 * (`href="${esc(href)}"` in a template literal) cannot be resolved statically —
 * their target is a runtime value. This guard covers server-rendered markup,
 * which is where the apex's three dead links lived. Client-rendered
 * destinations are covered by the route render pass instead.
 */
export function stripScriptsAndStyles(html) {
  return html.replace(
    /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
    (_m, open, _tag, body, close) => open + body.replace(/[^\n]/g, ' ') + close
  );
}

/** Every href="…" in the document, in source order, with its line number. */
export function extractHrefs(html) {
  const out = [];
  const scrubbed = stripScriptsAndStyles(html);
  const re = /\shref\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(scrubbed)) !== null) {
    const line = scrubbed.slice(0, m.index).split('\n').length;
    out.push({ raw: m[1], line });
  }
  return out;
}

/** The route a link resolves to, or null if this link is not ours to check. */
export function normalizeLink(raw, pageRoute) {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith('#')) return null; // same-page anchor
  if (SKIP_SCHEME.test(href)) return null; // absolute URL, mailto:, tel:, data:, javascript:
  const path = href.split('#')[0].split('?')[0];
  if (!path) return null; // pure query/hash, e.g. href="?q=x"
  if (path.startsWith('/')) return path;
  // A document-relative href resolves against the DIRECTORY the document is
  // served from. dist/docs/index.html is served at /docs/, so its base dir is
  // /docs/ — not dirname('/docs/'), which is '/'. Getting this wrong silently
  // resolves every relative link one level too high.
  const baseDir = pageRoute.endsWith('/') ? pageRoute : `${posix.dirname(pageRoute)}/`;
  return posix.normalize(baseDir + path);
}

function servedOutsideDist(route) {
  for (const rule of SERVED_OUTSIDE_DIST) {
    if (rule.exact && route === rule.exact) return rule;
    if (rule.prefix && route.startsWith(rule.prefix)) return rule;
    if (rule.regex && rule.regex.test(route)) return rule;
  }
  return null;
}

/** Resolve a route against dist/ exactly as Caddy's try_files would. */
export function resolvesInDist(distDir, route) {
  const rel = decodeURI(route).replace(/^\/+/, '');
  const base = rel === '' ? distDir : join(distDir, rel);
  const candidates = [base, join(base, 'index.html'), `${base}.html`];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    if (statSync(c).isFile()) return true;
    // A bare directory only resolves if it holds an index.html — which the
    // second candidate already covers. A directory alone is a 404.
  }
  return false;
}

function main() {
  const distDir = process.argv[2] || 'dist';
  if (!existsSync(distDir)) {
    console.error(`audit-links: ${distDir}/ does not exist — run the build first.`);
    return 1;
  }

  const files = walk(distDir);
  const broken = [];
  let checked = 0;

  for (const file of files) {
    // The route this file is served AT, e.g. dist/docs/index.html → /docs/
    const relPath = relative(distDir, file).split(/[\\/]/).join('/');
    const pageRoute = '/' + relPath.replace(/index\.html$/, '');
    const html = readFileSync(file, 'utf8');

    for (const { raw, line } of extractHrefs(html)) {
      const route = normalizeLink(raw, pageRoute);
      if (route === null) continue;
      checked++;
      if (servedOutsideDist(route)) continue;
      if (resolvesInDist(distDir, route)) continue;
      broken.push({ file: relPath, line, href: raw, route });
    }
  }

  if (broken.length === 0) {
    console.log(
      `audit-links: OK — ${checked} internal link(s) across ${files.length} page(s) all resolve.`
    );
    return 0;
  }

  // Group by target so one dead route reported from 40 pages reads as one
  // defect, which is what it is.
  const byRoute = new Map();
  for (const b of broken) {
    if (!byRoute.has(b.route)) byRoute.set(b.route, []);
    byRoute.get(b.route).push(b);
  }

  console.error(
    `audit-links: ${byRoute.size} dead internal route(s) linked from ${broken.length} place(s)\n`
  );
  for (const [route, hits] of [...byRoute.entries()].sort()) {
    console.error(`  ${route}  — 404 (linked ${hits.length}×)`);
    for (const h of hits.slice(0, 6)) {
      console.error(`      ${h.file}:${h.line}  href="${h.href}"`);
    }
    if (hits.length > 6) console.error(`      … and ${hits.length - 6} more`);
    console.error('');
  }
  console.error(
    'Either the page must exist, or the link must go. A link to nowhere is a\n' +
      'defect the visitor sees before anyone else does.'
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
