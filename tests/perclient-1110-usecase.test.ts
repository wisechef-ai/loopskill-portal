/**
 * perclient_1110 M3.2 / M4.1 — the "one private bundle per client" use-case
 * page and its blog post.
 *
 * What these tests pin:
 *   1. The page source exists (src/pages/use-cases/one-private-bundle-per-client.astro).
 *   2. Every /signin or /api/checkout link on the page carries
 *      utm_source=usecase, utm_medium=page, utm_campaign=uc-per-client — the
 *      attribution the M5 verdict counts. /signin relays utm_* onto the OAuth
 *      links (pricing0928), so the params must be on the /signin URL itself.
 *   3. Claim pinning: every number in the page's copy must appear in the digit
 *      allowlist GENERATED from M1-transcript.md (committed as
 *      tests/fixtures/perclient-1110-allowlist.txt, because the state dir is
 *      outside this repo). Dates of the quoted third-party sources and the
 *      date parts in their URLs are allowed via a separate explicit list.
 *   4. The blog post exists, its LoopSkill links carry utm_medium=blog, and
 *      its numbers obey the same allowlist.
 *   Plus: the beacon is a plain inline script that cannot break the page, the
 *   agent instruction uses only commands proven in the transcript and tells the
 *   agent not to register itself, the cap message shows the tier as `free`,
 *   the page is in sitemap + llms.txt, and it is NOT in the global nav.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const PAGE = join(ROOT, 'src/pages/use-cases/one-private-bundle-per-client.astro');
const POST = join(ROOT, 'src/content/blog/one-private-bundle-per-client.md');
const FIXTURE = join(ROOT, 'tests/fixtures/perclient-1110-allowlist.txt');
const PAGE_PATH = '/use-cases/one-private-bundle-per-client';

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf-8') : '');

// ── allowlist generated from the transcript section (via the fixture) ──────
function transcriptAllowlist(): Set<string> {
  const raw = readFileSync(FIXTURE, 'utf-8');
  const lines = raw.split('\n');
  const i = lines.findIndex((l) => /^##\s+Digit allowlist/.test(l));
  if (i < 0) throw new Error('fixture has no "## Digit allowlist" section');
  const body = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith('#'));
  if (!body) throw new Error('fixture "## Digit allowlist" section is empty');
  return new Set(body.split(',').map((s) => s.trim()).filter(Boolean));
}

// Not measured by us: the publication dates of the three quoted sources
// (read off each page on 2026-10-11) and the date parts of penkin.me's URL
// (/2026/07/30/). Nothing else may be added here.
const SOURCE_DATES_AND_URL_PARTS = new Set(['2026-07-30', '2026-05-11', '2026-05-25', '2026', '07', '30']);

/**
 * Number tokens: start with a digit, not glued to a preceding letter, digit,
 * underscore, dot or hyphen (so sha256, x86_64, arm64, MPL-2.0, multi-client-2 are
 * identifiers, not claims). Keeps dotted/hyphenated runs whole
 * (9.95, 2026-10-11) and hex fingerprints whole (72d57592).
 */
function numberTokens(text: string): string[] {
  const re = /(?<![A-Za-z0-9_.\-])\d[0-9A-Za-z]*(?:[.\-]\d[0-9A-Za-z]*)*/g;
  return text.match(re) ?? [];
}

/** Page source → the copy we pin: drop scripts, styles, comments, imports and
 *  class/style attributes (Tailwind tokens are styling, not claims). */
