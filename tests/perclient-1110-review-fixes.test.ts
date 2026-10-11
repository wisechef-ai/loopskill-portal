/**
 * perclient_1110 M3.5 — fixes for the adversarial review of PR #124.
 *
 *   A. /signin forwards utm_* that arrive nested inside `next=` (AppShell's
 *      public sign-in CTAs put the landing page's query inside `next`). The
 *      outer value wins; the same shape filter applies. Executed in jsdom
 *      against the real inline script, not grepped.
 *   B. Rendered attribution (needs `npm run build`): every /signin or
 *      /api/checkout link in the built use-case page reaches the OAuth links
 *      with utm_campaign=uc-per-client, either directly or via `next`.
 *   C. Measurements are bound to their claims: swapping two numbers fails.
 *   D. Copy fixes: create-once / install-everywhere agent prompt, no
 *      "signed tarballs", a scoped stay-on-Free line that names the
 *      tombstoned Pro-only endpoints as no reason to buy, and Step 1 points
 *      at the right pages for keys.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const PAGE = join(ROOT, 'src/pages/use-cases/one-private-bundle-per-client.astro');
const POST = join(ROOT, 'src/content/blog/one-private-bundle-per-client.md');
const SIGNIN_SRC = join(ROOT, 'src/pages/signin.astro');
const DIST_PAGE = join(ROOT, 'dist/use-cases/one-private-bundle-per-client/index.html');
const DIST_SIGNIN = join(ROOT, 'dist/signin/index.html');
const ORIGIN = 'https://app.loopskill.io';

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf-8') : '');

// ── A. signin script, executed ──────────────────────────────────────────
function signinScript(html: string): string {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const s = scripts.find((b) => b.includes('google-login') && b.includes('utm_source'));
  if (!s) throw new Error('signin inline script not found');
  return s;
}

/** Load /signin at `url`, run its inline script, return the provider hrefs. */
function runSignin(script: string, url: string): { google: URL; github: URL } {
  const dom = new JSDOM(
    `<!doctype html><body>
      <a id="google-login" href="/api/auth/google/login"></a>
      <a id="github-login" href="/api/auth/github/login"></a>
      <a id="signup-link" href="/signin?mode=signup"></a>
      <p id="ref-badge" class="hidden"><code id="ref-badge-code"></code></p>
    </body>`,
    { url, runScripts: 'outside-only' },
  );
  // Anonymous visitor: /api/auth/me is not ok, so the page stays on the form.
  (dom.window as any).fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  dom.window.eval(script);
  const href = (id: string) => new URL((dom.window.document.getElementById(id) as HTMLAnchorElement).href);
  return { google: href('google-login'), github: href('github-login') };
}

const LANDING_QS = 'utm_source=blog&utm_medium=blog&utm_campaign=uc-per-client';
const signinWithNext = (next: string, outer = '') =>
  `${ORIGIN}/signin?next=${encodeURIComponent(next)}${outer ? '&' + outer : ''}`;

describe('A. /signin forwards utm_* nested inside next=', () => {
  const script = signinScript(read(SIGNIN_SRC));

  it('reads utm_* from the next param when the outer keys are absent', () => {
    const { google, github } = runSignin(
      script,
      signinWithNext(`/use-cases/one-private-bundle-per-client/?${LANDING_QS}`),
    );
    for (const u of [google, github]) {
      expect(u.searchParams.get('utm_source'), u.href).toBe('blog');
      expect(u.searchParams.get('utm_medium'), u.href).toBe('blog');
      expect(u.searchParams.get('utm_campaign'), u.href).toBe('uc-per-client');
      expect(u.searchParams.get('next'), u.href).toBe(`/use-cases/one-private-bundle-per-client/?${LANDING_QS}`);
    }
  });

  it('the outer utm value wins over the nested one', () => {
    const { google } = runSignin(
      script,
      signinWithNext('/x?utm_campaign=inner&utm_source=inner', 'utm_campaign=outer'),
    );
    expect(google.searchParams.getAll('utm_campaign')).toEqual(['outer']);
    expect(google.searchParams.get('utm_source')).toBe('inner');
  });

  it('applies the same shape filter to nested values', () => {
    const { google } = runSignin(script, signinWithNext('/x?utm_campaign=%3Cscript%3E&utm_source=ok'));
    expect(google.searchParams.get('utm_campaign')).toBeNull();
    expect(google.searchParams.get('utm_source')).toBe('ok');
  });

  it('ignores the query of an unsafe (protocol-relative) next', () => {
    const { google } = runSignin(script, signinWithNext('//evil.example/?utm_campaign=x'));
    expect(google.searchParams.get('utm_campaign')).toBeNull();
  });

  it('a plain top-level utm still forwards (pricing0928 behaviour kept)', () => {
    const { google } = runSignin(script, `${ORIGIN}/signin?next=/library&utm_campaign=hint-demo`);
    expect(google.searchParams.get('utm_campaign')).toBe('hint-demo');
  });
});

