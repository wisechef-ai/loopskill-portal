/**
 * spotify_2607 Phase D — one-click bundle visibility control.
 *
 * bundles/view.astro is the bundle detail page (the click-through from
 * Library). PATCH /api/cookbooks/{id}/visibility already existed
 * (portal_0610 J2) but was only ever called from ONE buried spot — the
 * inline "New bundle" composer panel in library.astro. This is the first
 * time the control appears on the bundle's OWN page, legible and one-click,
 * per plan §3 Phase D #4/#5/#6.
 *
 * A dependency gap was found and fixed in loopskill-api while building this:
 * GET /api/cookbooks/{id} (the route this page already calls) never carried
 * `visibility` or `slug` — only the public-surface serializer did. Without
 * that fix this page has no way to render CURRENT state. See
 * loopskill-api PR (fix(bundles): expose visibility+slug on owner-facing
 * cookbook read routes).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  visibilityLabel,
  otherVisibility,
  shareUrl,
  privacyWarningMessage,
} from '../src/lib/bundleVisibility';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const VIEW = join(ROOT, 'src', 'pages', 'bundles', 'view.astro');

describe('visibilityLabel / otherVisibility', () => {
  it('labels public and private correctly', () => {
    expect(visibilityLabel('public')).toBe('Public');
    expect(visibilityLabel('private')).toBe('Private');
  });

  it('defaults anything else (including null/undefined) to Private', () => {
    // server_default is 'private' — an absent/unknown value must never read
    // as Public (the illegible-state bug this sprint fixes).
    expect(visibilityLabel(null)).toBe('Private');
    expect(visibilityLabel(undefined)).toBe('Private');
    expect(visibilityLabel('')).toBe('Private');
    expect(visibilityLabel('weird')).toBe('Private');
  });

  it('flips to the other state', () => {
    expect(otherVisibility('public')).toBe('private');
    expect(otherVisibility('private')).toBe('public');
    expect(otherVisibility(null)).toBe('public'); // currently-private (default) flips to public
  });
});

describe('shareUrl', () => {
  it('builds the public bundle permalink from a slug', () => {
    expect(shareUrl('dev-essentials')).toBe('https://app.loopskill.io/bundles/p?slug=dev-essentials');
  });

  it('returns null for a slug-less bundle (should not happen post fix/bundle-slug-on-create, but never throw)', () => {
    expect(shareUrl(null)).toBeNull();
    expect(shareUrl(undefined)).toBeNull();
    expect(shareUrl('')).toBeNull();
  });

  it('URL-encodes special characters in the slug', () => {
    expect(shareUrl('a slug')).toBe('https://app.loopskill.io/bundles/p?slug=a%20slug');
  });
});

describe('privacyWarningMessage', () => {
  it('names the concrete share link that will break', () => {
    const msg = privacyWarningMessage('dev-essentials');
    expect(msg).toContain('https://app.loopskill.io/bundles/p?slug=dev-essentials');
    expect(msg.toLowerCase()).toContain('private');
    expect(msg.toLowerCase()).toContain('break');
  });

  it('degrades gracefully with no slug', () => {
    const msg = privacyWarningMessage(null);
    expect(msg.toLowerCase()).toContain('break');
  });
});

// ── Wiring: the toggle is actually mounted on bundles/view.astro ──────────

describe('portal wiring — one-click visibility control on bundles/view.astro', () => {
  const view = existsSync(VIEW) ? readFileSync(VIEW, 'utf-8') : '';

  it('renders a visibility control element in static HTML', () => {
    expect(view).toMatch(/id="cb-visibility"|id="cb-vis-toggle"/);
  });

  it('calls PATCH .../visibility to flip state', () => {
    expect(view).toContain('/visibility');
    expect(view).toMatch(/method:\s*'PATCH'/);
  });

  it('renders current state from the cookbook detail response (visibility field)', () => {
    // This is exactly the dependency gap: the page must read cb.visibility
    // off the SAME response it already fetches (GET /api/cookbooks/{id}),
    // not a separate call.
    expect(view).toMatch(/cb\.visibility|data\.visibility/);
  });

  it('surfaces a share link immediately on publish (going public)', () => {
    expect(view).toMatch(/share|Share/);
    // The URL-building logic lives in bundleVisibility.ts's shareUrl() (tested
    // above); this page must actually call it and render the result.
    expect(view).toMatch(/shareUrl\(/);
    expect(view).toContain('cb-share-url');
  });

  it('warns before flipping a public bundle to private', () => {
    expect(view).toMatch(/privacyWarningMessage|confirm\(/);
  });

  it('new-bundle creation defaults to private (§0 #4) — server_default is respected, not overridden client-side', () => {
    // The page must not force visibility to 'public' anywhere on load —
    // absence of any such call is the actual assertion here.
    expect(view).not.toMatch(/visibility['"]?\s*:\s*['"]public['"]/);
  });
});
