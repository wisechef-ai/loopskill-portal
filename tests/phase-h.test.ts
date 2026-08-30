/**
 * Phase H — Portal bugs 1-4 tests (TDD-first)
 *
 * Bug 1: Nav Creators→Referrals indirection
 * Bug 2: /referrals server-side auth state
 * Bug 3: Integration emoji → SVG icons
 * Bug 4: Hero spotlight live API fetch (no hardcoded 404 skills)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const SRC  = join(ROOT, 'src');
const PUBLIC = join(ROOT, 'public');

// ---------------------------------------------------------------------------
// Bug 1 — Nav "Creators → Referrals" [REMOVED 2026-07-25]
//
// STALE: src/components/Nav.astro was deleted wholesale in
// onechrome_0611-P3 (commit bab875c, "Base.astro + Nav.astro RETIRED") — the
// entire site now shares src/layouts/AppShell.astro as its one chrome (see
// AGENTS.md "The ONE chrome"). AppShell's primary rail is a deliberately
// small Spotify-model set (Home / Browse / Your Library + a Pro pricing
// pill) and does NOT carry a dedicated Referrals entry; referrals are
// reached via the "Open referrals →" link on /account (see account.astro)
// and the /docs/referrals guide link. The Nav-specific "Creators→Referrals"
// wiring these three tests guarded no longer exists in any form — there is
// no file left to assert against. Removed rather than reassigned to
// AppShell.astro because AppShell intentionally does not carry this link;
// reintroducing an assertion here would be inventing a requirement, not
// pinning current behavior.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bug 1 (compat) — creators.astro still 302-redirects to /referrals
// ---------------------------------------------------------------------------
describe('test_creators_redirect_to_referrals: creators.astro keeps compat redirect', () => {
  const creatorsPath = join(SRC, 'pages/creators.astro');

  it('redirects to /referrals', () => {
    const src = readFileSync(creatorsPath, 'utf-8');
    expect(src).toContain('/referrals');
    expect(src).toMatch(/redirect|302|301/i);
  });

  it('has a compat comment', () => {
    const src = readFileSync(creatorsPath, 'utf-8');
    expect(src).toContain('compat');
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — /referrals auth state
// ---------------------------------------------------------------------------
describe('test_referrals_dashboard_renders_for_authed_user', () => {
  const referralsPath  = join(SRC, 'pages/referrals.astro');
  const dashboardPath  = join(SRC, 'components/ReferralDashboard.astro');

  it('ReferralDashboard.astro component exists', () => {
    expect(existsSync(dashboardPath)).toBe(true);
  });

  it('referrals.astro does a server-side fetch of /api/auth/me', () => {
    const src = readFileSync(referralsPath, 'utf-8');
    expect(src).toContain('/api/auth/me');
    // Must use the cookie header (server-side passthrough)
    expect(src).toContain('cookie');
  });

  it('referrals.astro branches on user: shows dashboard for authed, pitch for anon', () => {
    const src = readFileSync(referralsPath, 'utf-8');
    expect(src).toContain('ReferralDashboard');
    expect(src).toContain('ReferralPitch');
  });

  it('ReferralDashboard shows referral_code and earnings fields', () => {
    const src = readFileSync(dashboardPath, 'utf-8');
    expect(src).toContain('referral_code');
    expect(src).toContain('click_count');
    expect(src).toContain('conversion_count');
  });
});

describe('test_referrals_pitch_renders_for_anon_user', () => {
  const pitchPath = join(SRC, 'components/ReferralPitch.astro');

  it('ReferralPitch.astro component exists', () => {
    expect(existsSync(pitchPath)).toBe(true);
  });

  it('ReferralPitch contains the key pitch copy', () => {
    const src = readFileSync(pitchPath, 'utf-8');
    // Must contain the original hero pitch about 50% revenue share
    expect(src).toContain('50%');
    expect(src).toContain('/signin?mode=signup');
  });
});

// ---------------------------------------------------------------------------
// Bug 3 — Integration marks: wordmarks, not invented glyph SVGs
// (Adam decision, six_a_0829: hand-invented brand glyphs are a trademark/
// credibility risk. Replaced with clean typographic wordmarks — no icons.)
// ---------------------------------------------------------------------------
describe('test_integration_marks_are_wordmarks', () => {
  const ICON_DIR = join(PUBLIC, 'icons/integrations');

  it('icons/integrations directory no longer exists', () => {
    expect(existsSync(ICON_DIR)).toBe(false);
  });

  it('AgentMark.astro no longer exists', () => {
    expect(existsSync(join(SRC, 'components/AgentMark.astro'))).toBe(false);
  });

  it('integrations.astro no longer references icon_path or /icons/integrations/', () => {
    const src = readFileSync(join(SRC, 'pages/integrations.astro'), 'utf-8');
    expect(src).not.toContain('icon_path');
    expect(src).not.toContain('/icons/integrations/');
  });

  it('integrations.astro renders client names as text, not <img> icons', () => {
    const src = readFileSync(join(SRC, 'pages/integrations.astro'), 'utf-8');
    expect(src).not.toContain('<img');
    expect(src).toContain('c.name');
  });

  it('AgentLogos.astro renders agent names as text wordmarks, not AgentMark glyphs', () => {
    const src = readFileSync(join(SRC, 'components/AgentLogos.astro'), 'utf-8');
    expect(src).not.toContain('AgentMark');
    expect(src).toContain('Claude Code');
    expect(src).toContain('Hermes');
  });
});

// ---------------------------------------------------------------------------
// Bug 4 — Hero spotlight: live fetch, no hardcoded web-scraper-pro
// ---------------------------------------------------------------------------
describe('test_hero_spotlight_uses_live_api', () => {
  const indexPath = join(SRC, 'pages/index.astro');

  it('index.astro fetches spotlight from live API endpoint', () => {
    const src = readFileSync(indexPath, 'utf-8');
    expect(src).toContain('/api/skills/search?tier=pro&is_public=true');
    expect(src).toContain('spotlightFallback');
  });

  it('web-scraper-pro is NOT in the spotlight data (was 404)', () => {
    const src = readFileSync(indexPath, 'utf-8');
    // Remove comment lines before checking — web-scraper-pro must not appear in any code/data
    const noComments = src.replace(/\/\/.*$/gm, '');
    expect(noComments).not.toContain('web-scraper-pro');
  });

  it('spotlight uses fetchApi call, not a hardcoded const array', () => {
    const src = readFileSync(indexPath, 'utf-8');
    // Should NOT have the old hardcoded spotlight = [ ... ] block with static objects
    expect(src).not.toMatch(/^const spotlight = \[/m);
    // Should have a let spotlight with live fetch
    expect(src).toMatch(/let spotlight/);
    expect(src).toContain('fetchApi');
  });
});

describe('test_hero_spotlight_falls_back_when_api_down [REVISED 2026-07-05]', () => {
  const indexPath = join(SRC, 'pages/index.astro');

  // STALE (partially): identity-guards fix (2026-07-05, commit present on
  // main) deliberately REMOVED the spotlightFallback hardcoded array. Its
  // own in-repo comment explains why: "the 'spotlightFallback' hardcoded
  // array this used to fall back to was itself fictional/unverifiable
  // against the live catalog and was rendered with real-looking PRO/PRO+
  // tier badges — indistinguishable from genuine catalog data to a
  // visitor... when the API is unreachable at build time, spotlight... is
  // simply empty and the section is omitted — never invented." This is a
  // deliberate honesty fix, not a regression — asserting the old fallback
  // array still exists would be asserting for its own reintroduction.
  it('spotlight has NO fabricated fallback data — omits the section instead when API fails', () => {
    const src = readFileSync(indexPath, 'utf-8');
    // "spotlightFallback" only survives in the removal-rationale comment
    // block now — strip comments before asserting no live fallback array.
    const noComments = src.replace(/\/\/.*$/gm, '');
    expect(noComments).not.toContain('spotlightFallback');
    // The try/catch around the live fetch leaves `spotlight` empty on
    // failure instead of substituting invented data.
    expect(src).toMatch(/let spotlight: SpotlightSkill\[\] = \[\];/);
    expect(src).toContain("} catch {} // Rationale: offline build or API down");
  });

  it('the spotlight section itself is gated on spotlight.length so it is omitted, not faked, when empty', () => {
    const src = readFileSync(indexPath, 'utf-8');
    expect(src).toContain('spotlight.length > 0');
  });
});
