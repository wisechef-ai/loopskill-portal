/**
 * RCP-3 — /vs comparison page tests
 *
 * Locked acceptance:
 *  - page exists at src/pages/vs.astro
 *  - LarryBrain figures present and dated 2026-05-08
 *  - all four columns present (DIY, LarryBrain, ChatGPT GPTs, Recipes)
 *  - linked from main nav (Nav.astro) and homepage hero (index.astro)
 *  - mobile-stacked layout exists alongside desktop table
 *  - no stale $N/mo prices (currency sweep continues to pass)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC = join(ROOT, 'src');

describe('/vs comparison page (RCP-3)', () => {
  const vsPath = join(SRC, 'pages/vs.astro');

  it('vs.astro file exists', () => {
    expect(existsSync(vsPath)).toBe(true);
  });

  it('renders all four comparison columns', () => {
    const src = readFileSync(vsPath, 'utf-8');
    expect(src).toContain('Build it yourself');
    expect(src).toContain('LarryBrain');
    expect(src).toContain('ChatGPT GPTs');
    expect(src).toContain('Recipes');
  });

  it('names LarryBrain explicitly and includes the locked figures', () => {
    const src = readFileSync(vsPath, 'utf-8');
    expect(src).toContain('LarryBrain');
    expect(src).toContain('102, single curator');
    expect(src).toContain('$29.99/mo');
    expect(src).toContain('OllieWazza');
  });

  it('includes the 2026-05-08 retrieval-date footnote', () => {
    const src = readFileSync(vsPath, 'utf-8');
    expect(src).toContain('2026-05-08');
    expect(src.toLowerCase()).toContain('retrieved');
  });

  it('renders the locked H1 and subheading copy', () => {
    const src = readFileSync(vsPath, 'utf-8');
    // H1 "Recipes vs. the rest" is split across spans for typography but words must be present
    expect(src).toMatch(/Recipes/);
    expect(src).toMatch(/vs\./);
    expect(src).toMatch(/the rest/);
    expect(src).toContain('Skill marketplaces sell ingredients');
    expect(src).toContain('Recipes gives you the kitchen');
  });

  it('renders both CTAs from the spec', () => {
    const src = readFileSync(vsPath, 'utf-8');
    expect(src).toContain('Start with Cook');
    expect(src).toContain('Operator');
    expect(src).toMatch(/20 endpoints/);
  });

  it('includes a Recipes-only-wins highlight on integrator rows', () => {
    const src = readFileSync(vsPath, 'utf-8');
    // The integrator-only rows are flagged with highlight: true
    expect(src).toContain('Personal cookbooks');
    expect(src).toContain('Sync skills across your own agents');
    expect(src).toContain('Deploy cookbooks to client agents');
    expect(src).toContain('Built for the AI integrator');
    expect(src).toContain('highlight');
  });

  it('has a desktop table AND a mobile stacked layout', () => {
    const src = readFileSync(vsPath, 'utf-8');
    // Desktop table is gated on hidden md:block
    expect(src).toMatch(/hidden md:block/);
    // Mobile stack is gated on md:hidden
    expect(src).toMatch(/md:hidden/);
    // Real <table> for the desktop layout
    expect(src).toContain('<table');
  });
});

describe('main nav links to /vs', () => {
  const navPath = join(SRC, 'components/Nav.astro');

  it('desktop nav has /vs link', () => {
    const src = readFileSync(navPath, 'utf-8');
    expect(src).toContain('href="/vs"');
  });

  it('mobile nav has /vs link', () => {
    const src = readFileSync(navPath, 'utf-8');
    // both desktop + mobile sections reference /vs — at least 2 occurrences
    const matches = src.match(/href="\/vs"/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('homepage hero links to /vs', () => {
  const indexPath = join(SRC, 'pages/index.astro');

  it('index.astro links to /vs from the hero', () => {
    const src = readFileSync(indexPath, 'utf-8');
    expect(src).toContain('href="/vs"');
  });
});