function astroCopy(src: string): string {
  let s = src.replace(/<script\b[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/^\s*import\s.*$/gm, ' ');
  s = s.replace(/\s(class|style)=("[^"]*"|'[^']*')/g, ' ');
  s = s.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
  s = s.replace(/&amp;/g, '&');
  return s;
}

function hrefs(src: string): string[] {
  return [...src.matchAll(/href=(?:"([^"]*)"|'([^']*)')/g)].map((m) => (m[1] ?? m[2]).replace(/&amp;/g, '&'));
}

const ALLOWED = () => new Set([...transcriptAllowlist(), ...SOURCE_DATES_AND_URL_PARTS]);

describe('perclient_1110 fixture', () => {
  it('parses the transcript digit allowlist', () => {
    const a = transcriptAllowlist();
    for (const n of ['2', '10', '50', '9.95', '0.97', '72d57592', '169062a9', '2026-10-11']) {
      expect(a.has(n), n).toBe(true);
    }
  });
});

describe('use-case page: one private bundle per client', () => {
  const src = read(PAGE);

  it('page source exists', () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it('uses the public AppShell (indexable, no gate)', () => {
    expect(src).toMatch(/<AppShell[^>]*mode="public"/);
    expect(src).toMatch(/<AppShell[^>]*title="[^"]+"/);
    expect(src).toMatch(/<AppShell[^>]*description="[^"]+"/);
  });

  it('every /signin or /api/checkout link carries the uc-per-client utm set', () => {
    const links = hrefs(src).filter((h) => h.startsWith('/signin') || h.includes('/api/checkout'));
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const h of links) {
      const q = new URL(h, 'https://app.loopskill.io').searchParams;
      expect(q.get('utm_source'), h).toBe('usecase');
      expect(q.get('utm_medium'), h).toBe('page');
      expect(q.get('utm_campaign'), h).toBe('uc-per-client');
    }
    const nexts = links.map((h) => new URL(h, 'https://app.loopskill.io').searchParams.get('next'));
    expect(nexts).toContain('/library');
    expect(nexts).toContain('/api/checkout/pro');
  });

  it('claim pinning: every number in the copy is in the transcript allowlist', () => {
    expect(src.length).toBeGreaterThan(0);
    const allowed = ALLOWED();
    const offenders = numberTokens(astroCopy(src)).filter((t) => !allowed.has(t.replace(/\.$/, '')));
    expect(offenders).toEqual([]);
  });

  it('no inventory counts and no unprovable superlatives', () => {
    const copy = astroCopy(src);
    expect(copy).not.toMatch(/\d+(\.\d+)?k\+|\d{1,3},\d{3}/i);
    expect(copy).not.toMatch(/\b(best|fastest|leading|world[- ]class|revolutionary|#1|seamless(ly)?)\b/i);
  });

  it('quotes three dated sources and labels them as their reports', () => {
    for (const u of [
      'https://www.penkin.me/ai/development/tools/dotfiles/2026/07/30/syncing-claude-skills-across-machines.html',
      'https://prokopov.me/posts/skillsync-reusing-ai-agent-skills/',
      'https://www.mindstudio.ai/blog/modular-skill-system-claude-code-multi-client-2',
    ]) {
      expect(hrefs(src)).toContain(u);
    }
    for (const d of ['2026-07-30', '2026-05-11', '2026-05-25']) expect(src).toContain(d);
    expect((src.match(/<blockquote/g) ?? []).length).toBe(3);
    expect(src).toMatch(/what they report/i);
    expect(src).toMatch(/what we reproduced/i);
  });

  it('who-this-is-for names the free alternatives plainly', () => {
    expect(src).toMatch(/public bundle/i);
    expect(src).toMatch(/self-host/i);
    expect(src).toMatch(/MPL-2\.0/);
    expect(src).toMatch(/dotfiles/i);
    expect(src).toMatch(/chezmoi/);
  });

  it('agent instruction uses only transcript-proven commands and forbids self-registration', () => {
    const block = src.match(/<pre[^>]*data-agent-prompt[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? '';
    expect(block.length).toBeGreaterThan(0);
    for (const needle of [
      'https://app.loopskill.io/api/mcp/http/',
      'x-api-key',
      'loopskill_compose_bundle_from_links',
      '/api/bundles/&lt;id&gt;/skills',
      'loopskill_bundle_install',
      'bundle_id',
      'sha256',
      'lockfile',
      'loopskill_sync',
    ]) {
      expect(block, needle).toContain(needle);
    }
    expect(block).toMatch(/do not register/i);
    expect(src).toMatch(/can never be upgraded/i);
  });

  it('shows the measured cap message with the tier rendered as free', () => {
    expect(src).toContain(
      "private bundle limit reached for tier 'free' (2/2). Publishing a bundle frees its slot (public bundles are unlimited); or upgrade to compose more.",
    );
    expect(src).not.toMatch(/'None'/);
    expect(src).toMatch(/Liked/);
    expect(src).toContain('Pro $9.95/mo: 50 private bundles, 10 API keys');
    expect(src).toContain('One client bundle is enough (your Liked list takes the other Free slot), and you only put catalog skills in it? Stay on Free.');
  });

  it('beacon: plain inline script, sendBeacon to /api/pv inside try/catch, no imports', () => {
    const scripts = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    const beacon = scripts.find((m) => m[2].includes('sendBeacon'));
    expect(beacon, 'no beacon script').toBeDefined();
    const [, attrs, body] = beacon as RegExpMatchArray;
    expect(attrs).toMatch(/is:inline/);
    expect(attrs).not.toMatch(/define:vars/);
    expect(body).not.toMatch(/^\s*import\s/m);
    expect(body).toMatch(/try\s*\{[\s\S]*navigator\.sendBeacon\(\s*'\/api\/pv'[\s\S]*\}\s*catch/);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'document.referrer', 'location.pathname']) {
      expect(body, k).toContain(k);
    }
  });
});

describe('M3.4 discovery surfaces', () => {
  it('sitemap.xml lists the page', () => {
    expect(read(join(ROOT, 'src/pages/sitemap.xml.ts'))).toContain(PAGE_PATH);
  });
  it('llms.txt lists the page', () => {
    expect(read(join(ROOT, 'src/pages/llms.txt.ts'))).toContain(PAGE_PATH);
  });
  it('the page is NOT in the global nav', () => {
    expect(read(join(ROOT, 'src/layouts/AppShell.astro'))).not.toContain('use-cases');
    expect(read(join(ROOT, 'src/components/Footer.astro'))).not.toContain('use-cases');
  });
});

describe('M4.1 blog post', () => {
  const md = read(POST);
  const body = md.replace(/^---[\s\S]*?\n---\n/, '');

  it('post exists with the collection frontmatter shape', () => {
    expect(existsSync(POST)).toBe(true);
    expect(md).toMatch(/^---\ntitle: '[^']+'\ndescription: '[^']+'\npubDate: 2026-10-11\n/);
  });

  it('links to the use-case page, and every LoopSkill link carries utm_medium=blog', () => {
    const links = [...body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    const ours = links.filter((l) => l.startsWith('/') || l.startsWith('https://app.loopskill.io'));
    expect(ours.some((l) => l.includes(PAGE_PATH))).toBe(true);
    for (const l of ours) {
      const q = new URL(l, 'https://app.loopskill.io').searchParams;
      expect(q.get('utm_source'), l).toBe('blog');
      expect(q.get('utm_medium'), l).toBe('blog');
      expect(q.get('utm_campaign'), l).toBe('uc-per-client');
    }
  });

  it('claim pinning: every number in the post is in the transcript allowlist', () => {
    expect(md.length).toBeGreaterThan(0);
    const allowed = ALLOWED();
    const offenders = numberTokens(md).filter((t) => !allowed.has(t.replace(/\.$/, '')));
    expect(offenders).toEqual([]);
  });
});
