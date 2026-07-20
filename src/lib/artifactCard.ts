/**
 * ArtifactCard — the ONE card system shared by Home shelves and the Browse
 * grid (council report §2/§3/§8 — "the first PR must introduce a single
 * ArtifactCard / shelf pattern or the redesign will preserve the same
 * scattered feeling under new labels").
 *
 * Home shelves and Browse results are both LIVE, client-fetched data (see
 * AGENTS.md build-time-fetch-ban + the existing /loops, /bundles,
 * /personalities pattern) — so this is a plain TS render function rather
 * than an .astro component. Astro components can't render client-fetched
 * data without becoming an island; a shared string-returning function that
 * both pages import is the actually-one implementation the council
 * kill-test cares about, not the file extension.
 *
 * Visual contract lives in src/styles/global.css under the "ArtifactCard"
 * block: cover 1:1 radius 8 bg #161616, title 14/18 w700 2-line clamp, meta
 * 12/16 muted 1-line, hover lift -2px + gold border 40% + gold title, focus
 * 2px gold outline offset 3px.
 */

export type ArtifactType = 'loop' | 'skill' | 'bundle' | 'personality';

export interface ArtifactItem {
  slug: string;
  title: string;
  meta?: string;       // 1-line metadata (shelf + grid)
  description?: string; // 2-line description (grid/search mode only)
  href: string;
}

import { identiconSVG } from './identicon';

const TYPE_BADGE: Record<ArtifactType, string> = {
  loop: 'Loop',
  skill: 'Skill',
  bundle: 'Bundle',
  personality: 'Personality',
};

// Deterministic slug -> gradient (same idea as SkillCover, kept independent
// so ArtifactCard has no dependency on the .astro component tree).
const GRAD_PALETTE: [string, string][] = [
  ['#1fb6c0', '#0d7d77'],
  ['#a06bff', '#6d28d9'],
  ['#c084fc', '#7c3aed'],
  ['#ffb446', '#c2410c'],
  ['#ff6e50', '#b91c1c'],
  ['#34d399', '#0f766e'],
  ['#60a5fa', '#1d4ed8'],
];
function hashIdx(s: string, n: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}
function esc(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
}

/**
 * Render one ArtifactCard as an HTML string.
 * @param variant 'shelf' (fixed width, 1-line meta only) or 'grid' (Browse,
 *   allows a 2-line description underneath the meta line).
 */
export function artifactCardHTML(type: ArtifactType, item: ArtifactItem, variant: 'shelf' | 'grid' = 'shelf'): string {
  const grad = GRAD_PALETTE[hashIdx(item.slug || item.title || 'x', GRAD_PALETTE.length)];
  const mono = ((item.title || item.slug || 'L').trim()[0] || 'L').toUpperCase();
  const ariaLabel = `${TYPE_BADGE[type]}: ${item.title}${item.meta ? '. ' + item.meta : ''}`;
  const descHtml = variant === 'grid' && item.description
    ? `<span class="artifact-desc">${esc(item.description)}</span>`
    : '';
  return `<a href="${esc(item.href)}" class="artifact-card" data-artifact-type="${type}" data-artifact-slug="${esc(item.slug)}" aria-label="${esc(ariaLabel)}">
    <span class="artifact-cover" style="background:linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%);">
      ${identiconSVG(item.slug || item.title || 'loopskill')}
      <span class="artifact-badge">${TYPE_BADGE[type]}</span>
      <span class="artifact-mono" aria-hidden="true">${esc(mono)}</span>
    </span>
    <span class="artifact-title">${esc(item.title)}</span>
    ${item.meta ? `<span class="artifact-meta">${esc(item.meta)}</span>` : ''}
    ${descHtml}
  </a>`;
}

/** Type-specific metadata line builder (council §2 "Metadata by type"). */
export function artifactMeta(type: ArtifactType, raw: any): string {
  switch (type) {
    case 'loop': {
      // atomic-habits 2026-07-20 rank-8 REVENUE/CATALOG: kept in sync with the
      // browse.astro inline artifactMeta() — see that file's comment for the
      // "Battle-tested" trust-line rationale (empty ratings, real run_count).
      const runs = raw.run_count || 0;
      return runs > 0 ? `Battle-tested · ${runs} run${runs === 1 ? '' : 's'}` : 'Not yet run';
    }
    case 'skill': {
      const installs = raw.install_count_total || raw.install_count || 0;
      const cat = raw.category ? String(raw.category) : '';
      if (installs > 0 && cat) return `${cat} · ${installs.toLocaleString()} installs`;
      if (installs > 0) return `${installs.toLocaleString()} installs`;
      return cat || '';
    }
    case 'bundle': {
      const n = raw.skill_count;
      return typeof n === 'number' ? `${n} skill${n === 1 ? '' : 's'}` : '';
    }
    case 'personality': {
      return raw.source || raw.role || raw.category || '';
    }
    default:
      return '';
  }
}
