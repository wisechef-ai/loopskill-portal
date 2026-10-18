/**
 * qa1018 W1 — launch-QA fixes for the chrome, home, sign-in and trust pages.
 *
 * Five persona users (impatient, skeptic, mobile, non-native, breaker) ran
 * loopskill.io on 2026-10-18; ranked clusters live in
 * ~/.hermes/qa/loopskill-launch-1018/ranked.json. Each block below pins one
 * cluster so the finding cannot quietly come back. Presence pins assert the
 * fixed copy; absence pins assert the exact phrase a persona quoted is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { META_INSTALL_PHRASE } from '../src/lib/agentInstall';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf-8');
const readIf = (...p: string[]) => (existsSync(join(ROOT, ...p)) ? read(...p) : '');
/** Drop comments so a rationale comment can never satisfy (or trip) a copy pin. */
const strip = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');

const INDEX = read('src', 'pages', 'index.astro');
const WIDGET = read('src', 'components', 'InstallWidget.astro');
const GS = read('src', 'pages', 'docs', 'getting-started.astro');
const SHELL = read('src', 'layouts', 'AppShell.astro');
const FOOTER = read('src', 'components', 'Footer.astro');
const AUTH = read('src', 'components', 'AuthPanel.astro');
const SIGNIN = read('src', 'pages', 'signin.astro');
const SIGNUP = read('src', 'pages', 'signup.astro');
const TERMS = read('src', 'pages', 'terms.astro');
const PRIVACY = read('src', 'pages', 'privacy.astro');
const SECURITY = read('src', 'pages', 'security.astro');
const PRICING = read('src', 'pages', 'pricing.astro');
const SCOPE = read('src', 'pages', 'docs', 'scope.astro');
const BANNER = read('src', 'components', 'FoundingBanner.astro');

describe('C01 — the key statement on home is the true one', () => {
  it('no longer says "no key to paste"', () => {
    expect(INDEX).not.toMatch(/no key to paste/i);
  });
  it('says free skills need no key, and what a free key is for', () => {
    const t = strip(INDEX).replace(/\s+/g, ' ');
    expect(t).toContain('Free skills install with no account and no key.');
    expect(t).toMatch(/free API key only for the MCP tools, saving to your Library, private bundles and fleets/);
  });
  it('getting-started no longer lists an API key as a prerequisite for everything', () => {
    expect(GS).not.toMatch(/<li>A LoopSkill API key —/);
    expect(GS).toMatch(/For free skills: nothing else\./);
  });
});

describe('C04 — one install phrase, shown == copied', () => {
  it('the canonical phrase is the full-https, no-"please" one', () => {
    expect(META_INSTALL_PHRASE).toBe('Install the loopskill skill from https://app.loopskill.io/skill');
  });
  for (const [name, src] of [['index.astro', INDEX], ['InstallWidget.astro', WIDGET], ['getting-started.astro', GS]] as const) {
    it(`${name} imports META_INSTALL_PHRASE instead of a private copy`, () => {
      expect(src).toContain("import { META_INSTALL_PHRASE } from");
      expect(strip(src)).not.toMatch(/Install the loopskill skill from app\.loopskill\.io/);
      expect(src).not.toMatch(/skill please/);
    });
  }
  it('every copy button on home/getting-started copies the same constant it renders', () => {
    for (const src of [INDEX, GS]) {
      expect(src).toContain('data-copy={META_INSTALL_PHRASE}');
      expect(src).toContain('data-phrase>{META_INSTALL_PHRASE}</code>');
    }
    expect(WIDGET).toContain('const installPhrase = META_INSTALL_PHRASE;');
  });
});

