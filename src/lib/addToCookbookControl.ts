/**
 * addToCookbookControl.ts — spotify_2607 Phase D: the "add to bundle" verb,
 * generalized to skills, personalities and loops (the three artifact types
 * Phase C (loopskill-api PR #145) wired into bundles).
 *
 * NOT bundles-into-bundles: there is no API route for adding a bundle as a
 * member of another bundle (Phase C's bundle_routes.py only adds
 * personalities/loops/skills). A bundle card gets the heart (= follow, per
 * §7 Q3) but never the "Add to bundle" picker — deletion-pass call, recorded
 * in the Phase D PR body.
 *
 * Route shapes differ by artifact type (this is why a pure routing helper
 * exists rather than hand-rolling the URL/body at each call site):
 *   - skill:       POST /api/cookbooks/{id}/skills            body {slug, external_source?}
 *   - personality: POST /api/cookbooks/{id}/personalities/{slug}   (no body)
 *   - loop:        POST /api/cookbooks/{id}/loops/{slug}           (no body)
 * (loopskill-api app/bundle_routes.py add_skill_to_cookbook /
 *  add_personality_to_cookbook / add_loop_to_cookbook)
 *
 * AddToCookbookScript.astro is `is:inline define:vars` (forced Astro
 * is:inline mode — no ESM imports available there, same constraint as
 * browse.astro's heart mirror), so its runtime logic MIRRORS this module
 * rather than importing it. Keep both in sync — see
 * tests/spotify2607-d-add-to-bundle.test.ts's mirror-drift assertions.
 */

/** Card type tags used by browse.astro / home.astro ('skills'|'skill'|...). */
export type CardArtifactType = 'skills' | 'skill' | 'personalities' | 'personality' | 'loops' | 'loop' | 'bundles' | 'bundle';

/** The atc-specific type vocabulary carried in data-atc-type. */
export type AtcArtifactType = 'skill' | 'personality' | 'loop';

/** Normalize any card type tag to the atc vocabulary, or null if not bundleable. */
export function toAtcType(type: CardArtifactType | string | null | undefined): AtcArtifactType | null {
  const t = String(type || '');
  if (t === 'skills' || t === 'skill') return 'skill';
  if (t === 'personalities' || t === 'personality') return 'personality';
  if (t === 'loops' || t === 'loop') return 'loop';
  return null; // bundles (and anything unknown) cannot be added to a bundle
}

/** Whether this artifact type can be added to a bundle (i.e. the picker should render). */
export function isBundleable(type: CardArtifactType | string | null | undefined): boolean {
  return toAtcType(type) !== null;
}

export interface AddRequest {
  path: string; // relative to the cookbook base, e.g. '/skills' or '/personalities/my-slug'
  method: 'POST';
  body: Record<string, unknown> | null; // null = no request body
}

/**
 * Resolve the request shape for adding one artifact to a cookbook.
 * `cookbookId` is intentionally NOT part of the returned path — callers
 * prefix `/api/cookbooks/{cookbookId}` themselves, matching the existing
 * addSkill() call-site convention in AddToCookbookScript.astro.
 */
export function resolveAddRequest(
  atcType: AtcArtifactType,
  slug: string,
  externalSource?: string | null,
): AddRequest {
  if (atcType === 'personality') {
    return { path: `/personalities/${encodeURIComponent(slug)}`, method: 'POST', body: null };
  }
  if (atcType === 'loop') {
    return { path: `/loops/${encodeURIComponent(slug)}`, method: 'POST', body: null };
  }
  // skill (default) — external_source is only meaningful here; personalities
  // and loops have no federated-materialization path in the API today.
  const body: Record<string, unknown> = externalSource ? { slug, external_source: externalSource } : { slug };
  return { path: '/skills', method: 'POST', body };
}
