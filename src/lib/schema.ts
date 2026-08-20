// src/lib/schema.ts — shared JSON-LD builders (gap/schema).
//
// WHY THIS EXISTS
// ----------------
// GEO audit 2026-08-20: every sampled page carries ONLY generic Organization
// JSON-LD (AppShell.astro). Zero FAQPage anywhere sitewide, zero Offer beyond
// the one hand-rolled SoftwareApplication block on skill/loop pages, zero
// Article/BlogPosting on blog posts. Six independent 2026 GEO sources agree
// FAQPage is the single highest-leverage schema type for AI-answer-engine
// citation — this file is the shared plumbing so every page that adds one
// builds it the same way instead of re-inventing the shape.
//
// ANTI-DRIFT CONTRACT (the reason this is a function, not a template):
// buildFaqPageSchema takes the SAME array a page maps over to render its
// visible <details>/<summary> FAQ. One edit to that array changes both the
// visible copy and the JSON-LD — there is no second, hand-maintained copy
// that can drift from what a visitor actually reads. Never construct a
// FAQPage block from a literal object; always pass the rendered array.
export interface FaqItem {
  q: string;
  a: string;
}

export function buildFaqPageSchema(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}

export interface PublicOffer {
  name: string;
  price: string; // exact decimal string, e.g. '0' or '9.95' — never invent a number
  priceCurrency: string;
  url: string;
  description?: string;
}

/**
 * AggregateOffer wrapping only the GENUINELY PUBLIC rungs of the price
 * ladder. HARD CONSTRAINT (hub §4 D-003/D-005, enforced at build time by
 * scripts/audit-claims.mjs `unlocked-price`): the public ladder is Free
 * $0/mo and Pro $9.95/mo ONLY. The $100 on-demand/enterprise tier is
 * invite-only and must NEVER be emitted here as a priced Offer — callers
 * must filter their tier list down to the public rungs BEFORE calling this,
 * never pass the full tiers array unfiltered.
 */
export function buildAggregateOfferSchema(offers: PublicOffer[], url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'AggregateOffer',
    url,
    priceCurrency: offers[0]?.priceCurrency || 'USD',
    lowPrice: Math.min(...offers.map((o) => Number(o.price))).toString(),
    highPrice: Math.max(...offers.map((o) => Number(o.price))).toString(),
    offerCount: offers.length,
    offers: offers.map((o) => ({
      '@type': 'Offer',
      name: o.name,
      price: o.price,
      priceCurrency: o.priceCurrency,
      url: o.url,
      ...(o.description ? { description: o.description } : {}),
    })),
  };
}

export interface ArticleFrontmatter {
  title: string;
  description: string;
  pubDate: Date;
  updatedDate?: Date;
  author: string;
}

/**
 * BlogPosting JSON-LD sourced ONLY from the post's own content-collection
 * frontmatter (src/content.config.ts `blog` schema) — never invented dates
 * or bylines. dateModified falls back to datePublished when the post has no
 * updatedDate field, which is the honest statement (no evidence of a later
 * edit) rather than a fabricated "just updated" signal.
 */
export function buildBlogPostingSchema(post: ArticleFrontmatter, url: string, siteURL: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.pubDate.toISOString(),
    dateModified: (post.updatedDate ?? post.pubDate).toISOString(),
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'LoopSkill',
      logo: {
        '@type': 'ImageObject',
        url: `${siteURL}/favicon.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
  };
}