describe('C10 — hero leads to a skill; plain words; says where to paste', () => {
  const t = strip(INDEX);
  it('primary CTA is a real search that lands on /browse?q=', () => {
    expect(INDEX).toMatch(/<form action="\/browse" method="get" role="search"/);
    expect(INDEX).toMatch(/name="q"/);
    expect(t).toContain('Find a skill');
    expect(t).not.toContain('Start Day 1');
  });
  it('drops the critical-path jargon the non-native persona quoted', () => {
    for (const phrase of ['supply chain', "station you're standing on", 'click a station', 'Prove every agent converged', 'agents enrol themselves']) {
      expect(t, phrase).not.toContain(phrase);
    }
  });
  it('says WHERE to paste the phrase', () => {
    expect(t).toContain("Paste this into your agent's chat (Claude Code, Codex, Cursor…) and press Enter");
  });
  it('the "Getting the CLI" link goes straight to a real install command (no redirect stub)', () => {
    expect(INDEX).not.toContain('href="/docs/quickstart"');
    expect(INDEX).toContain('href="/docs/getting-started#cli"');
    expect(GS).toContain('id="cli"');
    expect(GS).toContain('pip install loopskill');
  });
});

describe('C12 / C16 — one labelled number per concept; no over-claimed signatures', () => {
  const t = strip(INDEX);
  it('never calls the curated catalog "signed" or "audited" as a blanket claim', () => {
    expect(t).not.toMatch(/versioned \+ signed/);
    expect(t).not.toMatch(/Curated & signed/);
    expect(t).not.toMatch(/every entry is audited and signed/i);
    expect(t).not.toMatch(/A small signed core/);
  });
  it('labels the federated count as not vetted', () => {
    expect(INDEX).toContain("'skills indexed across federated registries — linked as-is, not vetted by us'");
  });
  it('the bottom stats strip that repeated both counts under other labels is gone', () => {
    expect(INDEX).not.toContain('id="stats-strip"');
  });
  it('popular-skill tiles label the number as installs and do not invent "general"', () => {
    expect(INDEX).toMatch(/install\$\{s\.install_count_total === 1 \? '' : 's'\}/);
    expect(INDEX).not.toContain("{s.category || 'general'}");
  });
  it('InstallWidget no longer repeats a federated number in its demo', () => {
    expect(strip(WIDGET)).not.toMatch(/\{federatedCount\} skills/);
  });
});

describe('C13 — signed-in chrome is not in the anonymous DOM', () => {
  it('AppShell wraps every member-only node in MemberOnly (inert <template> in public mode)', () => {
    expect(SHELL).toContain("import MemberOnly from '../components/MemberOnly.astro';");
    expect((SHELL.match(/<MemberOnly defer=\{isPublic\}>/g) || []).length).toBe(4);
    expect(read('src', 'components', 'MemberOnly.astro')).toContain('<template data-shell-member-tpl><slot /></template>');
  });
  it('the hydration script stamps templates only after /api/auth/me returns a user', () => {
    const i = SHELL.indexOf("t.replaceWith(t.content.cloneNode(true))");
    expect(i).toBeGreaterThan(SHELL.indexOf('if (!user) {'));
  });
  const dist = readIf('dist', 'index.html');
  (dist ? it : it.skip)('built home: no Sign out / member Library / Account outside a template', () => {
    const outside = dist.replace(/<template data-shell-member-tpl>[\s\S]*?<\/template>/g, '');
    expect(outside).not.toMatch(/>\s*Sign out\s*</);
    expect(outside).not.toMatch(/<[^>]+id="rail-signout(-mobile)?"/);
    expect(outside).not.toMatch(/<a href="\/library"[^>]*data-shell-member/);
    expect(outside).not.toMatch(/<a href="\/account"/);
  });
});

