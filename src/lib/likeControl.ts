/**
 * Like ("heart") control — the Spotify save-to-library affordance on skill cards.
 *
 * ponytail_0724. Adam 2026-07-24: "I want to add skill to favourite but there is
 * no menu similar to spotify on skills". The like BACKEND shipped in liked_0711
 * (POST/DELETE /api/skills/{slug}/like, GET /api/library) but NO portal surface
 * ever called it — zero matches for `api/library|/like` across src/ before this.
 *
 * This module owns the shared behaviour so browse.astro and home.astro cannot
 * drift apart: track-identity minting, optimistic toggle + rollback, liked-state
 * hydration, and repaint after re-render.
 *
 * ── Track identity (get this wrong and every like 404s) ────────────────────────
 * The API's `_resolve_track_identity` accepts two shapes:
 *   - LOCAL catalog skill  → the bare slug            ("my-skill")
 *   - FEDERATED hub skill  → "source__slug"           ("skills-sh__owner--repo--x")
 * The double underscore is the separator the API splits on.
 *
 * ── Markup contract ───────────────────────────────────────────────────────────
 * The card root is an <a>. A <button> nested inside an <a> is invalid HTML and
 * breaks keyboard activation in every browser, so the heart is rendered as a
 * SIBLING of the card inside a positioned `.artifact-slot` wrapper.
 */

export const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

/** Minimal shape the like control needs off an artifact row. */
export interface LikeableItem {
  slug?: string;
  title?: string;
  /** Federation source carried through from GET /api/skills/external. */
  like_source?: string | null;
  source?: string | null;
}

/**
 * Mint the API track identity for an item.
 *
 * Federated items carry a source ("skills-sh", "clawhub", …) and must be
 * addressed as `source__slug`. Local catalog skills use the bare slug. The
 * literal string "local" is treated as local, not as a federation source.
 */
export function likeTrackId(item: LikeableItem): string {
  const src = item && (item.like_source || item.source);
  const slug = (item && item.slug) || '';
  return src && src !== 'local' ? `${src}__${slug}` : slug;
}

/**
 * All four artifact types are likeable (spotify_2607 Phase D). Accepts both
 * the singular and plural tag for each — browse.astro's federated shelf uses
 * the singular 'skill' as a type tag (see artifactHref's comment on that),
 * while the typed group renderers use the plural.
 *
 * The Phase B backend (artifact_like_routes.py) shipped slug-based
 * POST/DELETE /api/{personalities|loops|bundles}/{slug}/like specifically so
 * every card type could carry a heart, not just skills.
 */
const LIKEABLE_TYPES = new Set([
  'skills', 'skill',
  'personalities', 'personality',
  'loops', 'loop',
  'bundles', 'bundle',
]);
export function isLikeable(type: string, item: LikeableItem | null | undefined): boolean {
  const t = String(type || '');
  return LIKEABLE_TYPES.has(t) && !!(item && item.slug);
}

/** Type-specific like endpoint path segment (plural, matching the API routes). */
export function likeEndpointSegment(type: string): string {
  const t = String(type || '');
  if (t === 'personality' || t === 'personalities') return 'personalities';
  if (t === 'loop' || t === 'loops') return 'loops';
  if (t === 'bundle' || t === 'bundles') return 'bundles';
  return 'skills';
}

/** Escape a string for safe interpolation into an HTML attribute or text node. */
function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c],
  );
}

/** Render the heart button, or '' when the item is not likeable. */
export function likeButtonHTML(type: string, item: LikeableItem): string {
  if (!isLikeable(type, item)) return '';
  const name = item.title || item.slug;
  return (
    `<button type="button" class="artifact-like" data-like-id="${esc(likeTrackId(item))}"` +
    ` data-like-type="${esc(likeEndpointSegment(type))}"` +
    ` aria-pressed="false" title="Save to your library"` +
    ` aria-label="Save ${esc(name)} to your library">${HEART_SVG}</button>`
  );
}

/**
 * Rebuild the track identity for a row returned by GET /api/library.
 *
 * The response has TWO skill sources and they are deliberately separate:
 *   - `shelves.skills`    — the DEPLOYABLE Liked bundle. Local catalog skills
 *                           only, each `{id, slug, title, liked_at}` (frozen
 *                           contract; `id` is a UUID). No `source` field.
 *   - `federated_skills`  — hub / skills.sh / ClawHub bookmarks, each
 *                           `{slug, title, source, liked_at}`. No local `id`,
 *                           NOT deployable.
 *
 * A federated row must be keyed `source__slug`; a local shelf row is keyed by
 * its bare slug. This must produce exactly the same string as `likeTrackId`
 * or hydrated state won't match the buttons.
 */
