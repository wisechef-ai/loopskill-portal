#!/usr/bin/env node
/**
 * loopskill-audit — the "big working machine".
 *
 * Crawls every route of a deployed site with a real (headless) browser and,
 * per page, records hard evidence a human reviewer would otherwise have to
 * hunt for by hand:
 *   - HTTP status
 *   - uncaught JS errors + console errors
 *   - failed network requests (broken APIs, 404 assets, dead OAuth)
 *   - the page's VISIBLE text, scanned for off-brand / stale tokens
 *   - a full-page screenshot (so we can eyeball or vision-check the worst)
 *
 * Output: a single ranked defect list (JSON + human summary). "Done" = this
 * machine reports zero defects, not a human spot-check.
 *
 * Usage:  BASE=https://app.loopskill.io node loopskill-audit.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'https://app.loopskill.io';
const OUT = process.env.OUT || '/tmp/loopskill-audit';
fs.mkdirSync(OUT, { recursive: true });

// Routes to crawl. Derived from the deployed dist if available, else a core list.
let ROUTES = [];
const distDir = process.env.DIST || '/home/adam/repos/loopskill-portal/dist';
try {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name === 'index.html' ? [p] : [];
  });
  ROUTES = walk(distDir)
    .map(p => p.replace(distDir, '').replace(/\/index\.html$/, '/') || '/')
    .filter(r => !r.startsWith('/blog/') || r === '/blog/')  // sample blog, not every post
    .sort();
} catch {
  ROUTES = ['/', '/loops', '/loops/run?slug=secret-scan-loop', '/skills', '/pricing', '/signin', '/docs', '/account', '/library', '/fleets'];
}

// Tokens that should NEVER appear in user-visible copy on a LoopSkill page.
// (Case-insensitive. Word-boundary where it matters to avoid false hits.)
const FORBIDDEN = [
  { re: /\bcookbook(s)?\b/i, tag: 'STALE_BRAND:cookbook(→bundle)' },
  // "recipe(s)" but NOT inside an email/URL token; WiseChef parent brand is allowed.
  { re: /\brecipes?\b/i,     tag: 'STALE_BRAND:recipe(→loop/skill)' },
  // chef-hat / "chef" as a standalone word — but NOT the legitimate parent brand "WiseChef".
  { re: /(?<!wise)chef/i,    tag: 'STALE_BRAND:chef' },
  { re: /one cookbook|whole fleet|always current/i, tag: 'STALE_HERO' },
  { re: /\$20\/mo|\$100\/mo|\bPro\+\b/i, tag: 'STALE_PRICING' },
  { re: /84,?000\+? skills/i, tag: 'STALE_PITCH:skill-count' },
];

const results = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

for (const route of ROUTES) {
  const url = BASE + route + (route.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const page = await ctx.newPage();
  const consoleErrs = [], netFails = [], pageErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => pageErrs.push(e.message));
  page.on('requestfailed', r => netFails.push(`${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('response', r => { const s = r.status(); if (s >= 400 && r.url().includes('/api/')) netFails.push(`API ${s} ${r.url().replace(BASE,'')}`); });

  let status = 'ERR';
  try { const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }); status = resp ? resp.status() : 'no-resp'; }
  catch (e) { pageErrs.push('NAV: ' + e.message); }
  await page.waitForTimeout(2000);

  let text = '';
  try { text = await page.evaluate(() => document.body ? document.body.innerText : ''); } catch {}
  const brand = FORBIDDEN.filter(f => f.re.test(text)).map(f => f.tag);

  const shot = path.join(OUT, 'shot' + route.replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '.png');
  try { await page.screenshot({ path: shot, fullPage: true }); } catch {}

  // Filter the /api/auth/me 401 noise (expected for anonymous) from real failures.
  const realNet = netFails.filter(n => !/auth\/me/.test(n));
  const defects = [];
  if (status !== 200) defects.push(`HTTP ${status}`);
  if (pageErrs.length) defects.push(`JS_ERROR(${pageErrs.length})`);
  if (realNet.length) defects.push(`NET_FAIL(${realNet.length})`);
  brand.forEach(b => defects.push(b));

  results.push({ route, status, defects, brand, pageErrs, realNet, consoleErrs: consoleErrs.filter(c=>!/auth\/me|401/.test(c)), shot });
  await page.close();
  process.stderr.write(`. ${route} [${defects.length ? defects.join(',') : 'clean'}]\n`);
}
await browser.close();

// Rank: pages with JS errors / HTTP failures first, then brand defects.
const sev = (r) => (r.status !== 200 ? 1000 : 0) + r.pageErrs.length * 100 + r.realNet.length * 50 + r.brand.length * 5;
results.sort((a, b) => sev(b) - sev(a));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));

const dirty = results.filter(r => r.defects.length);
let md = `# LoopSkill audit — ${BASE}\n\n${results.length} routes, ${dirty.length} with defects.\n\n`;
for (const r of dirty) {
  md += `## ${r.route}  ·  ${r.defects.join(' · ')}\n`;
  if (r.pageErrs.length) md += `  - JS: ${r.pageErrs.join(' | ')}\n`;
  if (r.realNet.length) md += `  - NET: ${r.realNet.slice(0,5).join(' | ')}\n`;
  md += '\n';
}
fs.writeFileSync(path.join(OUT, 'report.md'), md);
console.log(md);
console.log(`\nFull JSON: ${OUT}/report.json   Screenshots: ${OUT}/shot*.png`);
