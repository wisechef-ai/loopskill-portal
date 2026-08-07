/**
 * mesh0408 W3 — the two build guards that make a false claim and a dead link
 * fail the build instead of shipping.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The apex (loopskill.io) served three dead links for weeks and nothing
 * caught them. The portal served "deploy a bundle to a fleet member" copy for
 * months while `bundle_deployments` sat at 0, and nothing caught that either.
 * Both are the same failure: the repo had no executable opinion about its own
 * public surface. `scripts/audit-links.mjs` and `scripts/audit-claims.mjs` are
 * that opinion; this file is what keeps THEM honest.
 *
 * Trap V3 says a source-text guard asserts where text lives, not what code
 * does — so every rule below is exercised behaviourally, on real strings,
 * through the same functions the build calls.
 *
 * The pattern each claims-rule test follows is the one the API repo's
 * `tests/test_m4_public_surface_truth.py` established, and it is the reason
 * these gates are usable: pin BOTH halves. A rule must fire on the real
 * reintroduction shape AND stay silent on the true sentence that lives next
 * to it today. A gate that fires on adjacent-but-true language teaches
 * writers to route around it, which is worse than no gate.
 */

import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

import {
  normalizeLink,
  resolvesInDist,
  extractHrefs,
  stripScriptsAndStyles,
  servedOutsideDist,
} from '../scripts/audit-links.mjs';
import { RULES, firesOn, renderedText, fragments, scanText } from '../scripts/audit-claims.mjs';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const DIST = join(ROOT, 'dist');

/** Build a throwaway dist/ tree from a {path: contents} map. */
function fakeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'w3-guard-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────
// audit-links: link normalization
// ─────────────────────────────────────────────────────────────────────────