export function libraryRowTrackId(row: {
  slug?: string;
  source?: string | null;
  federated?: boolean;
}): string | null {
  if (!row || !row.slug) return null;
  const src = row.source;
  // `federated` is accepted for forward-compatibility, but presence of a
  // non-"local" `source` is the real discriminator: rows from the
  // `federated_skills` array always carry one, shelf rows never do.
  if ((row.federated || src) && src && src !== 'local') return `${src}__${row.slug}`;
  return row.slug;
}

/**
 * Composite hydration key: ARTIFACT TYPE + track id.
 *
 * MUST-FIX (Codex R1, verified): `likeTrackId()` returns a BARE SLUG for
 * local skills, personalities, loops AND bundles, and the old
 * `likedIdsFromLibrary()` merged all four shelves into ONE flat string[]
 * keyed only on that bare id. A liked skill named "foo" therefore made an
 * UNLIKED personality named "foo" render as already-liked, and clicking it
 * fired DELETE /api/personalities/foo/like for something never liked.
 *
 * The fix: namespace every hydration + paint key by `<endpointSegment>:<id>`
 * — e.g. `personalities:foo`, `skills:foo`, `loops:foo`, `bundles:foo`. This
 * composes cleanly with the federated `source__slug` form minted by
 * `likeTrackId` (e.g. `skills:clawhub__foo`), since the `:` separator never
 * collides with the `__` federation separator.
 */
export function likeHydrationKey(segment: string, trackId: string): string {
  return `${segment}:${trackId}`;
}

/**
 * Collect every liked hydration key from a GET /api/library payload.
 *
 * Reads the deployable `shelves.skills`, the additive `federated_skills`
 * array (spotify_2607 Phase D adds `shelves.personalities` / `shelves.loops`
 * the same way), and `followed_bundles` (liking a bundle = following it, per
 * §7 Q3) — so a heart is painted pressed regardless of which artifact type or
 * shelf it lives on. Tolerates any key being absent.
 *
 * Every returned string is a `likeHydrationKey()`-shaped `type:id` pair, NOT
 * a bare id — see MUST-FIX 1 above. Each shelf is namespaced to its own
 * endpoint segment so identically-slugged artifacts of different types never
 * collide.
 */
export function likedIdsFromLibrary(payload: any): string[] {
  const ids: string[] = [];
  const shelves = (payload && payload.shelves) || {};
  const local = shelves.skills || [];
  const personalities = shelves.personalities || [];
  const loops = shelves.loops || [];
  const federated = (payload && payload.federated_skills) || [];
  const followedBundles = (payload && payload.followed_bundles) || [];
  for (const row of local) {
    const id = libraryRowTrackId(row);
    if (id) ids.push(likeHydrationKey('skills', id));
  }
  for (const row of federated) {
    const id = libraryRowTrackId(row);
    if (id) ids.push(likeHydrationKey('skills', id));
  }
  for (const row of personalities) {
    const id = libraryRowTrackId(row);
    if (id) ids.push(likeHydrationKey('personalities', id));
  }
  for (const row of loops) {
    const id = libraryRowTrackId(row);
    if (id) ids.push(likeHydrationKey('loops', id));
  }
  // Followed bundles have no `source` field — they key on their public slug
  // directly (matches the button's data-like-id, minted as the bare bundle
  // slug by likeTrackId since bundles never carry like_source/source).
  for (const row of followedBundles) {
    if (row && row.slug) ids.push(likeHydrationKey('bundles', row.slug));
  }
  return ids;
}

export interface LikeControllerOptions {
  apiBase: string;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Called instead of location.href on 401/403. Injectable for tests. */
  onAuthRequired?: () => void;
  /** Called after a toggle that the SERVER accepted. Injectable for tests. */
  onToggled?: (info: { id: string; liked: boolean }) => void;
  /** DOM root to scope queries to. Defaults to document. */
  root?: Document | HTMLElement;
}

