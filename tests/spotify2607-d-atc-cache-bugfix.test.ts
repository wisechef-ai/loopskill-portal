/**
 * spotify_2607 Phase D — bugfix found while extending the picker.
 *
 * AddToCookbookScript.astro's loadCookbooks() had a variable-name typo:
 *   cookbooks = Array.isArray(data) ? data : (data.cookbooks || data.items || []);
 * — assigning to an undeclared `cookbooks` (implicit global in this
 * `is:inline` non-strict script) instead of the closure variable `bundles`
 * that renderMenu() actually reads. Result: after a successful
 * GET /api/cookbooks, `bundles` stayed `null` forever, so `renderMenu()`
 * always fell into `if (!bundles || bundles.length === 0)` and rendered
 * "No bundles yet" — even for a signed-in user with existing bundles. Adding
 * a NEW bundle still worked (createAndAdd() calls addSkill() directly with
 * the freshly-created id, bypassing the broken `bundles` array), which is
 * why this was easy to miss in a quick manual check, but the picker's
 * PRIMARY listed-bundles path was silently dead.
 *
 * This directly blocks Phase D's acceptance gate ("a catalog skill AND a
 * federated skill each add to a named bundle" implies picking an EXISTING
 * named bundle from the list, not just creating a fresh one every time).
 *
 * RED-proof: this test extracts the loadCookbooks function body via source
 * assertion (the script is `is:inline`, so it can't be imported and unit
 * tested directly — same constraint as the browse.astro heart mirror) and
 * confirms it assigns to `bundles`, not a stray identifier.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SCRIPT = join(ROOT, 'src', 'components', 'AddToCookbookScript.astro');
const src = readFileSync(SCRIPT, 'utf-8');

describe('AddToCookbookScript.astro loadCookbooks() assigns to the right variable', () => {
  it('does NOT assign the fetched list to an undeclared "cookbooks" identifier', () => {
    // The exact typo: `cookbooks = Array.isArray(...)`. Must never reappear.
    expect(src).not.toMatch(/(?<!bundles = )\bcookbooks\s*=\s*Array\.isArray/);
  });

  it('assigns the fetched list to `bundles` — the variable renderMenu() actually reads', () => {
    expect(src).toMatch(/bundles\s*=\s*Array\.isArray\(data\)\s*\?\s*data\s*:\s*\(data\.cookbooks/);
  });
});

describe('AddToCookbookScript.astro — anonymous sign-in never silently no-ops', () => {
  it('routes an anonymous picker open to /signin?next=<here>, never bare /signup', () => {
    expect(src).toContain("'/signin?next='");
    expect(src).not.toContain("'/signup'");
  });
});

describe('AddToCookbookScript.astro — cap 403 uses the inline upgrade wall, never a toast', () => {
  // spotify2607_D MUST-FIX 2 (Codex R1, verified): the original test here
  // asserted "cap 403 shows an inline toast", but AGENTS.md / plan §3 Phase D
  // item 7 requires the free-tier cap to use the INLINE upgrade wall, never a
  // toast or redirect. The prior toast was pre-existing (not introduced by
  // this PR) but the new test LOCKED IT IN as correct — worse than leaving it
  // untested. Fixed: cap 403 now renders inline inside the picker's own
  // `.atc-cap` node (present on every atc-root instance) with a live
  // POST /api/checkout/pro_plus call, mirroring composer.astro's
  // showUpgradeWall() contract but scoped to this picker's own DOM rather
  // than the composer's `#basket-list` (which does not exist on
  // browse/home/skill-detail — showUpgradeWall() itself is not reachable
  // from those pages).
  it('routes the cap reason to the inline showCapWall(), never toast()', () => {
    expect(src).toMatch(/showCapWall\(root\)/);
  });

  it('does NOT toast "Skill cap reached" as the primary cap-403 UI', () => {
    // A toast fallback may still exist for the "no .atc-cap node" defensive
    // branch, but it must not be the FIRST thing the cap path does.
    const capBranch = src.slice(src.indexOf("indexOf('cap') >= 0"), src.indexOf('res.status === 404'));
    expect(capBranch).toMatch(/showCapWall\(root\)/);
  });

  it('the inline wall calls the SAME live checkout endpoint as composer.astro', () => {
    // INVARIANT, not a literal. The original assertion hardcoded
    // '/api/checkout/pro_plus'; when D-003 removed Pro+ from the public ladder
    // and the walls were retargeted to `pro` (2026-08-07), that literal made a
    // CORRECT change fail CI while asserting nothing about the actual contract.
    //
    // What genuinely matters here, and what this now checks:
    //   1. the wall performs a LIVE checkout POST (never a toast/redirect dead end)
    //   2. it targets the SAME tier the composer-page wall targets — the two
    //      must not drift apart
    //   3. it does not sell a tier that is absent from the public ladder
    const atcTier = src.match(/API_BASE \+ '\/api\/checkout\/(\w+)'/)?.[1];
    expect(atcTier, 'AddToCookbookScript must POST a live checkout').toBeTruthy();

    const composerSrc = readFileSync(join(ROOT, 'src/pages/library.astro'), 'utf8');
    const composerTier = composerSrc.match(/fetch\('\/api\/checkout\/(\w+)'/)?.[1];
    expect(composerTier, 'library.astro must POST a live checkout').toBeTruthy();

    expect(atcTier, 'the two upgrade walls must target the same tier').toBe(composerTier);
    expect(atcTier, 'must not sell a tier removed from the public ladder (D-003)').not.toBe('pro_plus');
    expect(src).toMatch(/method:\s*'POST'/);
  });

  it('the inline wall never dead-ends — falls back to a toast pointing at /pricing only on failure', () => {
    expect(src).toContain('Checkout unavailable — try again or use /pricing.');
  });
});
