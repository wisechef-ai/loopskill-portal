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

// ── MUST-FIX 3 (Codex R1, verified) — the toggle must never fail silently ──

describe('MUST-FIX 3 — bundles/view.astro visibility toggle never fails silently', () => {
  const view = existsSync(VIEW) ? readFileSync(VIEW, 'utf-8') : '';

  it('renders a user-visible error surface for the toggle', () => {
    expect(view).toContain('cb-vis-error');
  });

  it('the old silent `if (!res.ok) { return; }` pattern is gone', () => {
    expect(view).not.toMatch(/if\s*\(!res\.ok\)\s*\{\s*return;\s*\}\s*\/\/\s*best-effort/);
  });

  it('handles a network throw with a visible error and state restoration', () => {
    expect(view).toMatch(/catch\s*\(e:\s*any\)\s*\{[\s\S]{0,200}showVisError/);
  });

  it('handles 401 with a session-expiry message and redirect, not a silent no-op', () => {
    expect(view).toMatch(/res\.status === 401\)\s*\{[\s\S]{0,300}showVisError/);
    expect(view).toMatch(/res\.status === 401\)\s*\{[\s\S]{0,400}signin\?next=/);
  });

  it('handles 403 with a permission message', () => {
    expect(view).toMatch(/res\.status === 403\)\s*\{[\s\S]{0,200}showVisError/);
  });

  it('handles any other non-2xx with a visible error', () => {
    expect(view).toMatch(/if\s*\(!res\.ok\)\s*\{[\s\S]{0,200}showVisError/);
  });

  it('R2 (Codex): does not silently commit to \'private\' when the 2xx body carries an unexpected or missing visibility value', () => {
    // The regression Codex R2 caught: `(d && d.visibility === 'public') ? 'public' : 'private'`
    // treats `{}`, `null`, or a garbage value as confirmation of 'private'.
    // The fix requires an EXACT match on 'public' OR 'private' before
    // committing, and takes the error path otherwise.
    expect(view).not.toMatch(/currentVis\s*=\s*\(d\s*&&\s*d\.visibility\s*===\s*'public'\)\s*\?\s*'public'\s*:\s*'private';/);
    expect(view).toMatch(/returnedVis\s*!==\s*'public'\s*&&\s*returnedVis\s*!==\s*'private'/);
  });

  it('every failure branch restores the toggle via paintVisibility, never leaving stale UI', () => {
    // Count paintVisibility( calls inside the handler body — should appear
    // on every exit path (network throw, 401, 403, generic !ok, malformed
    // JSON, unexpected value, AND the success path) = at least 6.
    const handlerStart = view.indexOf("const handler = (target:");
    const handlerEnd = view.indexOf('btnPrivate.addEventListener', handlerStart);
    const handlerBody = view.slice(handlerStart, handlerEnd);
    const paintCalls = (handlerBody.match(/paintVisibility\(cb\.slug\)/g) || []).length;
    expect(paintCalls).toBeGreaterThanOrEqual(6);
  });
});

// ── SHOULD-FIX 6 (Codex R1) — no duplicate listener stacking ───────────────

describe('SHOULD-FIX 6 — setupVisibility does not stack duplicate listeners', () => {
  const view = existsSync(VIEW) ? readFileSync(VIEW, 'utf-8') : '';

  it('guards re-entry with a wired-once flag', () => {
    expect(view).toMatch(/visibilityWired/);
  });
});
