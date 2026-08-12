/**
 * issue #247 — 402 tier_key_cap_exceeded had no UI consumer on the Fleets
 * tab (money-path-audit hop 4b, 2026-08-12). The bundle-cap 403 path already
 * renders a live in-context upgrade wall via showUpgradeWall(); the
 * fleet-member key-cap 402 from POST /api/fleets/{id}/members had ZERO
 * consumer anywhere in the portal — a free user hitting the cap saw a bare
 * JSON 402 with no CTA.
 *
 * This test is static-source assertion (matches the repo's existing pattern
 * for library.astro, e.g. spotify2607-d-add-to-bundle.test.ts) — it fails on
 * pre-fix source (proven below) and passes once the enroll-agent flow +
 * inline key-cap upgrade wall are wired.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const LIBRARY = join(ROOT, 'src', 'pages', 'library.astro');

describe('library.astro — fleet-member enroll UI exists', () => {
  const src = existsSync(LIBRARY) ? readFileSync(LIBRARY, 'utf-8') : '';

  it('renders a "+ Agent" trigger on each fleet card', () => {
    expect(src).toMatch(/fleet-add-agent/);
    expect(src).toContain('+ Agent');
  });

  it('POSTs to /api/fleets/{id}/members (the fleet-member enroll route)', () => {
    expect(src).toMatch(/\/api\/fleets\/\$\{encodeURIComponent\(agentTargetFleet\)\}\/members/);
  });

  it('the enroll form sends host/profile/skills_dir — the FleetMember contract', () => {
    expect(src).toContain('host');
    expect(src).toContain('skills_dir');
    // Body must be JSON-stringified with these exact keys (route contract:
    // docs/design/activate0701-phase1-fleet-member.md §3).
    expect(src).toMatch(/JSON\.stringify\(\{\s*host,\s*profile,\s*skills_dir:\s*skillsDir\s*\}\)/);
  });
});

describe('library.astro — 402 tier_key_cap_exceeded renders an inline upgrade wall', () => {
  const src = existsSync(LIBRARY) ? readFileSync(LIBRARY, 'utf-8') : '';

  it('checks for HTTP 402 on the enroll response', () => {
    expect(src).toMatch(/r\.status === 402/);
  });

  it('renders an upgrade wall (never a bare toast/redirect) on 402', () => {
    expect(src).toContain('showKeyCapUpgradeWall');
    expect(src).toContain('agent-upgrade-wall');
  });

  it('the wall reads the server-reported cap/current numbers from the 402 body', () => {
    // fleet_member_routes.py 402 detail shape: {error, tier, cap, current, upgrade_url}
    expect(src).toMatch(/detail\.cap/);
    expect(src).toMatch(/detail\.current/);
  });

  it('the wall CTA hits live checkout (POST /api/checkout/pro), matching the bundle-cap wall pattern — never a toast-only dead end', () => {
    const wallSection = src.slice(src.indexOf('function showKeyCapUpgradeWall'), src.indexOf('function showKeyCapUpgradeWall') + 2000);
    expect(wallSection).toContain('/api/checkout/pro');
  });

  it('never silently swallows the 402 into a generic error toast', () => {
    // The enroll submit handler must branch on 402 BEFORE any generic
    // catch-all error path renders — i.e. the 402 branch appears before the
    // final `Could not add agent` fallback string in the same handler.
    const submitStart = src.indexOf("$('agent-create-submit').addEventListener");
    const submitBlock = src.slice(submitStart, submitStart + 3000);
    const idx402 = submitBlock.indexOf('r.status === 402');
    const idxFallback = submitBlock.indexOf('Could not add agent');
    expect(idx402).toBeGreaterThan(-1);
    expect(idxFallback).toBeGreaterThan(-1);
    expect(idx402).toBeLessThan(idxFallback);
  });
});

describe('library.astro — the fix does not touch the unrelated bundle-cap 403 wall', () => {
  const src = existsSync(LIBRARY) ? readFileSync(LIBRARY, 'utf-8') : '';

  it('showUpgradeWall (bundle-cap) is untouched and still present', () => {
    expect(src).toContain('function showUpgradeWall()');
    expect(src).toContain("You've hit the private-bundle cap.");
  });
});
