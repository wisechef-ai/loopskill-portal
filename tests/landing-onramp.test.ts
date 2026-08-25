/**
 * landing_onramp — "THE ON-RAMP" landing contract.
 *
 * WHAT THIS PINS
 * --------------
 * The homepage was rebuilt around the career-path narrative from the
 * 2026-08-21 landing-concepts plan (Concept 3) with Concept 2's interactive
 * fleet drift matrix embedded in the Fleet station. Three properties are
 * load-bearing and all three have silently regressed on this page before:
 *
 *   1. CLAIM GROUNDING — every number rendered comes from a live endpoint at
 *      build time and fails CLOSED. The catalog has shipped fabricated
 *      fallback rows once already (identity-guards, 2026-07-05), and it was
 *      only caught because a guard existed. The matrix's column headers are
 *      the new instance of that exact risk: a real-looking skill name with a
 *      version number next to it, rendered inside a demo.
 *
 *   2. PROGRESSIVE ENHANCEMENT — all four stations and the full matrix are
 *      SERVER-RENDERED. This is not an aesthetic preference: it is what lets
 *      audit-links resolve every station's links (a client-rendered href is a
 *      runtime value that guard cannot see), and it is the whole SEO/GEO
 *      reason this concept was picked over the other two.
 *
 *   3. THE DEMO IS LABELLED — the matrix's fleet state is simulated. An
 *      unlabelled simulation of a product surface is a capability claim.
 *
 * Source tests run on a fresh clone; dist tests self-skip without a build
 * (same convention as bootcamp-fallback-rot-guard.test.ts), so they only
 * carry meaning in CI's post-build step.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const INDEX = resolve(ROOT, 'src/pages/index.astro');
const RAIL = resolve(ROOT, 'src/components/JourneyRail.astro');
const MATRIX = resolve(ROOT, 'src/components/FleetDriftMatrix.astro');
const DIST_INDEX = resolve(ROOT, 'dist/index.html');

const indexSrc = readFileSync(INDEX, 'utf-8');
const railSrc = readFileSync(RAIL, 'utf-8');
const matrixSrc = readFileSync(MATRIX, 'utf-8');

const STATIONS = ['day-1', 'first-client', 'fleet', 'get-paid'] as const;

/** Strip comments so a rationale comment can never satisfy a content assertion. */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