describe('C08 — sign-in: neutral copy, real sign-up, legal links, readable errors', () => {
  it('no "Welcome back" for a visitor who may be new', () => {
    expect(strip(AUTH + SIGNIN + SIGNUP)).not.toContain('Welcome back');
    expect(AUTH).toContain('Sign in or create an account');
    expect(AUTH).toContain('Create your free account');
  });
  it('links Terms and Privacy right under the OAuth buttons', () => {
    expect(AUTH).toMatch(/data-auth-legal[\s\S]{0,200}href="\/terms"[\s\S]{0,300}href="\/privacy"/);
  });
  it('/signup renders the sign-up card directly — no redirect hop', () => {
    expect(SIGNUP).not.toContain('http-equiv="refresh"');
    expect(SIGNUP).not.toContain('location.replace');
    expect(SIGNUP).toContain('<AuthPanel initialMode="signup" />');
  });
  it('OAuth buttons are at least 44px tall', () => {
    expect((AUTH.match(/auth-btn[^"]*min-h-\[48px\]/g) || []).length).toBe(2);
  });

  function run(url: string) {
    const html = AUTH.replace(/^---[\s\S]*?---/, '')
      .replace(/hidden=\{isSignup\}/g, '')
      .replace(/hidden=\{!isSignup\}/g, 'hidden');
    const markup = html.replace(/<script[\s\S]*<\/script>/, '');
    const script = (html.match(/<script is:inline>([\s\S]*?)<\/script>/) || [])[1] || '';
    const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { url, runScripts: 'outside-only' });
    (dom.window as any).fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    dom.window.eval(script);
    return dom.window.document;
  }
  it('?auth=error&reason=state_mismatch shows a readable banner with the code', () => {
    const doc = run('https://app.loopskill.io/signin?auth=error&reason=state_mismatch');
    const box = doc.getElementById('auth-error')!;
    expect(box.hidden).toBe(false);
    expect(doc.getElementById('auth-error-text')!.textContent).toMatch(/session expired/);
    expect(doc.getElementById('auth-error-code')!.textContent).toBe('state_mismatch');
  });
  it('a hostile reason is never rendered as markup', () => {
    const doc = run('https://app.loopskill.io/signin?auth=error&reason=%3Cimg%20src%3Dx%3E');
    expect(doc.getElementById('auth-error-code')!.textContent).toBe('unknown');
    expect(doc.querySelector('#auth-error img')).toBeNull();
  });
  it('?mode=signup switches the static sign-in card to the sign-up copy', () => {
    const doc = run('https://app.loopskill.io/signin?mode=signup');
    const visible = [...doc.querySelectorAll('h1 span')].filter((e) => !(e as HTMLElement).hidden).map((e) => e.textContent);
    expect(visible).toEqual(['Create your free account']);
  });
  it('without an error the banner stays hidden', () => {
    expect(run('https://app.loopskill.io/signin').getElementById('auth-error')!.hidden).toBe(true);
  });
});

describe('C14 — Terms page + who runs this', () => {
  it('restates the commitments, dated, with the product contact', () => {
    expect(TERMS).toContain("const lastUpdated = '2026-10-18';");
    expect(TERMS).toContain('Mozilla Public License 2.0 (MPL-2.0)');
    expect(TERMS).toMatch(/as-is, without warranty/);
    expect(TERMS).toContain('hello@loopskill.io');
    expect(TERMS).toMatch(/Do not publish malware/);
    expect(TERMS).toMatch(/Cancel anytime/);
  });
  it('Founding Member wording is the same sentence /pricing uses', () => {
    const s = 'one-time $49 payment for permanent Pro — not a subscription, never renews, never expires';
    expect(TERMS).toContain(s);
    expect(PRICING).toContain(s);
    expect(TERMS).toContain('Capped at 100 seats');
  });
  it('invents no legal-entity data', () => {
    expect(TERMS).not.toMatch(/\b(KRS|NIP|REGON|VAT ID|sp\. z o\.o\.|Ltd\.?|GmbH|Inc\.)\b/);
  });
  it('the footer links Terms + Privacy and says who runs this', () => {
    expect(FOOTER).toContain('href="/terms"');
    expect(FOOTER).toContain('href="/privacy"');
    expect(FOOTER).toContain('Who runs this');
    expect(FOOTER).toMatch(/Built by <a href="https:\/\/wisechef\.ai"[^>]*>WiseChef<\/a>, Kraków, Poland\./);
    expect(FOOTER).toContain('mailto:hello@loopskill.io');
    expect(FOOTER).not.toContain('hi@wisechef.ai');
  });
  it('pricing links Terms + Privacy', () => {
    expect(PRICING).toMatch(/data-pricing-legal[\s\S]{0,300}href="\/terms"[\s\S]{0,300}href="\/privacy"/);
  });
  it('sitemap lists /terms', () => {
    expect(read('src', 'pages', 'sitemap.xml.ts')).toContain("{ path: '/terms'");
  });
});

describe('C15 — /security and /privacy tell the same telemetry story', () => {
  it('security no longer says "No telemetry by default"', () => {
    expect(strip(SECURITY)).not.toMatch(/No telemetry by default/);
  });
  for (const [name, src] of [['security', SECURITY], ['privacy', PRIVACY]] as const) {
    it(`${name}: names install events, the opt-out heartbeat and the off switch`, () => {
      expect(src).toMatch(/install event/);
      expect(src).toMatch(/heartbeat/);
      expect(src).toContain('RECIPES_TELEMETRY=off');
      expect(src).toMatch(/IP address/);
    });
  }
  it('privacy is dated today, not the 2026-05-03 version', () => {
    expect(PRIVACY).toContain("const lastUpdated = '2026-10-18';");
  });
});

describe('C16 — /security only claims what the install response proves', () => {
  it('"Verify a skill yourself" uses the install endpoint and says the signature is not served', () => {
    expect(SECURITY).toContain('/api/skills/install?slug=super-memory');
    expect(SECURITY).not.toMatch(/includes the tarball SHA-256 and signature/);
    expect(SECURITY).toMatch(/it is not included in this response/);
  });
  it('the description no longer promises verifiable signatures on every skill', () => {
    expect(SECURITY).not.toMatch(/verifiable signatures on every skill/);
  });
});

describe('C25 — misc honesty fixes', () => {
  it('no build-date "Last audited" / "Last full audit pass" stamp', () => {
    expect(strip(FOOTER)).not.toMatch(/Last audited/);
    expect(strip(SECURITY)).not.toMatch(/Last full audit pass/);
    expect(strip(SECURITY)).not.toMatch(/new Date\(\)/);
    expect(FOOTER).toMatch(/Site built <time/);
  });
  it('pricing: no superseded "VAT MOSS", no "N of N left" counter', () => {
    expect(PRICING).not.toMatch(/VAT MOSS/);
    expect(PRICING).not.toContain('of ${data.cap} left');
    expect(BANNER).not.toMatch(/' of ' \+ cap/);
  });
  it('scope: no "flat subscription" next to a one-time Founding offer', () => {
    expect(strip(SCOPE)).not.toMatch(/flat subscription/);
    expect(SCOPE).toMatch(/one-time Founding Member payment/);
  });
});

describe('C21 / C26 — mobile chrome', () => {
  it('menu toggle is 44x44, shows open state, closes on outside tap / Escape / item tap', () => {
    expect(SHELL).toMatch(/<summary[^>]*w-11 h-11[^>]*aria-expanded="false"/);
    expect(SHELL).toContain("menu-icon-close");
    expect(SHELL).toMatch(/!menu\.contains\(e\.target as Node\)\) menu\.open = false/);
    expect(SHELL).toMatch(/e\.key === 'Escape' && menu\.open/);
    expect(SHELL).toMatch(/closest\('nav a, nav button'\)\) menu\.open = false/);
  });
  it('global CSS floors arbitrary small text at 12px on phones', () => {
    const css = read('src', 'styles', 'global.css');
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*\.text-\\\[10px\\\][\s\S]*font-size: 12px/);
  });
  it('sign-in uses the compact footer', () => {
    expect(read('src', 'layouts', 'AuthEdge.astro')).toContain('<Footer compact />');
  });
});