/**
 * Wire up like behaviour. Returns a controller with `refresh()` — call it at the
 * end of EVERY render path so hearts survive innerHTML re-renders.
 *
 * Click handling is DELEGATED (bound once on the root), so re-rendered cards
 * stay interactive without rebinding.
 */
export function createLikeController(opts: LikeControllerOptions) {
  const { apiBase } = opts;
  const doFetch = opts.fetchImpl || ((...a: Parameters<typeof fetch>) => fetch(...a));
  const root: Document | HTMLElement = opts.root || document;
  const likedIds = new Set<string>();
  let hydrated = false;

  function paint(): void {
    root.querySelectorAll<HTMLButtonElement>('.artifact-like').forEach((btn) => {
      const segment = btn.dataset.likeType || 'skills';
      const id = btn.dataset.likeId || '';
      const on = likedIds.has(likeHydrationKey(segment, id));
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Remove from your library' : 'Save to your library';
    });
  }

  async function hydrate(): Promise<void> {
    try {
      const r = await doFetch(`${apiBase}/api/library`, { credentials: 'include' });
      if (!r.ok) {
        // 401 = anonymous visitor. Leave every heart unpressed and mark the
        // attempt DONE: without this, `refresh()` would re-issue GET
        // /api/library on every single render (tab switch, search keystroke,
        // shelf re-render) for the whole anonymous session — an unbounded
        // request loop against a call we already know returns 401.
        hydrated = true;
        return;
      }
      const d = await r.json();
      likedIds.clear();
      for (const id of likedIdsFromLibrary(d)) likedIds.add(id);
      hydrated = true;
      paint();
    } catch {
      // Offline / CORS — hearts stay unpressed rather than lying about state.
      // Also latched, for the same reason as the !r.ok branch above.
      hydrated = true;
    }
  }

  /** Hydrate once, then repaint cheaply from the cached set. */
  function refresh(): void {
    if (hydrated) paint();
    else void hydrate();
  }

  async function toggle(btn: HTMLButtonElement): Promise<void> {
    if (btn.getAttribute('aria-busy') === 'true') return;
    const id = btn.dataset.likeId || '';
    // spotify_2607 Phase D: each artifact type has its own like route
    // (artifact_like_routes.py). Default to 'skills' for buttons rendered
    // before this attribute existed (defensive, not expected in practice —
    // likeButtonHTML always stamps it now).
    const segment = btn.dataset.likeType || 'skills';
    const wasLiked = btn.getAttribute('aria-pressed') === 'true';
    const nowLiked = !wasLiked;

    // Optimistic paint — reverted below if the server disagrees.
    btn.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
    btn.setAttribute('aria-busy', 'true');
    try {
      const r = await doFetch(`${apiBase}/api/${segment}/${encodeURIComponent(id)}/like`, {
        method: nowLiked ? 'POST' : 'DELETE',
        credentials: 'include',
      });
      if (r.status === 401 || r.status === 403) {
        btn.setAttribute('aria-pressed', wasLiked ? 'true' : 'false');
        if (opts.onAuthRequired) opts.onAuthRequired();
        else
          location.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
        return;
      }
      if (!r.ok) throw new Error(`like failed: ${r.status}`);
      const key = likeHydrationKey(segment, id);
      if (nowLiked) likedIds.add(key);
      else likedIds.delete(key);
      btn.title = nowLiked ? 'Remove from your library' : 'Save to your library';
      // Deterministic post-toggle hook. Surfaces that RENDER the liked set
      // (the library shelf) re-sync from here rather than guessing with a
      // timer — an unlike must remove the row, not leave a ghost card.
      if (opts.onToggled) opts.onToggled({ id, liked: nowLiked });
    } catch {
      // Roll back — never leave a heart claiming a state the server rejected.
      btn.setAttribute('aria-pressed', wasLiked ? 'true' : 'false');
    } finally {
      btn.removeAttribute('aria-busy');
    }
  }

  function handleClick(ev: Event): void {
    const target = ev.target as HTMLElement | null;
    const btn = target && target.closest ? (target.closest('.artifact-like') as HTMLButtonElement | null) : null;
    if (!btn) return;
    // The heart sits next to the card <a> — stop the event so clicking it never
    // navigates to the skill.
    ev.preventDefault();
    ev.stopPropagation();
    void toggle(btn);
  }

  root.addEventListener('click', handleClick);

  return { refresh, paint, toggle, handleClick, likedIds, isHydrated: () => hydrated };
}
