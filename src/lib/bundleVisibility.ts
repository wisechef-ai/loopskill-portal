/**
 * bundleVisibility.ts — spotify_2607 Phase D: one-click bundle visibility.
 *
 * Pure helpers for the Private ⇄ Public toggle mounted on bundles/view.astro
 * (the bundle detail page, the click-through from Library — plan §3 Phase D
 * #4/#5/#6). New bundles already default to private server-side
 * (Bundle.visibility server_default='private', models.py) — this module is
 * strictly about the OWNER-FACING one-click flip + its legibility.
 *
 * Deletion pass: `PATCH /api/cookbooks/{id}/visibility` already exists
 * (bundle_routes.py set_cookbook_visibility, portal_0610 J2) and is already
 * called from ONE buried composer flow (library.astro's inline "New bundle"
 * panel). No new backend route needed — this only makes the control legible
 * and one-click on the bundle's own detail surface, where it was previously
 * absent entirely.
 */

export type Visibility = 'private' | 'public';

export function visibilityLabel(vis: string | null | undefined): 'Private' | 'Public' {
  return vis === 'public' ? 'Public' : 'Private';
}

/** The other state a one-click toggle would flip to. */
export function otherVisibility(vis: string | null | undefined): Visibility {
  return vis === 'public' ? 'private' : 'public';
}

/** Public share URL for a bundle. Only meaningful once the bundle has a slug
 * (assigned at creation per fix/bundle-slug-on-create — every bundle has one
 * from birth, public or not). */
export function shareUrl(slug: string | null | undefined, origin = 'https://app.loopskill.io'): string | null {
  if (!slug) return null;
  return `${origin}/bundles/p?slug=${encodeURIComponent(slug)}`;
}

/**
 * Warning shown before flipping a PUBLIC bundle to PRIVATE (plan §3 Phase D
 * #4: "a plain warning that going private breaks existing links"). Anyone
 * holding the /bundles/p?slug=... link gets a 404 the moment this happens —
 * say so plainly, don't bury it.
 */
export function privacyWarningMessage(slug: string | null | undefined): string {
  const url = shareUrl(slug);
  return url
    ? `Making this bundle private will break its share link (${url}) — anyone who has it will get a "not found" page. Continue?`
    : 'Making this bundle private will break its share link — anyone who has it will get a "not found" page. Continue?';
}
