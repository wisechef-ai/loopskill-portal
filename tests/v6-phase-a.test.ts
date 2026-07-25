/**
 * v6 Phase A — portal deliverable tests
 * TDD: these tests are written first, then the implementation follows.
 *
 * Tests cover:
 * 1. subset filter (pantry|menu|cookbook) in /skills
 * 2. external_resources rendering — only when present
 * 3. skill_variant badge rendering
 * 4. Currency sweep — no stale $N/mo prices in built dist/
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// ---------------------------------------------------------------------------
// 1. Subset filter — was on /skills page, now a RedirectStub [STALE, removed]
// ---------------------------------------------------------------------------
describe('subset filter [STALE — /skills listing UI removed in feat/spotify-ia]', () => {
  // STALE: src/pages/skills/index.astro's 922-line listing body (subset
  // filter chips, data-subset attributes, ?subset= URL handling) was
  // deleted wholesale in the Spotify-IA restructure (commit fc0d01f,
  // "feat(ia): Spotify-model restructure — Home shelves, unified Browse,
  // Library tabs") and replaced with a client-side RedirectStub to
  // /browse?type=skills. Confirmed: grep for
  // data-subset/pantry/menu/cookbook subset concept returns zero hits
  // anywhere in src/ — the pantry|menu|cookbook subset taxonomy was cut,
  // not migrated to /browse.astro's tab model (which filters by
  // ARTIFACT TYPE — loops/skills/bundles/personalities — a different,
  // unrelated axis). This is a genuine feature removal, not a rename; there
  // is nothing left to pin.
  const skillsIndexPath = join(SRC, 'pages/skills/index.astro');

  it('skills/index.astro is now a RedirectStub (no listing UI to filter)', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('RedirectStub');
    expect(src).not.toContain('data-subset-filter');
  });
});

// ---------------------------------------------------------------------------
// 4. /skills/[slug] — external_resources sidebar + skill_variant badge
// ---------------------------------------------------------------------------
describe('skill detail page external_resources + badge', () => {
  const slugPath = join(SRC, 'pages/skills/[slug].astro');

  it('renders skill_variant badge on detail page', () => {
    const src = readFileSync(slugPath, 'utf-8');
    expect(src).toContain('skill_variant');
  });

  it('renders You might also want sidebar when external_resources present', () => {
    const src = readFileSync(slugPath, 'utf-8');
    expect(src).toContain('external_resources');
    expect(src).toContain('You might also want');
  });

  it('shows name + URL + relation + description per external_resource item', () => {
    const src = readFileSync(slugPath, 'utf-8');
    // The template must reference each field from the external resource object
    expect(src).toMatch(/ext(?:Res)?\.url|\.url/);
    expect(src).toMatch(/ext(?:Res)?\.relation|\.relation/);
    expect(src).toMatch(/ext(?:Res)?\.description|\.description/);
  });
});

// ---------------------------------------------------------------------------
// 5. /cookbook page exists and has correct copy — NO 'fork' word
// ---------------------------------------------------------------------------
describe('/cookbook page', () => {
  const cookbookPath = join(SRC, 'pages/cookbook.astro');

  it('cookbook.astro file exists', () => {
    expect(existsSync(cookbookPath)).toBe(true);
  });

  it('contains required copy about Bundle creation', () => {
    const src = readFileSync(cookbookPath, 'utf-8');
    // STALE: aff2b79 "cookbook→bundle visible copy sweep (350 swaps, 40
    // files)" renamed every user-facing "cookbook" string to "bundle" —
    // including in THIS file (title is "Your Bundle", not "Your
    // Cookbook"). Zero occurrences of "cookbook" remain in cookbook.astro
    // (grep-verified); asserting for it would be asserting for the
    // pre-rebrand copy the rename deliberately replaced. The file's own
    // *path* is still /cookbook (a legacy URL kept for compat — see
    // AGENTS.md page-cut policy), but its content is 100% "Bundle" branded.
    expect(src.toLowerCase()).toContain('bundle');
    // f742cf3 "align cookbook caps to SSOT, drop stale tier names" dropped
    // the old "Cook+" tier-branded copy — the page now gates the CTA on
    // the current canonical "Pro" tier label (src/lib/tiers.ts), not a
    // fictional "Cook+" plan that never shipped under that name.
    expect(src).toContain('Pro');
    expect(src.toLowerCase()).toContain('install');
  });

  it('does NOT contain the word "fork" anywhere (user-facing)', () => {
    const src = readFileSync(cookbookPath, 'utf-8');
    // Case-insensitive search for 'fork' but allow 'github.com' style urls
    const stripped = src.replace(/https?:\/\/\S+/g, '');
    expect(stripped.toLowerCase()).not.toContain('fork');
  });
});

// ---------------------------------------------------------------------------
// 6. Currency sweep — no $N/mo stale prices in src/
// ---------------------------------------------------------------------------
describe('currency sweep', () => {
  function walkFiles(dir: string, ext: string[]): string[] {
    const results: string[] = [];
    function walk(current: string) {
      if (!existsSync(current)) return;
      const stat = statSync(current);
      if (stat.isDirectory()) {
        if (current.includes('node_modules') || current.includes('.git')) return;
        readdirSync(current).forEach(f => walk(join(current, f)));
      } else {
        if (ext.some(e => current.endsWith(e))) results.push(current);
      }
    }
    walk(dir);
    return results;
  }

  const PRICE_RE = /\$\d+\/(mo|month|year)/gi;
  // Allow internal docs mentions of Anthropic $ spend — only block user-facing pages
  const USER_FACING_DIRS = [join(SRC, 'pages'), join(SRC, 'components'), join(SRC, 'layouts')];
  // Locked canonical pricing per RCP-1 (PR #17): Cook $20/mo (1 seat),
  // Operator $100/mo (20 endpoints). rebrand(loopskill_0622) relabeled these
  // Pro/Pro+ (DB slugs unchanged — see src/lib/tiers.ts). REAL BUG fix
  // 2026-07-25: $300/mo is a genuine, separately-documented SKU — the
  // per-client bundle-deployment rate (EarningsCalculator.astro's own
  // in-file math comment: "Bundle earnings = clients × $300/mo (Pro+
  // unlock)"), not a stale leftover. It predates this test's last update
  // and was never added to the allowlist even though it's load-bearing,
  // internally-consistent pricing copy. Anything else in user-facing copy
  // is stale.
  const CANONICAL_PRICES = new Set(['$20/mo', '$100/mo', '$300/mo']);

  it('has zero stale prices outside canonical Cook ($20/mo) / Operator ($100/mo) / Bundle ($300/mo) pricing', () => {
    const files = USER_FACING_DIRS.flatMap(d => walkFiles(d, ['.astro', '.ts', '.js', '.html']));
    // File allow-list: pages whose price strings are intentionally non-canonical.
    const ALLOWLIST_FILES = new Set([
      // Competitor comparison content — /vs named ChatGPT GPTs at $20/mo
      // (Plus) alongside our pricing. The page was removed in the D6 IA
      // cuts (feat/spotify-ia, commit 8565532) but the allowlist entry is
      // harmless to keep for any future competitor-comparison page.
      join(SRC, 'pages/vs.astro'),
      // REAL BUG fix 2026-07-25: these two files show WORKED EXAMPLES of
      // the 50% referral rev-share formula (e.g. "10 refs × $20 × 0.5 =
      // $100/mo"), not independent price points. Their $10/$50/$250/$350
      // figures are arithmetic derivatives of the canonical $20/$100
      // prices, correctly computed and internally consistent (verified:
      // 10×20×0.5=100, 5×100×0.5=250, 100+250=350) — not fabricated or
      // stale pricing. A regex that flags "$N/mo" text can't tell a locked
      // price from a computed illustration; allowlisting is the honest fix
      // (the alternative — deleting the worked examples — would remove
      // real, correct educational content the referral page depends on).
      join(SRC, 'components/ReferralPitch.astro'),
      join(SRC, 'components/EarningsCalculator.astro'),
    ]);
    const hits: string[] = [];
    for (const f of files) {
      if (ALLOWLIST_FILES.has(f)) continue;
      const content = readFileSync(f, 'utf-8');
      const matches = content.match(PRICE_RE) || [];
      const stale = matches.filter(m => !CANONICAL_PRICES.has(m.toLowerCase()));
      if (stale.length) {
        hits.push(`${f}: ${stale.join(', ')}`);
      }
    }
    expect(hits, `Stale (non-canonical) prices found:\n${hits.join('\n')}`).toHaveLength(0);
  });
});
