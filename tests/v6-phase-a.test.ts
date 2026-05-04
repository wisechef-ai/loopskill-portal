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
// 1. Subset filter — the /skills page must support ?subset=pantry|menu|cookbook
// ---------------------------------------------------------------------------
describe('subset filter in /skills page', () => {
  const skillsIndexPath = join(SRC, 'pages/skills/index.astro');

  it('renders subset filter chips for pantry, menu, and cookbook', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('data-subset-filter');
    expect(src).toContain('pantry');
    expect(src).toContain('menu');
    expect(src).toContain('cookbook');
  });

  it('adds data-subset attribute to each skill card', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('data-subset=');
  });

  it('honors ?subset= URL param on landing', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('subsetParam');
    expect(src).toContain("params.get('subset')");
  });

  it('filters by activeSubset in the apply() function', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('activeSubset');
    expect(src).toContain('matchSubset');
  });
});

// ---------------------------------------------------------------------------
// 2. skill_variant — 'Original' badge + original_source_url link on /skills
// ---------------------------------------------------------------------------
describe('skill_variant original badge in /skills', () => {
  const skillsIndexPath = join(SRC, 'pages/skills/index.astro');

  it('renders Original badge when skill_variant=original', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('skill_variant');
    expect(src).toContain('Original');
  });

  it('links to original_source_url when variant=original', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('original_source_url');
  });
});

// ---------------------------------------------------------------------------
// 3. external_resources — collapsible list on /skills (inline)
// ---------------------------------------------------------------------------
describe('external_resources collapsible on /skills', () => {
  const skillsIndexPath = join(SRC, 'pages/skills/index.astro');

  it('renders Related external section when external_resources non-null', () => {
    const src = readFileSync(skillsIndexPath, 'utf-8');
    expect(src).toContain('external_resources');
    expect(src).toContain('Related external');
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

  it('contains required copy about Cookbook creation', () => {
    const src = readFileSync(cookbookPath, 'utf-8');
    expect(src.toLowerCase()).toContain('cookbook');
    expect(src).toContain('Cook+');
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

  const STALE_PRICE_RE = /\$\d+\/(mo|month|year)/gi;
  // Allow internal docs mentions of Anthropic $ spend — only block user-facing pages
  const USER_FACING_DIRS = [join(SRC, 'pages'), join(SRC, 'components'), join(SRC, 'layouts')];

  it('has zero stale $N/mo prices in user-facing src/ pages, components, layouts', () => {
    const files = USER_FACING_DIRS.flatMap(d => walkFiles(d, ['.astro', '.ts', '.js', '.html']));
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf-8');
      const matches = content.match(STALE_PRICE_RE);
      if (matches) {
        hits.push(`${f}: ${matches.join(', ')}`);
      }
    }
    expect(hits, `Stale prices found:\n${hits.join('\n')}`).toHaveLength(0);
  });
});
