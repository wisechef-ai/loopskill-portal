/**
 * Composer skill preview modal (Adam feedback 2026-07-05).
 *
 * Source-level assertions that the /library composer:
 *   1. Has a preview modal container in the DOM.
 *   2. Each composer search-result card carries a preview affordance
 *      (clickable title + explicit "Preview" button).
 *   3. The preview logic fetches /api/skills/{slug} for full detail.
 *   4. README body is rendered via marked (markdown).
 *   5. Modal closes on backdrop click, ✕, and Escape.
 *
 * Same source-assertion pattern as spotify-0608-f-cookbooks.test.ts.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const LIBRARY = join(ROOT, 'src', 'pages', 'library.astro');

describe('Composer skill preview modal', () => {
  const src = existsSync(LIBRARY) ? readFileSync(LIBRARY, 'utf-8') : '';

  it('library.astro exists', () => {
    expect(existsSync(LIBRARY)).toBe(true);
  });

  // ── Modal container ───────────────────────────────────────────────────
  describe('modal DOM', () => {
    it('has a #skill-preview dialog element', () => {
      expect(src).toContain('id="skill-preview"');
    });

    it('uses role=dialog + aria-modal for a11y', () => {
      expect(src).toContain('role="dialog"');
      expect(src).toContain('aria-modal="true"');
    });

    it('has labelledby pointing at the title', () => {
      expect(src).toContain('aria-labelledby="spv-title"');
    });

    it('has the structural sections (title, desc, readme, meta, loading, error)', () => {
      expect(src).toContain('id="spv-title"');
      expect(src).toContain('id="spv-desc"');
      expect(src).toContain('id="spv-readme"');
      expect(src).toContain('id="spv-meta"');
      expect(src).toContain('id="spv-loading"');
      expect(src).toContain('id="spv-error"');
    });

    it('has a close button, footer full-page link, and footer add button', () => {
      expect(src).toContain('id="spv-close"');
      expect(src).toContain('id="spv-fullpage"');
      expect(src).toContain('id="spv-add"');
    });
  });

  // ── Card affordances ──────────────────────────────────────────────────
  describe('card preview affordance', () => {
    it('renders a Preview button on each composer search result', () => {
      expect(src).toContain('cmp-preview');
      expect(src).toContain('>Preview<');
    });

    it('makes the title clickable to open the preview (data-preview-slug)', () => {
      expect(src).toContain('data-preview-slug');
      expect(src).toContain('cmp-skill-title');
    });

    it('carries the community flag on the preview trigger', () => {
      expect(src).toContain('data-preview-community');
    });
  });

  // ── Event wiring ──────────────────────────────────────────────────────
  describe('event wiring', () => {
    it('wires preview open on data-preview-slug elements (click + keyboard)', () => {
      expect(src).toContain("querySelectorAll<HTMLElement>('[data-preview-slug]')");
      expect(src).toContain("e.key === 'Enter' || e.key === ' '");
    });

    it('wires preview open on the explicit .cmp-preview button', () => {
      expect(src).toContain("querySelectorAll<HTMLButtonElement>('.cmp-preview')");
    });

    it('defines openSkillPreview and closeSkillPreview', () => {
      expect(src).toContain('function openSkillPreview(');
      expect(src).toContain('function closeSkillPreview(');
    });
  });

  // ── Data fetching ─────────────────────────────────────────────────────
  describe('data fetching', () => {
    it('fetches full detail from /api/skills/{slug} for curated skills', () => {
      expect(src).toContain('/api/skills/${encodeURIComponent(slug)}');
    });

    it('handles community skills without hitting the detail endpoint', () => {
      expect(src).toMatch(/if \(isCommunity\)/);
    });

    it('renders README markdown via marked', () => {
      expect(src).toContain("import('marked')");
    });

    it('renders metadata (installs, author, version, license)', () => {
      expect(src).toContain('install_count_total');
      expect(src).toContain('creator_name');
      expect(src).toContain('latest_version');
      expect(src).toContain('license');
    });

    it('shows an error state on non-ok response', () => {
      expect(src).toContain('spv-error');
      expect(src).toMatch(/if \(!r\.ok\)/);
    });
  });

  // ── Close interactions ────────────────────────────────────────────────
  describe('close interactions', () => {
    it('closes on ✕ click', () => {
      expect(src).toContain("$('spv-close').addEventListener('click', closeSkillPreview)");
    });

    it('closes on backdrop click', () => {
      expect(src).toContain("$('skill-preview').addEventListener('click'");
      expect(src).toContain("e.target === $('skill-preview')");
    });

    it('closes on Escape key', () => {
      expect(src).toContain("e.key === 'Escape'");
    });

    it('locks body scroll while open and restores on close', () => {
      expect(src).toContain("document.body.style.overflow = 'hidden'");
      expect(src).toContain("document.body.style.overflow = ''");
    });
  });

  // ── Regression: composer flow intact ──────────────────────────────────
  describe('composer flow intact', () => {
    it('still has the +Add button with data-slug', () => {
      expect(src).toContain('cmp-add');
    });

    it('still has the basket pane', () => {
      expect(src).toContain('id="basket-list"');
    });

    it('still has the zone pills', () => {
      expect(src).toContain('zone-pill');
    });
  });
});
