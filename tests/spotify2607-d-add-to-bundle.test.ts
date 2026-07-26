/**
 * spotify_2607 Phase D — "Add to bundle" verb generalized to skills,
 * personalities and loops, and mounted on browse.astro / home.astro cards.
 *
 * Deletion pass (musk-5-step, per plan §3 Phase D #1): AddToCookbook.astro
 * (72 lines) + AddToCookbookScript.astro (195 lines) already existed and
 * already handled externalSource for skills. We do NOT build a second
 * picker. What was missing:
 *   1. The picker was never mounted on /browse or /home cards at all (only
 *      on /skills/[slug] and /skills/external) — that's the primary Phase D
 *      gap this sprint closes.
 *   2. AddToCookbookScript's addSkill() only ever POSTed to
 *      /api/cookbooks/{id}/skills — personalities and loops need their own
 *      routes (add_personality_to_cookbook / add_loop_to_cookbook,
 *      loopskill-api PR #145). addToCookbookControl.ts's
 *      resolveAddRequest() is the new routing logic; NOT a second picker.
 *
 * DELIBERATELY NOT BUILT: adding a bundle to a bundle. There is no API route
 * for it (Phase C only wired personalities/loops/skills into bundle_routes.py)
 * and no plan requirement asks for it — a bundle card gets the heart (=
 * follow) but never the "Add to bundle" picker. Pinned by
 * isBundleable('bundles') === false below.
 */
import {
  toAtcType,
  isBundleable,
  resolveAddRequest,
  type AtcArtifactType,
} from '../src/lib/addToCookbookControl';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const BROWSE = join(ROOT, 'src', 'pages', 'browse.astro');
const HOME = join(ROOT, 'src', 'pages', 'home.astro');
const ATC_SCRIPT = join(ROOT, 'src', 'components', 'AddToCookbookScript.astro');

describe('toAtcType / isBundleable', () => {
  it('maps skills (both tags) to "skill"', () => {
    expect(toAtcType('skills')).toBe('skill');
    expect(toAtcType('skill')).toBe('skill');
  });

  it('maps personalities (both tags) to "personality"', () => {
    expect(toAtcType('personalities')).toBe('personality');
    expect(toAtcType('personality')).toBe('personality');
  });

  it('maps loops (both tags) to "loop"', () => {
    expect(toAtcType('loops')).toBe('loop');
    expect(toAtcType('loop')).toBe('loop');
  });

  it('bundles are NOT bundleable — no API route to add a bundle to a bundle', () => {
    expect(toAtcType('bundles')).toBeNull();
    expect(toAtcType('bundle')).toBeNull();
    expect(isBundleable('bundles')).toBe(false);
  });

  it('unknown types are not bundleable', () => {
    expect(toAtcType('widgets')).toBeNull();
    expect(isBundleable('widgets')).toBe(false);
  });

  it('skills/personalities/loops are all bundleable', () => {
    expect(isBundleable('skills')).toBe(true);
    expect(isBundleable('personalities')).toBe(true);
    expect(isBundleable('loops')).toBe(true);
  });
});

describe('resolveAddRequest — per-type route shapes', () => {
  it('skill: POSTs /skills with {slug} body', () => {
    const req = resolveAddRequest('skill', 'my-skill');
    expect(req.path).toBe('/skills');
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ slug: 'my-skill' });
  });

  it('skill with an external source: body carries external_source', () => {
    const req = resolveAddRequest('skill', 'ponytail', 'skills-sh');
    expect(req.body).toEqual({ slug: 'ponytail', external_source: 'skills-sh' });
  });

  it('personality: POSTs /personalities/{slug} with NO body', () => {
    const req = resolveAddRequest('personality', 'blunt-editor');
    expect(req.path).toBe('/personalities/blunt-editor');
    expect(req.method).toBe('POST');
    expect(req.body).toBeNull();
  });

  it('loop: POSTs /loops/{slug} with NO body', () => {
    const req = resolveAddRequest('loop', 'nightly-digest');
    expect(req.path).toBe('/loops/nightly-digest');
    expect(req.body).toBeNull();
  });

  it('encodes slugs with special characters in the path (personality/loop routes)', () => {
    const req = resolveAddRequest('personality', 'a slug/with stuff');
    expect(req.path).toBe('/personalities/a%20slug%2Fwith%20stuff');
  });
});

// ── Wiring: the picker is actually MOUNTED on browse/home cards ────────────

describe('portal wiring — Add to bundle mounted on browse.astro cards', () => {
  const browse = existsSync(BROWSE) ? readFileSync(BROWSE, 'utf-8') : '';

  it('renders an atc picker as a SIBLING inside .artifact-slot, never nested in the <a>', () => {
    // The exact trap the heart hit (plan §3 Phase D #2): a <button> inside an
    // <a> is invalid HTML and breaks keyboard activation. Assert the final
    // `.artifact-slot` template string closes the card <a> BEFORE calling
    // the atc picker renderer — i.e. `${card}...${atcPickerHTML(...)}` with
    // `card` itself ending in `</a>`, never `${atcPickerHTML(...)}` emitted
    // inside the card's own template literal.
    expect(browse).toMatch(/data-atc-root/);
    expect(browse).toMatch(/<div class="artifact-slot">\$\{card\}\$\{likeButtonHTML\(type, item\)\}\$\{atcPickerHTML\(type, item\)\}<\/div>/);
  });

  it('gates the atc picker on isBundleable — bundle cards never render one', () => {
    expect(browse).toMatch(/isBundleable\(type/);
  });

  it('wires the freshly-rendered pickers after every render (window.__atcWire)', () => {
    expect(browse).toContain('__atcWire');
  });

  it('includes AddToCookbookScript once', () => {
    expect(browse).toContain('AddToCookbookScript');
  });
});

describe('portal wiring — Add to bundle mounted on home.astro shelves', () => {
  const home = existsSync(HOME) ? readFileSync(HOME, 'utf-8') : '';

  it('renders an atc picker for bundleable shelf items', () => {
    expect(home).toMatch(/data-atc-root|atcButtonHTML/);
  });

  it('includes AddToCookbookScript once', () => {
    expect(home).toContain('AddToCookbookScript');
  });
});

// ── AddToCookbookScript.astro: generalized addArtifact routing ────────────

describe('AddToCookbookScript.astro routes personalities/loops to their own endpoints', () => {
  const script = existsSync(ATC_SCRIPT) ? readFileSync(ATC_SCRIPT, 'utf-8') : '';

  it('reads data-atc-type off the button', () => {
    expect(script).toContain('data-atc-type');
  });

  it('posts to /personalities/{slug} for a personality button', () => {
    expect(script).toMatch(/\/personalities\/'\s*\+\s*encodeURIComponent\(slug\)|personalities\/\$\{/);
  });

  it('posts to /loops/{slug} for a loop button', () => {
    expect(script).toMatch(/\/loops\/'\s*\+\s*encodeURIComponent\(slug\)|loops\/\$\{/);
  });

  it('still handles the skill external_source body shape unchanged', () => {
    expect(script).toContain('external_source');
  });
});
