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
// Bug 1 — Nav "Creators → Referrals"
// ---------------------------------------------------------------------------
describe('Bug 1: Nav label and href point directly to /referrals', () => {
  const navPath = join(SRC, 'components/Nav.astro');

  it('test_nav_referrals_label_and_href: desktop nav has Referrals link to /referrals', () => {
    const src = readFileSync(navPath, 'utf-8');
    // Must have a link with href="/referrals" that contains the text "Referrals"
    expect(src).toContain('href="/referrals"');
    expect(src).toContain('>Referrals<');
  });

  it('test_nav_referrals_label_and_href: mobile nav has Referrals link to /referrals', () => {
    const src = readFileSync(navPath, 'utf-8');
    // Ensure at least two occurrences (desktop + mobile)
    const matches = [...src.matchAll(/href="\/referrals"/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('test_nav_referrals_label_and_href: nav no longer links to /creators', () => {
    const src = readFileSync(navPath, 'utf-8');
    // The nav should not have the old /creators link
    expect(src).not.toContain('href="/creators"');
  });
});

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
// Bug 3 — Integration icons: 10 SVG files
// ---------------------------------------------------------------------------
describe('test_integration_icons_all_resolve', () => {
  const ICON_DIR = join(PUBLIC, 'icons/integrations');
  const EXPECTED_ICONS = [
    'hermes.svg',
    'openclaw.svg',
    'claude-code.svg',
    'codex.svg',
    'claude-desktop.svg',
    'cursor.svg',
    'cline.svg',
    'continue.svg',
    'zed.svg',
    'rest.svg',
  ];

  it('icons/integrations directory exists', () => {
    expect(existsSync(ICON_DIR)).toBe(true);
  });

  for (const icon of EXPECTED_ICONS) {
    it(`${icon} exists and is valid SVG`, () => {
      const iconPath = join(ICON_DIR, icon);
      expect(existsSync(iconPath)).toBe(true);
      const content = readFileSync(iconPath, 'utf-8');
      expect(content).toContain('<svg');
      expect(content).toContain('viewBox');
      expect(content).toContain('currentColor');
    });
  }

  it('integrations.astro uses icon_path instead of icon emoji', () => {
    const src = readFileSync(join(SRC, 'pages/integrations.astro'), 'utf-8');
    expect(src).toContain('icon_path');
    expect(src).toContain('/icons/integrations/');
    // Should no longer have raw emoji in the icon field
    expect(src).not.toContain("icon: '🜲'");
    expect(src).not.toContain("icon: '⚙️'");
  });

  it('integrations.astro renders <img> not text emoji for icons', () => {
    const src = readFileSync(join(SRC, 'pages/integrations.astro'), 'utf-8');
    expect(src).toContain('c.icon_path');
    expect(src).not.toContain('{c.icon}');
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

describe('test_hero_spotlight_falls_back_when_api_down', () => {
  const indexPath = join(SRC, 'pages/index.astro');

  it('spotlightFallback exists and contains verified-live skill slugs', () => {
    const src = readFileSync(indexPath, 'utf-8');
    expect(src).toContain('spotlightFallback');
    // Must contain at least one verified fallback slug
    expect(src).toContain('super-memory');
    // web-scraper-pro must not appear in any data (may appear in comments)
    const noComments = src.replace(/\/\/.*$/gm, '');
    expect(noComments).not.toContain('web-scraper-pro');
  });

  it('fallback is used when spotlight is empty', () => {
    const src = readFileSync(indexPath, 'utf-8');
    expect(src).toContain('spotlight.length === 0');
    expect(src).toContain('spotlightFallback');
  });
});