describe('audit-links · normalizeLink', () => {
  it('resolves a root-relative href to itself', () => {
    expect(normalizeLink('/docs/sync', '/pricing/')).toBe('/docs/sync');
  });

  it('resolves a document-relative href against the page it sits on', () => {
    expect(normalizeLink('sync', '/docs/')).toBe('/docs/sync');
    // A browser resolves ../ against the page's own directory, so a page
    // served at /docs/sync/ lands on /docs/pricing — not /pricing.
    expect(normalizeLink('../pricing', '/docs/sync/')).toBe('/docs/pricing');
    expect(normalizeLink('../pricing', '/docs/sync')).toBe('/pricing');
  });

  it('drops the query string and fragment before resolving', () => {
    expect(normalizeLink('/skills?q=seo#top', '/')).toBe('/skills');
  });

  it('ignores links that are not ours to resolve', () => {
    for (const href of [
      '#section',
      'https://github.com/wisechef-ai/loopskill-api',
      '//cdn.example.com/x.js',
      'mailto:hi@loopskill.io',
      'tel:+15551234',
      'javascript:void(0)',
      'data:image/svg+xml,<svg/>',
      '?q=only-a-query',
      '',
      '   ',
    ]) {
      expect(normalizeLink(href, '/')).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// audit-links: try_files resolution — a PASS here must mean what it means
// in production, or the guard is decoration.
// ─────────────────────────────────────────────────────────────────────────

describe('audit-links · resolvesInDist mirrors Caddy try_files', () => {
  let dir: string;
  beforeAll(() => {
    dir = fakeDist({
      'index.html': 'root',
      'pricing/index.html': 'pricing',
      'llms.txt': 'llms',
      'og-default.png': 'png',
      'empty-dir/.keep': '',
    });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resolves / to index.html', () => {
    expect(resolvesInDist(dir, '/')).toBe(true);
  });

  it('resolves an extensionless route via {path}/index.html', () => {
    expect(resolvesInDist(dir, '/pricing')).toBe(true);
    expect(resolvesInDist(dir, '/pricing/')).toBe(true);
  });

  it('resolves a literal file', () => {
    expect(resolvesInDist(dir, '/llms.txt')).toBe(true);
    expect(resolvesInDist(dir, '/og-default.png')).toBe(true);
  });

  it('does NOT resolve a directory with no index.html — production 404s there', () => {
    expect(resolvesInDist(dir, '/empty-dir')).toBe(false);
  });

  it('does NOT resolve a route the build never emitted', () => {
    expect(resolvesInDist(dir, '/docs/bundles')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// audit-links: the exemption list must stay honest
//
// The first draft of SERVED_OUTSIDE_DIST exempted /fleet on the strength of a
// `redir /fleet` line in ops/Caddyfile. Production returns 404 for /fleet —
// the reference Caddyfile is stale. An exemption for a path the server does
// not actually serve is this guard asserting a redirect that does not exist,
// in the one place whose entire job is catching dead links.
// ─────────────────────────────────────────────────────────────────────────

describe('audit-links · SERVED_OUTSIDE_DIST is exactly as long as it needs to be', () => {
  it('exempts only /api/* and /skill', () => {
    const src = readFileSync(join(ROOT, 'scripts/audit-links.mjs'), 'utf8');
    const list = src.slice(
      src.indexOf('const SERVED_OUTSIDE_DIST'),
      src.indexOf('const SKIP_SCHEME')
    );
    const entries = [...list.matchAll(/\{\s*(exact|prefix|regex):/g)];
    expect(entries).toHaveLength(2);
    expect(list).toContain("prefix: '/api/'");
    expect(list).toContain("exact: '/skill'");
  });

  // Behavioural half (trap V3: a string-match guard asserts where text lives,
  // not what the code does). These run the real predicate.
  it('behaviourally exempts the two paths the server really answers', () => {
    expect(servedOutsideDist('/api/auth/google/login')).toBeTruthy();
    expect(servedOutsideDist('/skill')).toBeTruthy();
  });

  it('behaviourally does NOT exempt /fleet, so a link to it fails the build', () => {
    expect(servedOutsideDist('/fleet')).toBeNull();
    // and it does not resolve in dist either — which is what makes it a 404
    const dir = fakeDist({ 'index.html': 'x' });
    expect(resolvesInDist(dir, '/fleet')).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('behaviourally does NOT exempt the unlinked rewrite paths', () => {
    expect(servedOutsideDist('/cookbooks/p/some-slug')).toBeNull();
    expect(servedOutsideDist('/SKILL.md')).toBeNull();
  });

  it('does NOT exempt /fleet — production 404s there', () => {
    const src = readFileSync(join(ROOT, 'scripts/audit-links.mjs'), 'utf8');
    const list = src.slice(
      src.indexOf('const SERVED_OUTSIDE_DIST'),
      src.indexOf('const SKIP_SCHEME')
    );
    expect(list).not.toMatch(/\{\s*exact:\s*'\/fleet'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// audit-links: inline JS must not be mistaken for markup
// ─────────────────────────────────────────────────────────────────────────

describe('audit-links · stripScriptsAndStyles', () => {
  const html = [
    '<a href="/pricing">Pricing</a>',
    '<script>',
    '  const card = `<a href="${esc(href)}" class="c">x</a>`;',
    '</script>',
    '<a href="/docs">Docs</a>',
  ].join('\n');

  it('does not report a template-literal href as a route', () => {
    const found = extractHrefs(html).map((h) => h.raw);
    expect(found).toEqual(['/pricing', '/docs']);
  });

  it('preserves line numbers across the blanked script body', () => {
    const found = extractHrefs(html);
    expect(found[0].line).toBe(1);
    expect(found[1].line).toBe(5);
  });

  it('blanks the script body without changing the document length', () => {
    expect(stripScriptsAndStyles(html)).toHaveLength(html.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// audit-claims: markup → the prose a visitor actually reads
// ─────────────────────────────────────────────────────────────────────────

describe('audit-claims · renderedText', () => {
  it('reassembles a claim split across inline elements into one sentence', () => {
    const html =
      '<p>Push a <strong>bundle</strong> straight <em>into</em> a client agent.</p>';
    expect(renderedText(html).trim()).toBe('Push a bundle straight into a client agent.');
  });

  it('keeps two block elements from fusing into one fragment', () => {
    const html = '<p>Loops deploy.</p><p>Bundles do not</p>';
    expect(fragments(renderedText(html))).toEqual(['Loops deploy.', 'Bundles do not']);
  });

  it('discards script and style bodies — code is not copy', () => {
    const html =
      '<style>.x{content:"deploy a bundle to a fleet"}</style>' +
      '<script>var s = "deploy a bundle to a fleet";</script>' +
      '<p>Agents pull.</p>';
    expect(scanText(renderedText(html), 'x.html')).toEqual([]);
  });

  it('decodes entities so an escaped apostrophe does not hide a claim', () => {
    expect(renderedText('<p>a client&#39;s agent</p>').trim()).toBe("a client's agent");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// audit-claims: every rule, both halves — fires on the reintroduction,
// silent on the true sentence beside it.
// ─────────────────────────────────────────────────────────────────────────

const rule = (id: string) => {
  const r = RULES.find((x: { id: string }) => x.id === id);
  if (!r) throw new Error(`no rule ${id} — did a rule get renamed instead of deleted?`);
  return r;
};

describe('audit-claims · bundle-deployment', () => {
  const r = rule('bundle-deployment');

  it.each([
    'Deploying bundles to client agents',
    'Pro lets you deploy a bundle into an agent you operate.',
    'Bundles you deploy stay in sync.',
  ])('fires on the reintroduction shape: %s', (s) => {
    expect(firesOn(r, s)).toBe(true);
  });

  it.each([
    'A composite loop deploys to a fleet member and reports pass or fail.',
    'LoopSkill never pushes a bundle; the agent pulls it.',
    'A bundle is a manifest — a list of skill slugs at pinned versions.',
  ])('stays silent on the true sentence beside it: %s', (s) => {
    expect(firesOn(r, s)).toBe(false);
  });

  it('is NOT rescued by naming a loop in a sentence that also names a bundle', () => {
    expect(firesOn(r, 'Deploy loops and bundles to every client.')).toBe(true);
  });
});

describe('audit-claims · fleet-push', () => {
  const r = rule('fleet-push');

  it.each([
    'Push them straight into clients agents.',
    'A curated set you deploy and sync to a whole fleet',
    'Roll out a cookbook to every agent you run.',
  ])('fires on: %s', (s) => {
    expect(firesOn(r, s)).toBe(true);
  });

  it.each([
    'A loop is placed on a fleet member by the agent that polls for it.',
    'Nothing is pushed to a fleet — agents converge by polling every 30 minutes.',
  ])('stays silent on: %s', (s) => {
    expect(firesOn(r, s)).toBe(false);
  });
});

describe('audit-claims · roi-metric (D-019 stays deleted)', () => {
  const r = rule('roi-metric');

  it.each(['cost per accepted change', 'cost_per_accepted_change', 'Cost per change: $0.42'])(
    'fires on: %s',
    (s) => expect(firesOn(r, s)).toBe(true)
  );

  it('has no exoneration clause — this metric is hidden in ANY wording', () => {
    expect(r.exonerations).toBeUndefined();
    expect(firesOn(r, 'We do not show cost per accepted change.')).toBe(true);
  });
});

describe('audit-claims · the push rules, exoneration boundaries', () => {
  const bundleRule = rule('bundle-deployment');
  const pushRule = rule('fleet-push');

  it('lets the required disclosure through — the gate must not punish its own demand', () => {
    expect(firesOn(bundleRule, 'LoopSkill never deploys a bundle for you; the agent pulls it.')).toBe(
      false
    );
    expect(firesOn(pushRule, 'Nothing is pushed to a fleet.')).toBe(false);
  });

  it('is NOT fooled by "only", which negates nothing', () => {
    expect(firesOn(pushRule, 'Deploy a cookbook to every agent, only on Pro.')).toBe(true);
  });

  it('pins the residual hole rather than pretending it is closed', () => {
    // A fragment that negates one push verb and asserts another slips through.
    // Documented in scripts/audit-claims.mjs; closing it needs a parser.
    expect(firesOn(pushRule, 'You never push — we deploy the bundle to every client agent.')).toBe(
      false
    );
  });
});

describe('audit-claims · fast-sync', () => {
  const r = rule('fast-sync');

  it.each(['Fast sync across your fleet', 'Sync is instant.', 'Real-time sync included.'])(
    'fires on: %s',
    (s) => expect(firesOn(r, s)).toBe(true)
  );

  it('stays silent when the interval is stated instead of an adjective', () => {
    expect(firesOn(r, 'Agents sync on a 30-minute poll.')).toBe(false);
  });

  it('does not punish its own required disclosure', () => {
    expect(firesOn(r, 'Sync is not instant — it is a 30-minute poll.')).toBe(false);
  });
});

describe('audit-claims · loops-on-any-host', () => {
  const r = rule('loops-on-any-host');

  it('fires on the cross-vendor loop claim', () => {
    expect(firesOn(r, 'Run loops on any agent host.')).toBe(true);
  });

  it('stays silent on the honest denial', () => {
    expect(firesOn(r, 'Loops do not run on every host — the loop path is Hermes-only.')).toBe(
      false
    );
  });
});

describe('audit-claims · automatic-telemetry', () => {
  const r = rule('automatic-telemetry');

  it('fires on the automatic-telemetry claim', () => {
    expect(firesOn(r, 'Loop runs report telemetry automatically.')).toBe(true);
  });

  it('stays silent on the honest denial', () => {
    expect(firesOn(r, 'Telemetry is not automatic — the loop must emit its own run.')).toBe(false);
  });
});

describe('audit-claims · defect-routing-unconditional', () => {
  const r = rule('defect-routing-unconditional');

  it.each([
    "A defect from a client's agent routes straight back to your private repo.",
    'Bug reports land in your private repository.',
  ])('fires on the unconditional promise: %s', (s) => {
    expect(firesOn(r, s)).toBe(true);
  });

  it.each([
    "When the report carries bundle provenance, a defect routes to your private repo; without it, it goes to the public default repo.",
    'Defects route to your private repo if you set a feedback repo on the bundle.',
  ])('stays silent once the condition is stated: %s', (s) => {
    expect(firesOn(r, s)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The gates, run against the real build. These are the checks that would
// have caught the apex's dead links and the bundle-deployment copy.
// ─────────────────────────────────────────────────────────────────────────

const built = existsSync(DIST);
const describeBuilt = built ? describe : describe.skip;
if (!built) {
  // eslint-disable-next-line no-console
  console.warn('dist/ absent — skipping the built-surface guards. Run `npm run build` first.');
}

describeBuilt('built surface · every internal link resolves', () => {
  it('audit-links passes on dist/', async () => {
    const { execFileSync } = await import('child_process');
    execFileSync('node', [join(ROOT, 'scripts/audit-links.mjs'), DIST], { stdio: 'pipe' });
  });
});

describeBuilt('built surface · no false claim survives to a rendered page', () => {
  it('audit-claims passes on dist/', async () => {
    const { execFileSync } = await import('child_process');
    execFileSync('node', [join(ROOT, 'scripts/audit-claims.mjs'), DIST], { stdio: 'pipe' });
  });
});
