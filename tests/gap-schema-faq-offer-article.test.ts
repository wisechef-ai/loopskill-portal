/**
 * gap/schema — FAQPage, Offer, and Article/BlogPosting JSON-LD tests.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * GEO audit 2026-08-20: every sampled page carried ONLY generic Organization
 * JSON-LD. Zero FAQPage anywhere sitewide, zero Offer beyond skill/loop
 * pages, zero Article/BlogPosting on blog posts — despite six independent
 * 2026 GEO sources converging on FAQPage as the single highest-leverage
 * schema type for AI-answer-engine citation.
 *
 * This suite runs against the REAL BUILT OUTPUT in dist/ (mirrors the
 * pattern in tests/mesh0408-w3-storefront-guards.test.ts: `npm run build`
 * first, then these tests parse the actual emitted <script
 * type="application/ld+json"> blocks — not the .astro source, not a
 * hand-typed expectation of what the source "should" produce).
 *
 * THE IMPORTANT ASSERTION: anti-drift. Every FAQPage test re-extracts the
 * VISIBLE <summary>/<h3> question text from the SAME rendered HTML and
 * diffs it against the JSON-LD mainEntity[].name array. A schema that says
 * something the page does not visibly ask is exactly the claim-drift class
 * this codebase already fights (scripts/audit-claims.mjs) — this test
 * extends that discipline to structured data.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const DIST = join(ROOT, 'dist');

const built = existsSync(DIST);
const describeBuilt = built ? describe : describe.skip;
if (!built) {
  // eslint-disable-next-line no-console
  console.warn('dist/ absent — skipping schema.org gates. Run `npm run build` first.');
}

/** All application/ld+json blocks on a rendered page, parsed. */
function ldJsonBlocks(relPath: string): any[] {
  const html = readFileSync(join(DIST, relPath), 'utf-8');
  const out: any[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(JSON.parse(m[1]));
  }
  return out;
}

function findByType(blocks: any[], type: string): any[] {
  return blocks.filter((b) => b['@type'] === type);
}

/** Decode the small set of HTML entities Astro emits for prose text nodes. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Visible <summary><span>question</span></summary> text from a page using
 * the shared <details class="group ..."> FAQ markup (pricing, cookbook,
 * docs/referrals). Order-preserving, matches DOM order.
 */