// ── B. rendered attribution on the built page ───────────────────────────
const built = existsSync(DIST_PAGE) && existsSync(DIST_SIGNIN);
// AppShell's public-mode rewrite of [data-signin-next] CTAs, as it appears in
// the built page. Pinned verbatim so the simulation below cannot drift from it.
const SHELL_REWRITE = 'signin?next=${encodeURIComponent(window.location.pathname+window.location.search)}';

(built ? describe : describe.skip)('B. built use-case page: every sign-in/checkout link keeps uc-per-client', () => {
  const html = read(DIST_PAGE);
  const script = signinScript(read(DIST_SIGNIN));
  const doc = new JSDOM(html).window.document;
  const anchors = [...doc.querySelectorAll('a[href]')].filter((a) => {
    const h = a.getAttribute('href') ?? '';
    return h.startsWith('/signin') || h.includes('/api/checkout');
  });
  // A visitor who arrived from the blog post's campaign link.
  const landing = new URL(`${ORIGIN}/use-cases/one-private-bundle-per-client/?${LANDING_QS}`);

  it('the built page carries the AppShell next= rewrite this test simulates', () => {
    expect(html).toContain(SHELL_REWRITE);
  });

  it('finds the shell CTAs and the page CTAs', () => {
    expect(anchors.filter((a) => a.hasAttribute('data-signin-next')).length).toBeGreaterThanOrEqual(1);
    expect(anchors.filter((a) => !a.hasAttribute('data-signin-next')).length).toBeGreaterThanOrEqual(2);
  });

  it('every link reaches the OAuth links with utm_campaign=uc-per-client', () => {
    const failures: string[] = [];
    for (const a of anchors) {
      const effective = a.hasAttribute('data-signin-next')
        ? `/signin?next=${encodeURIComponent(landing.pathname + landing.search)}`
        : (a.getAttribute('href') as string);
      if (!effective.startsWith('/signin')) {
        if (new URL(effective, ORIGIN).searchParams.get('utm_campaign') !== 'uc-per-client') failures.push(effective);
        continue;
      }
      const { google, github } = runSignin(script, ORIGIN + effective);
      for (const u of [google, github]) {
        if (u.searchParams.get('utm_campaign') !== 'uc-per-client') failures.push(`${effective} -> ${u.href}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("the page's own CTAs carry the campaign even for a visitor who arrived without utm", () => {
    for (const a of anchors.filter((x) => !x.hasAttribute('data-signin-next'))) {
      const q = new URL(a.getAttribute('href') as string, ORIGIN).searchParams;
      expect(q.get('utm_campaign'), a.getAttribute('href') ?? '').toBe('uc-per-client');
    }
  });
});

// ── C. measurements bound to their claims ───────────────────────────────
function pageItems(src: string): string[] {
  return [...src.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' '));
}
function postItems(md: string): string[] {
  return md.split('\n').filter((l) => l.trim());
}
const once = (text: string, needle: string) => text.split(needle).length - 1;

/** Each number must sit next to the claim it measures, exactly once. */
function bindingViolations(items: string[], bindings: Array<[string, RegExp]>): string[] {
  const all = items.join('\n');
  const out: string[] = [];
  for (const [num, claim] of bindings) {
    const n = once(all, num);
    if (n !== 1) out.push(`${num} appears ${n} times`);
    const home = items.find((i) => i.includes(num)) ?? '';
    if (!claim.test(home)) out.push(`${num} not bound to ${claim}`);
  }
  return out;
}

const PAGE_BINDINGS: Array<[string, RegExp]> = [
  ['1.28', /One bundle, installed on both\. A client bundle with 3 skills: 1\.28 s on A, 1\.33 s on B\./],
  ['1.33', /3 skills: 1\.28 s on A, 1\.33 s on B\./],
  ['72d57592', /installed on both[\s\S]*fingerprint[\s\S]*72d57592… on both machines: identical/],
  ['0.97', /re-ran the install on B: 3 kept, 1 added, 0\.97 s/],
  ['169062a9', /added a skill to the bundle from A[\s\S]*re-ran the install[\s\S]*169062a9… on both: identical again/],
  ['6 of 6', /same key ran on A and B at the same time: 6 of 6 concurrent calls OK/],
];
const POST_BINDINGS: Array<[string, RegExp]> = [
  ['1.28', /3 skills installed in 1\.28 s on one machine and 1\.33 s on the other/],
  ['1.33', /1\.28 s on one machine and 1\.33 s on the other/],
  ['72d57592', /installed in[\s\S]*fingerprint was `72d57592…` on both: identical/],
  ['0.97', /re-ran the install on the second: 3 kept, 1 added, 0\.97 s/],
  ['169062a9', /added a skill[\s\S]*re-ran the install[\s\S]*`169062a9…` on both/],
  ['6 of 6', /same API key ran on both machines at the same time \(6 of 6 concurrent calls OK\)/],
];

describe('C. each measured number sits next to the claim it measures', () => {
  const src = read(PAGE);
  const md = read(POST);

  it('page bindings hold', () => {
    expect(bindingViolations(pageItems(src), PAGE_BINDINGS)).toEqual([]);
  });

  it('blog bindings hold', () => {
    expect(bindingViolations(postItems(md), POST_BINDINGS)).toEqual([]);
  });

  it('the guard catches a swap of the update timing with an install timing (mutation)', () => {
    const swapped = src.replace('0.97 s', 'TMP').replace('1.33 s', '0.97 s').replace('TMP', '1.33 s');
    expect(swapped).not.toBe(src);
    expect(bindingViolations(pageItems(swapped), PAGE_BINDINGS).length).toBeGreaterThan(0);
    const mdSwapped = md.replace('`72d57592…`', 'TMP').replace('`169062a9…`', '`72d57592…`').replace('TMP', '`169062a9…`');
    expect(bindingViolations(postItems(mdSwapped), POST_BINDINGS).length).toBeGreaterThan(0);
  });
});

// ── D. copy fixes ───────────────────────────────────────────────────────
describe('D. review copy fixes', () => {
  const src = read(PAGE);
  const md = read(POST);
  const block = src.match(/<pre[^>]*data-agent-prompt[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? '';
  const lines = block.split('\n');

  it('the agent prompt creates the bundle once and installs it on every machine', () => {
    expect(once(block, 'loopskill_compose_bundle_from_links')).toBe(2); // the call, and the "never again" warning
    const create = lines.find((l) => l.includes('loopskill_compose_bundle_from_links')) ?? '';
    expect(create).toMatch(/^1\. Once, on the first machine only:/);
    expect(create).toMatch(/note the bundle id/i);
    expect(create).toMatch(/Never call loopskill_compose_bundle_from_links again/);
    const install = lines.find((l) => l.includes('loopskill_bundle_install')) ?? '';
    expect(install).toMatch(/^2\. On every machine, including the first:/);
    expect(install).toContain('&#123;"bundle_id": "&lt;id&gt;"&#125;');
    for (const n of ['sha256', 'lockfile', 'unpack']) expect(install).toContain(n);
    expect(block).toMatch(/^3\. To update a machine after the bundle changes, run step 2 again on that machine\./m);
    const add = lines.find((l) => l.includes('/api/bundles/&lt;id&gt;/skills')) ?? '';
    expect(add).toMatch(/^4\. To add a skill:/);
    expect(add).toMatch(/then run step 2 again on each machine/);
    expect(block).not.toMatch(/one private LoopSkill bundle per client on this machine/);
  });

  it('the blog states the create-once / install-everywhere shape', () => {
    expect(md).toMatch(/create the bundle once/i);
    expect(md).toMatch(/install it on every machine/i);
  });

  it('no "signed tarballs" claim; tarballs come through signed URLs and are checked by sha256', () => {
    for (const t of [src, md]) {
      expect(t).not.toMatch(/signed\s+tarballs?/i);
      expect(t).toMatch(/tarballs downloaded through signed URLs, each checked by its sha256/);
    }
  });

  it('the stay-on-Free line is scoped, and the tombstoned Pro-only endpoints are a reason not to buy', () => {
    const scoped =
      'Only putting catalog skills in bundles and re-running the install to update? Stay on Free.';
    for (const t of [src, md]) {
      expect(t).not.toContain('Not hitting the cap? Stay on Free.');
      expect(t).toContain(scoped);
      // Those endpoints are tombstoned (loopskill-api docs/ops/tombstones.md):
      // name them honestly as a reason NOT to buy, never as a Pro benefit.
      expect(t).toContain(
        "A few little-used hosted authoring endpoints (skill forks, draft-to-skill, sync streaming) also require Pro; don't buy it for those, they may be retired.",
      );
      expect(t).not.toMatch(/Pro also unlocks|unlocks the hosted authoring tools/i);
      expect(t).not.toMatch(/\b(fork\w*|tailor\w*|draft into a skill|live sync)\b[^.\n]{0,60}\b(with|on|in) Pro\b/i);
      // audit-claims rule `bundle-deployment` marks bundle deploys as not shipped.
      expect(t).not.toMatch(/\bdeploy\w*\b[^.\n]{0,30}?\bbundles?\b|\bbundles?\b[^.\n]{0,30}?\bdeploy\w*\b/i);
    }
  });

  it('Step 1 points at the Library reveal and the Account page for keys', () => {
    const step1 = src.match(/Step 1 — you, in a browser<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(step1).not.toMatch(/create an API key on your Library/i);
    expect(step1).toMatch(/Library shows the API key we generated when you signed up/);
    expect(step1).toMatch(/Account page/);
    expect(md).not.toMatch(/create an API key on your Library/i);
    expect(md).toMatch(/Library shows the API key we generated when you signed up/);
    expect(md).toMatch(/Account page/);
  });
});
