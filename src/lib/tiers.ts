/**
 * Display labels for tier slugs. Single source of truth on the portal side.
 *
 * The DB uses `cook` / `operator` / `free` / `studio` slugs (immutable contract).
 * The user-facing brand says `Pro` / `Pro+` / `Free`.
 *
 * Mirror of wiserecipes-api/config/tiers.yaml (display_name field).
 * If you change a label here, update the yaml AND the API helper too:
 *   - wiserecipes-api/config/tiers.yaml
 *   - wiserecipes-api/app/tier_labels.py
 */

export function tierBadge(slug: string | null | undefined): string {
  const s = (slug || 'cook').toLowerCase();
  if (s === 'free') return 'FREE';
  if (s === 'operator' || s === 'studio') return 'PRO+';
  return 'PRO';  // cook + anything unknown defaults to Pro
}

export function tierLabel(slug: string | null | undefined): string {
  const s = (slug || 'cook').toLowerCase();
  if (s === 'free') return 'Free';
  if (s === 'operator' || s === 'studio') return 'Pro+';
  return 'Pro';
}

export function tierBadgeClass(slug: string | null | undefined): string {
  const s = (slug || 'cook').toLowerCase();
  if (s === 'free') return 'badge-free';
  if (s === 'operator' || s === 'studio') return 'badge-studio';
  return 'badge-pro';
}
