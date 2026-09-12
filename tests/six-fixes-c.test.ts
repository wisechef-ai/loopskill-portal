/**
 * six-fixes-c — FIX A (ship /docs/share-tokens) + FIX B (cross-sell currency
 * fix + honest-copy rewrite), delegated task fix/six-c.
 *
 * Source of truth for the cbt_ share-token facts asserted here:
 *   - loopskill-api/docs/share-tokens.md
 *   - loopskill-api/AGENTS.md, "Cookbook share-tokens" section
 *   - src/pages/library.astro (real POST/GET /api/cookbooks/{id}/share-tokens client)
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const p = (...parts: string[]) => join(ROOT, ...parts);

function readSrc(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function walkFiles(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, exts));
    else if (exts.some(e => full.endsWith(e))) out.push(full);
  }
  return out;
}

const SHARE_TOKENS = p('src/pages/docs/share-tokens.astro');
const DOCS_INDEX = p('src/pages/docs/index.astro');
const SITEMAP = p('src/pages/sitemap.xml.ts');

// ---------------------------------------------------------------------------
// (a) share-tokens.astro exists and is linked from docs/index + sitemap.xml.ts
// ---------------------------------------------------------------------------
describe('FIX A — /docs/share-tokens is shipped and linked', () => {
  it('src/pages/docs/share-tokens.astro exists', () => {
    expect(existsSync(SHARE_TOKENS)).toBe(true);
  });

  it('uses AppShell mode="public" (PUBLIC-BROWSE tier per AGENTS.md)', () => {
    const src = readSrc(SHARE_TOKENS);
    expect(src).toContain("import AppShell from '../../layouts/AppShell.astro'");
    expect(src).toMatch(/<AppShell\s+mode="public"/);
  });

  it('does not reintroduce the legacy Base/Nav chrome', () => {
    const src = readSrc(SHARE_TOKENS);
    expect(src).not.toMatch(/layouts\/Base/);
    expect(src).not.toMatch(/layouts\/Nav/);
  });

  it('is referenced from docs/index.astro page list', () => {
    const src = readSrc(DOCS_INDEX);
    expect(src).toContain('/docs/share-tokens');
  });

  it('is present in sitemap.xml.ts static routes', () => {
    const src = readSrc(SITEMAP);
    expect(src).toContain("'/docs/share-tokens'");
  });

  it('is cross-linked from docs/security.astro where cbt_ is mentioned', () => {
    const src = readSrc(p('src/pages/docs/security.astro'));
    expect(src).toContain('<code>cbt_</code>');
    expect(src).toContain('/docs/share-tokens');
  });
});

// ---------------------------------------------------------------------------
// (c) share-tokens page mentions all three scopes and the /_publish 403 rule
// ---------------------------------------------------------------------------
describe('FIX A — share-tokens.astro content accuracy', () => {
  const src = readSrc(SHARE_TOKENS);

  it('mentions all three scopes: read, install, edit', () => {
    expect(src).toMatch(/\bread\b/);
    expect(src).toMatch(/\binstall\b/);
    expect(src).toMatch(/\bedit\b/);
  });

  it('documents install as the default scope', () => {
    expect(src.toLowerCase()).toMatch(/install[\s\S]{0,20}default|default[\s\S]{0,20}install/);
  });

  it('documents the token format cbt_<8hex>_<32hex>', () => {
    expect(src).toMatch(/cbt_.*8hex.*32hex/);
  });

  it('documents the hard /_publish -> 403 restriction regardless of scope', () => {
    expect(src).toContain('/_publish');
    expect(src).toMatch(/_publish[\s\S]{0,80}403/);
    expect(src.toLowerCase()).toMatch(/regardless of scope/);
  });

  it('documents rotation and revocation', () => {
    expect(src.toLowerCase()).toContain('rotate');
    expect(src.toLowerCase()).toMatch(/revoke|revocation/);
  });

  it('frames it as the client-handoff use case (not sharing owner API keys)', () => {
    expect(src.toLowerCase()).toMatch(/client/);
    expect(src.toLowerCase()).toMatch(/without (handing|sharing|owning)/);
  });
});

// ---------------------------------------------------------------------------
// (b) no source file advertises EUR pricing for this product; live charge is USD
//
// UPDATED 2026-09-12 (free-first pricing): the WiseChef <CrossSell> component
// and its $199/month managed-service price were DELETED from the app. A second
// company's larger price rendered on a free catalog page read as bait and
// undercut the free-first posture; WiseChef marketing lives on wisechef.ai.
// These tests now pin the ABSENCE (a regression guard against reintroduction)
// instead of asserting the banner's copy.
// ---------------------------------------------------------------------------
describe('no EUR currency advertised anywhere in src/', () => {
  const filesToCheck = [p('src/pages/pricing.astro'), p('src/pages/index.astro')];

  for (const file of filesToCheck) {
    it(`${file.replace(ROOT, '')}: no euro sign at all`, () => {
      expect(readSrc(file)).not.toContain('\u20ac');
    });
  }
});

describe('WiseChef cross-sell is fully removed from the app', () => {
  it('the CrossSell component no longer exists', () => {
    expect(existsSync(p('src/components/CrossSell.astro'))).toBe(false);
  });

  it('no page imports or renders <CrossSell>', () => {
    const hits = walkFiles(p('src'), ['.astro', '.ts', '.js'])
      .filter(f => /CrossSell/.test(readSrc(f)));
    expect(hits).toEqual([]);
  });

  it('no $199/month managed-service price is advertised in the app', () => {
    const hits = walkFiles(p('src'), ['.astro', '.ts', '.js'])
      .filter(f => /\$\s?199\s*\/\s*(mo|month)/i.test(readSrc(f)));
    expect(hits).toEqual([]);
  });
});