// ───────────────────────────────────────────────────────────────────────────
// 1. The rail exists, and every station is server-rendered
// ───────────────────────────────────────────────────────────────────────────
describe('ON-RAMP rail — source contract', () => {
  it('the homepage renders the journey rail with all four stations', () => {
    for (const id of STATIONS) {
      expect(indexSrc, `station "${id}" missing from index.astro`).toContain(`slot="${id}"`);
      expect(indexSrc, `station "${id}" not declared in the rail data`).toContain(`id: '${id}'`);
    }
  });

  it('carries the Concept 3 hook verbatim', () => {
    expect(indexSrc).toContain('Deploying AI agents for clients is a job now');
    expect(indexSrc).toContain('This is its toolkit');
  });

  it('every panel is SERVER-rendered — no station is created by client JS', () => {
    // Each panel is a real <section> in the component's markup. If a future
    // refactor moves panel creation into the inline script, audit-links loses
    // sight of every link inside three of the four stations.
    for (const id of STATIONS) {
      expect(railSrc).toContain(`id="station-${id}"`);
      expect(railSrc).toContain(`<slot name="${id}" />`);
    }
    // The script may only TOGGLE panels, never build them.
    const script = railSrc.slice(railSrc.indexOf('<script'));
    expect(script).not.toMatch(/innerHTML\s*=/);
    expect(script).not.toMatch(/createElement\(/);
  });

  it('hides inactive panels with BOTH `hidden` and inline display (Trap A)', () => {
    // AGENTS.md auth-state rule 2: a bare attribute loses to any `display:`
    // rule that wins specificity. This page has shipped that bug before.
    const script = railSrc.slice(railSrc.indexOf('<script'));
    expect(script).toContain("setAttribute('hidden'");
    expect(script).toContain("style.display = 'none'");
  });

  it('implements the ARIA tabs pattern with roving tabindex', () => {
    expect(railSrc).toContain('role="tablist"');
    expect(railSrc).toContain('role="tab"');
    expect(railSrc).toContain('role="tabpanel"');
    expect(railSrc).toContain('aria-controls=');
    expect(railSrc).toContain('aria-labelledby=');
    const script = railSrc.slice(railSrc.indexOf('<script'));
    expect(script).toContain('ArrowRight');
    expect(script).toContain('ArrowLeft');
    expect(script).toContain('tabIndex');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. The drift matrix is genuinely interactive, and honestly labelled
// ───────────────────────────────────────────────────────────────────────────
describe('fleet drift matrix — interactivity contract', () => {
  /**
   * The CELL wiring block specifically — not the whole script.
   *
   * RED-proof finding (2026-08-25): asserting `addEventListener('click'`
   * against the whole script was satisfied by the CONVERGE button's handler,
   * so deleting the cell click handler entirely left the suite green. A
   * matrix whose cells do nothing is exactly the "static image" failure this
   * describe block exists to forbid. Bound the window to the cell loop.
   */
  function cellWiring(): string {
    const start = matrixSrc.indexOf("root.querySelectorAll('[data-dm-cell]').forEach");
    const end = matrixSrc.indexOf("root.querySelectorAll('[data-dm-converge]')", start);
    expect(start, 'cell wiring block not found').toBeGreaterThan(-1);
    expect(end, 'converge wiring block not found').toBeGreaterThan(start);
    return matrixSrc.slice(start, end);
  }

  it('has real hover / focus / click inspection on the CELLS, not a static image', () => {
    const block = cellWiring();
    for (const evt of ['mouseenter', 'mouseleave', 'focus', 'blur', 'click']) {
      expect(block, `no cell ${evt} handler — the matrix would be decorative`).toContain(
        `addEventListener('${evt}'`,
      );
    }
    // Clicking a cell must PIN it (aria-pressed), otherwise hover is the only
    // affordance and the matrix is unusable on touch.
    expect(block).toContain("setAttribute('aria-pressed', 'true')");
  });

  it('converge is wired on its own button, separately from cell inspection', () => {
    const script = matrixSrc.slice(matrixSrc.indexOf('<script'));
    const convergeBlock = script.slice(script.indexOf("root.querySelectorAll('[data-dm-converge]')"));
    expect(convergeBlock).toContain("addEventListener('click'");
  });

  it('converge walks a drifted row to in-sync and re-counts the fleet', () => {
    const script = matrixSrc.slice(matrixSrc.indexOf('<script'));
    expect(script).toContain('data-dm-converge');
    expect(script).toContain("cell.dataset.state = 'ok'");
    expect(script).toContain('function recount(');
  });

  it('reset restores the SERVER-rendered state, not a JS-side copy of it', () => {
    // The pristine values are mirrored into data-*0 attributes at render time.
    // A JS-side snapshot taken at init would silently drift if anything
    // mutated the DOM before the snapshot ran.
    expect(matrixSrc).toContain('data-state0=');
    expect(matrixSrc).toContain('data-installed0=');
    const script = matrixSrc.slice(matrixSrc.indexOf('<script'));
    expect(script).toContain('cell.dataset.state0');
  });

  it('every cell is a real focusable control with an accessible name', () => {
    expect(matrixSrc).toMatch(/<button[\s\S]{0,400}?data-dm-cell/);
    expect(matrixSrc).toContain('aria-label={`${a.id} — ${skill.title}: ${STATE_LABEL[c.state]}`}');
  });

  it('uses the real three-way verdict vocabulary from the fleet routes', () => {
    const text = stripComments(matrixSrc);
    expect(text).toContain('declared');
    expect(text).toContain('installed');
    expect(text).toContain('extras');
  });

  it('respects prefers-reduced-motion', () => {
    expect(matrixSrc).toContain('prefers-reduced-motion');
    const script = matrixSrc.slice(matrixSrc.indexOf('<script'));
    expect(script).toContain('reduceMotion');
  });
});

describe('fleet drift matrix — honesty contract', () => {
  it('labels the simulated fleet state as a DEMO in the rendered markup', () => {
    const text = stripComments(matrixSrc);
    expect(text).toContain('DEMO');
    expect(text).toContain('simulated');
  });

  it('states the known never-run blind spot rather than hiding it', () => {
    // /docs/scope discloses that an assignment which never ran still reads
    // healthy. A demo of the fleet view that omits this oversells the product.
    expect(stripComments(matrixSrc)).toMatch(/never run/i);
    expect(matrixSrc).toContain('/docs/scope');
  });

  it('does NOT hardcode any skill slug — columns come from the live catalog', () => {
    // A hardcoded slug here is simultaneously fabricated catalog data
    // (identity-guards) and a potential dead link (audit-links).
    expect(stripComments(matrixSrc)).not.toMatch(/slug:\s*'[a-z][a-z0-9-]+'/);
  });

  it('derives the drifted version from the declared one, never a literal', () => {
    // A version string printed beside a real skill name is a numeric claim.
    expect(matrixSrc).toContain('function priorVersion(');
    // No hand-typed x.y.z literals anywhere in the demo data.
    const data = stripComments(matrixSrc).slice(0, matrixSrc.indexOf('---', 10));
    expect(data).not.toMatch(/'\d+\.\d+\.\d+'/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Claim grounding on the page itself
// ───────────────────────────────────────────────────────────────────────────
describe('ON-RAMP claim grounding', () => {
  it('binds the matrix columns to live catalog slugs AND live versions', () => {
    expect(indexSrc).toContain("'/api/skills/search?page_size=12'");
    expect(indexSrc).toContain('latest_version');
    expect(indexSrc).toContain('declared: s.latest_version as string');
  });

  it('fails CLOSED — the matrix is omitted when the catalog cannot be read', () => {
    expect(indexSrc).toContain('const showMatrix = matrixSkills.length === 5;');
    expect(indexSrc).toContain('{showMatrix ? (');
  });

  it('binds the staged-connector count to a live endpoint, or omits it', () => {
    expect(indexSrc).toContain('/api/connectors?include_external=true');
    expect(indexSrc).toContain('let stagedConnectorCount: number | null = null;');
    // The rendered branch is conditional on a resolved value.
    expect(indexSrc).toContain('{stagedConnectorCount ? (');
  });

  it('D-029: federated counts are phrased "indexed"/"federated", never "ours"', () => {
    const text = stripComments(indexSrc);
    // Every place the federated label is used as a headline must qualify it.
    expect(text).toMatch(/indexed across federated registries/);
    expect(text).not.toMatch(/our\s+[\d,]+\+?\s+skills/i);
    // The connector figure must never read as a browsable catalog.
    if (text.includes('stagedConnectorCount.toLocaleString()')) {
      expect(text).toContain('review-gated');
      expect(text).toContain('Staging is not publishing');
    }
  });

  it('does not hardcode a catalog skill count in visible copy', () => {
    // Same rule p0-no-hardcoded-skill-counts enforces repo-wide; asserted here
    // too so a regression names THIS page.
    const text = stripComments(indexSrc);
    expect(text).not.toMatch(/(?<![\d,])\d{2,4}\+?\s+(free\s+|curated\s+|signed\s+)*skills?\b/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Top-10 capabilities are within one click (the whole point of the rebuild)
// ───────────────────────────────────────────────────────────────────────────
describe('feature-matrix coverage — the highest-value capabilities are ON the page', () => {
  const REQUIRED_LINKS = [
    ['/docs/deployment', 'client bundle delivery'],
    ['/docs/api-keys', 'bundle-scoped keys'],
    ['/docs/fleet', 'fleet sync + locks'],
    ['/docs/mcp', 'MCP tools'],
    ['/docs/new-agent', 'Ed25519 self-enrolment'],
    ['/docs/scope', 'honest scope'],
    ['/docs/creator-workflow', 'skillify / publish'],
    ['/docs/referrals', 'referral rev-share'],
    ['/security', 'trust stack'],
    ['/bootcamp', 'bootcamp tracks'],
    ['/composer', 'compose a bundle'],
    ['/federation/', 'federated index'],
  ] as const;

  for (const [href, what] of REQUIRED_LINKS) {
    it(`links ${what} (${href})`, () => {
      expect(indexSrc).toContain(`href="${href}"`);
    });
  }

  it('surfaces the offline CLI — previously ZERO mentions on any portal surface', () => {
    const text = stripComments(indexSrc);
    expect(text).toContain('loopskill import');
    expect(text).toContain('loopskill diff');
    // And says the thing that makes it a top-of-funnel wedge.
    expect(text).toMatch(/zero network calls/i);
  });

  it('surfaces bundle fork/preview — previously zero docs copy', () => {
    expect(stripComments(indexSrc)).toMatch(/fork/i);
  });

  it('names every bootcamp step even when the API returns a null title', () => {
    // Live-verified 2026-08-25: /api/bootcamp/agent-fleet returns
    // `title: null` for steps whose skill is not in the catalog, so a bare
    // `{step.title}` rendered TWO blank chips — the curriculum silently lost
    // half its content, and the bootcamp rot guard's "degrades links, not
    // content" assertion went red against dist. The slug is always present.
    expect(indexSrc).toContain('{step.title || step.slug}');
    expect(indexSrc).not.toMatch(/\{step\.title\}/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Built output (self-skips without dist/)
// ───────────────────────────────────────────────────────────────────────────
describe('ON-RAMP — built output', () => {
  const built = existsSync(DIST_INDEX);
  const html = built ? readFileSync(DIST_INDEX, 'utf-8') : '';

  it('ships the rail with all four stations rendered into static HTML', () => {
    if (!built) return;
    expect(html).toContain('data-component="journey-rail"');
    for (const id of STATIONS) {
      expect(html, `station ${id} missing from dist`).toContain(`id="station-${id}"`);
      expect(html, `tab ${id} missing from dist`).toContain(`id="tab-${id}"`);
    }
  });

  it('ships a full matrix grid — every cell present before any JS runs', () => {
    if (!built) return;
    expect(html).toContain('data-component="fleet-drift-matrix"');
    const cells = html.match(/data-dm-cell/g) || [];
    // 5 agents × 5 skills. (The source attribute name also appears once in the
    // inline script's selector, hence >= rather than ===.)
    expect(cells.length).toBeGreaterThanOrEqual(25);
    const rows = html.match(/data-dm-row="/g) || [];
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it('every matrix column links to a skill page the build actually emitted', () => {
    if (!built) return;
    const cols = [...html.matchAll(/href="\/skills\/([a-z0-9-]+)"\s+class="dm-col-link"/g)].map(
      (m) => m[1],
    );
    expect(cols.length).toBe(5);
    for (const slug of cols) {
      expect(
        existsSync(resolve(ROOT, `dist/skills/${slug}/index.html`)),
        `matrix column /skills/${slug} was not emitted — dead link`,
      ).toBe(true);
    }
  });

  it('ships the DEMO label with the simulated matrix', () => {
    if (!built) return;
    expect(html).toContain('DEMO');
    expect(html).toMatch(/simulated/i);
  });

  it('renders live numbers, not the build-time fallback floor', () => {
    if (!built) return;
    // 80,000+ is the last-verified honest FLOOR used only when the federation
    // fetch fails. Seeing it in a shipped build means the build ran degraded.
    expect(html).not.toContain('80,000+');
    expect(html).toMatch(/[\d,]{5,}\+ skills indexed/);
  });
});
