/**
 * Display labels for tier slugs. Single source of truth on the portal side.
 *
 * Phase 5 (RCP-INCIDENT-2026-05-11): DB now uses `pro` / `pro_plus` / `free` slugs.
 * Legacy slugs `cook`, `operator`, `studio` are kept as shims until 2026-06-10.
 * The user-facing brand says `Pro` / `Pro+` / `Free`.
 *
 * Mirror of wiserecipes-api/config/tiers.yaml (display_name field).
 * If you change a label here, update the yaml AND the API helper too:
 *   - wiserecipes-api/config/tiers.yaml
 *   - wiserecipes-api/app/tier_labels.py
 */

export function tierBadgeText(slug: string | null | undefined): string {
  const s = (slug || 'pro').toLowerCase();
  if (s === 'free') return 'FREE';
  if (s === 'pro_plus' || s === 'operator' || s === 'studio') return 'PRO+';
  return 'PRO';  // pro, cook + anything unknown defaults to Pro
}

/** @deprecated Use tierBadgeText instead */
export function tierBadge(slug: string | null | undefined): string {
  return tierBadgeText(slug);
}

export function tierLabel(slug: string | null | undefined): string {
  const s = (slug || 'pro').toLowerCase();
  if (s === 'free') return 'Free';
  if (s === 'pro_plus' || s === 'operator' || s === 'studio') return 'Pro+';
  return 'Pro';
}

export function tierBadgeClass(slug: string | null | undefined): string {
  const s = (slug || 'pro').toLowerCase();
  if (s === 'free') return 'badge-free';
  if (s === 'pro_plus' || s === 'operator' || s === 'studio') return 'badge-pro-plus';
  return 'badge-pro';
}