function visibleSummaryQuestions(relPath: string): string[] {
  const html = readFileSync(join(DIST, relPath), 'utf-8');
  const out: string[] = [];
  const re = /<summary[^>]*>\s*<span>([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(decodeEntities(m[1].replace(/\s+/g, ' ').trim()));
  }
  return out;
}

/** Visible <h3>question</h3> text (docs/publishing's h3/p FAQ shape). */
function visibleH3Questions(relPath: string, startMarker: string): string[] {
  const html = readFileSync(join(DIST, relPath), 'utf-8');
  const startIdx = html.indexOf(startMarker);
  const scope = startIdx >= 0 ? html.slice(startIdx) : html;
  const out: string[] = [];
  const re = /<h3>([\s\S]*?)<\/h3>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope))) {
    out.push(decodeEntities(m[1].replace(/\s+/g, ' ').trim()));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// /pricing — FAQPage (anti-drift) + AggregateOffer (public-ladder-only)
// ─────────────────────────────────────────────────────────────────────────

describeBuilt('/pricing — FAQPage JSON-LD', () => {
  it('has a top-level FAQPage block with mainEntity Questions/Answers', () => {
    const blocks = ldJsonBlocks('pricing/index.html');
    const faqPages = findByType(blocks, 'FAQPage');
    expect(faqPages).toHaveLength(1);
    const faq = faqPages[0];
    expect(Array.isArray(faq.mainEntity)).toBe(true);
    expect(faq.mainEntity.length).toBeGreaterThan(0);
    for (const entity of faq.mainEntity) {
      expect(entity['@type']).toBe('Question');
      expect(typeof entity.name).toBe('string');
      expect(entity.name.length).toBeGreaterThan(0);
      expect(entity.acceptedAnswer['@type']).toBe('Answer');
      expect(typeof entity.acceptedAnswer.text).toBe('string');
      expect(entity.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });

  it('ANTI-DRIFT: every FAQPage question matches a visible <summary> question, in order', () => {
    const blocks = ldJsonBlocks('pricing/index.html');
    const faq = findByType(blocks, 'FAQPage')[0];
    const schemaQuestions = faq.mainEntity.map((e: any) => e.name);
    const visible = visibleSummaryQuestions('pricing/index.html');
    expect(schemaQuestions).toEqual(visible);
  });
});

describeBuilt('/pricing — AggregateOffer JSON-LD', () => {
  it('has exactly one AggregateOffer wrapping Offer entries', () => {
    const blocks = ldJsonBlocks('pricing/index.html');
    const offers = findByType(blocks, 'AggregateOffer');
    expect(offers).toHaveLength(1);
    expect(Array.isArray(offers[0].offers)).toBe(true);
    expect(offers[0].offers.length).toBeGreaterThan(0);
    for (const o of offers[0].offers) {
      expect(o['@type']).toBe('Offer');
      expect(o.priceCurrency).toBe('USD');
    }
  });

  it('HARD CONSTRAINT: every Offer price is exactly 0 or 9.95 — never the invite-only $100 tier', () => {
    const blocks = ldJsonBlocks('pricing/index.html');
    const offer = findByType(blocks, 'AggregateOffer')[0];
    const prices = offer.offers.map((o: any) => o.price);
    for (const p of prices) {
      expect(['0', '9.95']).toContain(p);
    }
    // lowPrice/highPrice must also respect the ladder.
    expect(offer.lowPrice).toBe('0');
    expect(offer.highPrice).toBe('9.95');
  });

  it('never emits an Offer named after the on-demand/enterprise tier', () => {
    const blocks = ldJsonBlocks('pricing/index.html');
    const offer = findByType(blocks, 'AggregateOffer')[0];
    const names: string[] = offer.offers.map((o: any) => (o.name || '').toLowerCase());
    for (const n of names) {
      expect(n).not.toContain('on-demand');
      expect(n).not.toContain('enterprise');
    }
  });

  it('the rendered page HTML itself contains no $100 (or other non-ladder) monthly price', () => {
    // Belt-and-suspenders on the actual bytes, independent of the JSON-LD
    // parse above — mirrors the audit-claims `unlocked-price` discipline.
    const html = readFileSync(join(DIST, 'pricing/index.html'), 'utf-8');
    const matches = [...html.matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)\s*(?:\/\s*(?:mo|month))/gi)];
    for (const m of matches) {
      expect(['0', '0.00', '9.95']).toContain(m[1]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// /docs/referrals + /cookbook — FAQPage anti-drift on the <details> shape
// ─────────────────────────────────────────────────────────────────────────

describeBuilt('/docs/referrals — FAQPage JSON-LD, anti-drift', () => {
  it('FAQPage questions match visible <summary> questions exactly', () => {
    const blocks = ldJsonBlocks('docs/referrals/index.html');
    const faq = findByType(blocks, 'FAQPage')[0];
    expect(faq).toBeDefined();
    const schemaQuestions = faq.mainEntity.map((e: any) => e.name);
    const visible = visibleSummaryQuestions('docs/referrals/index.html');
    expect(schemaQuestions).toEqual(visible);
    expect(schemaQuestions.length).toBeGreaterThan(0);
  });
});

describeBuilt('/cookbook — FAQPage JSON-LD, anti-drift', () => {
  it('FAQPage questions match visible <summary> questions exactly', () => {
    const blocks = ldJsonBlocks('cookbook/index.html');
    const faq = findByType(blocks, 'FAQPage')[0];
    expect(faq).toBeDefined();
    const schemaQuestions = faq.mainEntity.map((e: any) => e.name);
    const visible = visibleSummaryQuestions('cookbook/index.html');
    expect(schemaQuestions).toEqual(visible);
    expect(schemaQuestions.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// /docs/publishing — FAQPage anti-drift on the h3/p shape
// ─────────────────────────────────────────────────────────────────────────

describeBuilt('/docs/publishing — FAQPage JSON-LD, anti-drift (h3 shape)', () => {
  it('FAQPage questions match visible <h3> questions in the FAQ section, in order', () => {
    const blocks = ldJsonBlocks('docs/publishing/index.html');
    const faq = findByType(blocks, 'FAQPage')[0];
    expect(faq).toBeDefined();
    const schemaQuestions = faq.mainEntity.map((e: any) => e.name);
    // Scope to the FAQ section: encode entities the same way Astro renders
    // literal `>` for markdown-safety is not in play here — this page's
    // <h2>FAQ</h2> is a plain literal string.
    const visible = visibleH3Questions('docs/publishing/index.html', '<h2>FAQ</h2>');
    expect(schemaQuestions).toEqual(visible);
    expect(schemaQuestions.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// /blog/{slug} — BlogPosting sourced from real content-collection frontmatter
// ─────────────────────────────────────────────────────────────────────────

describeBuilt('blog posts — BlogPosting JSON-LD from real frontmatter', () => {
  const CONTENT_DIR = join(ROOT, 'src/content/blog');
  const slugs = built
    ? readdirSync(join(DIST, 'blog'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  it('found at least one blog post to check', () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  it.each(slugs)('every post has exactly one BlogPosting block: %s', (slug: string) => {
    const blocks = ldJsonBlocks(`blog/${slug}/index.html`);
    const posts = findByType(blocks, 'BlogPosting');
    expect(posts).toHaveLength(1);
  });

  it.each(slugs)(
    'BlogPosting required fields are present and non-empty: %s',
    (slug: string) => {
      const blocks = ldJsonBlocks(`blog/${slug}/index.html`);
      const post = findByType(blocks, 'BlogPosting')[0];
      expect(typeof post.headline).toBe('string');
      expect(post.headline.length).toBeGreaterThan(0);
      expect(typeof post.datePublished).toBe('string');
      // Must be a real, parseable ISO date, not an invented placeholder.
      expect(Number.isNaN(Date.parse(post.datePublished))).toBe(false);
      expect(typeof post.dateModified).toBe('string');
      expect(Number.isNaN(Date.parse(post.dateModified))).toBe(false);
      expect(post.author?.['@type']).toBe('Organization');
      expect(typeof post.author?.name).toBe('string');
      expect(post.author.name.length).toBeGreaterThan(0);
      expect(post.mainEntityOfPage?.['@id']).toBe(`https://app.loopskill.io/blog/${slug}`);
    },
  );

  it.each(slugs)(
    'headline/date/author trace back to the .md frontmatter, not an invented value: %s',
    (slug: string) => {
      // Astro's glob loader derives the content-collection id from the
      // filename with dots stripped from the slug portion (v0.5.0-... ->
      // v050-...) — map back to the real .md file by normalizing the same
      // way rather than assuming a 1:1 filename match.
      const allFiles = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
      const mdFile = allFiles.find((f) => f.replace(/\.md$/, '').replace(/\./g, '') === slug);
      expect(mdFile, `no .md frontmatter source found for dist slug ${slug}`).toBeDefined();
      const mdPath = join(CONTENT_DIR, mdFile as string);
      const raw = readFileSync(mdPath, 'utf-8');
      const fm = raw.slice(0, raw.indexOf('---', 3));
      const titleMatch = fm.match(/title:\s*'([^']*)'/);
      const authorMatch = fm.match(/author:\s*'([^']*)'/);
      const pubDateMatch = fm.match(/pubDate:\s*([\d-]+)/);

      const blocks = ldJsonBlocks(`blog/${slug}/index.html`);
      const post = findByType(blocks, 'BlogPosting')[0];

      if (titleMatch) expect(post.headline).toBe(titleMatch[1]);
      if (authorMatch) expect(post.author.name).toBe(authorMatch[1]);
      if (pubDateMatch) {
        expect(post.datePublished.slice(0, 10)).toBe(pubDateMatch[1]);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Whole-site: every ld+json block on every scanned page is valid JSON.
// ─────────────────────────────────────────────────────────────────────────

describeBuilt('every emitted ld+json block is parseable JSON', () => {
  const PAGES = [
    'pricing/index.html',
    'docs/referrals/index.html',
    'docs/publishing/index.html',
    'cookbook/index.html',
    'blog/index.html',
  ];

  it.each(PAGES)('%s — all ld+json blocks parse', (relPath: string) => {
    expect(() => ldJsonBlocks(relPath)).not.toThrow();
    expect(ldJsonBlocks(relPath).length).toBeGreaterThan(0);
  });
});
