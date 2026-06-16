/**
 * WIS-949: sitemap.xml includes ALL skill detail pages
 *
 * Before: sitemap.xml enumerated only 14 static routes + blog posts (20 total)
 *         — 52 paid skills were invisible to Google/GEO crawlers.
 * After:  sitemap.xml.ts fetches the full skill catalog and emits one <loc>
 *         per skill at /skills/{slug} with priority 0.8.
 *
 * These tests verify the source file has the required shape; the live URL
 * count is verified by the morning brief's live probe.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SITEMAP_TS = join(ROOT, 'src/pages/sitemap.xml.ts');

describe('WIS-949: sitemap.xml.ts enumerates skill detail pages', () => {
  let src: string;

  beforeAll(() => {
    src = readFileSync(SITEMAP_TS, 'utf-8');
  });

  it('imports fetchApi for API-backed skill enumeration', () => {
    expect(src).toContain("from '../lib/api'");
    expect(src).toContain('fetchApi');
  });

  it('fetches /api/skills/search with page_size=100 (not the old static list)', () => {
    expect(src).toContain('/api/skills/search?page_size=100');
  });

  it('paginates beyond page 1 when total > 100', () => {
    // Must contain the loop variable referencing page parameter
    expect(src).toMatch(/page=\$\{p\}|page_size=100.*page=|lastPage/);
  });

  it('emits /skills/{slug} loc entries', () => {
    expect(src).toContain('/skills/${s.slug}');
  });

  it('assigns priority 0.8 to skill detail pages', () => {
    // Skill pages outrank blog (0.6) but yield to / (1.0) and /skills index (0.9)
    expect(src).toContain('<priority>0.8</priority>');
  });

  it('includes skillUrls in the final xml output', () => {
    // The spread must appear inside the final xml template literal
    expect(src).toContain('...skillUrls');
  });

  it('has a WIS-949 annotation comment', () => {
    expect(src).toContain('WIS-949');
  });

  it('still includes the 14 original static routes', () => {
    // Key routes that must survive the refactor
    const required = ['/', '/skills', '/pricing', '/docs', '/blog'];
    for (const route of required) {
      expect(src).toContain(`path: '${route}'`);
    }
  });

  it('handles API failure gracefully (returns empty array not throw)', () => {
    // The fetch helper must return [] on failure, not propagate an exception
    expect(src).toContain('return []');
  });
});
