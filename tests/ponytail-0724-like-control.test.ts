/**
 * ponytail_0724 — like ("heart") control behaviour tests.
 *
 * Adam 2026-07-24: "I want to add skill to favourite but there is no menu
 * similar to spotify on skills". The like backend shipped in liked_0711 but no
 * portal surface ever called it. These tests exercise the REAL DOM behaviour of
 * src/lib/likeControl.ts (jsdom + injected fetch), not source-string greps:
 * clicks are dispatched, network responses are stubbed, and the resulting
 * aria-state is asserted.
 *
 * Covered failure modes that would ship a lying button:
 *   - federated track identity minted as a bare slug  -> every hub like 404s
 *   - clicking the heart navigating to the card link  -> user loses their place
 *   - optimistic paint left in place after a 500      -> heart lies
 *   - anonymous visitor silently no-op'd              -> heart lies
 *   - state lost after an innerHTML re-render         -> heart forgets
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  likeTrackId,
  isLikeable,
  likeButtonHTML,
  libraryRowTrackId,
  likedIdsFromLibrary,
  createLikeController,
} from '../src/lib/likeControl';

const ROOT = join(new URL(import.meta.url).pathname, '../../');
const BROWSE = join(ROOT, 'src', 'pages', 'browse.astro');
const HOME = join(ROOT, 'src', 'pages', 'home.astro');
const CSS = join(ROOT, 'src', 'styles', 'global.css');

// ── Track identity ──────────────────────────────────────────────────────────

describe('likeTrackId — the string the API must receive', () => {
  it('mints source__slug for a federated skill', () => {
    expect(likeTrackId({ slug: 'dietrichgebert--ponytail--ponytail', like_source: 'skills-sh' }))
      .toBe('skills-sh__dietrichgebert--ponytail--ponytail');
  });

  it('uses the bare slug for a local catalog skill', () => {
    expect(likeTrackId({ slug: 'my-skill' })).toBe('my-skill');
  });

  it('treats the literal "local" source as local, not a federation source', () => {
    expect(likeTrackId({ slug: 'my-skill', source: 'local' })).toBe('my-skill');
  });

  it('falls back to `source` when like_source is absent', () => {
    expect(likeTrackId({ slug: 'api-gateway', source: 'clawhub' })).toBe('clawhub__api-gateway');
  });

  it('round-trips with the library-row form (hydration must match buttons)', () => {
    const btnId = likeTrackId({ slug: 'owner--repo--x', like_source: 'skills-sh' });
    const rowId = libraryRowTrackId({ slug: 'owner--repo--x', source: 'skills-sh', federated: true });
    expect(rowId).toBe(btnId);
  });

  it('round-trips for local rows too', () => {
    expect(libraryRowTrackId({ slug: 'my-skill', source: 'local', federated: false })).toBe('my-skill');
  });

  it('treats a deployable shelf row (no source field) as local', () => {
    // shelves.skills entries are the FROZEN {id, slug, title, liked_at} shape —
    // they carry no `source` at all. They must key off the bare slug.
    expect(libraryRowTrackId({ slug: 'my-skill' })).toBe('my-skill');
  });

  it('keys a federated_skills row off source__slug without a `federated` flag', () => {
    // The API's federated_skills entries are {slug, title, source, liked_at} —
    // there is no `federated: true` marker; `source` is the discriminator.
    expect(libraryRowTrackId({ slug: 'owner--repo--x', source: 'clawhub' })).toBe(
      'clawhub__owner--repo--x',
    );
  });
});

describe('likedIdsFromLibrary — reads BOTH API skill sources', () => {
  it('collects deployable shelf rows and federated rows together', () => {
    const ids = likedIdsFromLibrary({
      shelves: { skills: [{ id: 'uuid-1', slug: 'local-one', title: 'L', liked_at: 'x' }] },
      federated_skills: [{ slug: 'owner--repo--x', title: 'F', source: 'skills-sh', liked_at: 'y' }],
    });
    expect(ids).toEqual(['local-one', 'skills-sh__owner--repo--x']);
  });

  it('tolerates either key being absent', () => {
    expect(likedIdsFromLibrary({ shelves: { skills: [] } })).toEqual([]);
    expect(likedIdsFromLibrary({ federated_skills: [] })).toEqual([]);
    expect(likedIdsFromLibrary({})).toEqual([]);
    expect(likedIdsFromLibrary(null)).toEqual([]);
  });

  it('skips rows with no slug rather than emitting a junk id', () => {
    expect(likedIdsFromLibrary({ federated_skills: [{ source: 'clawhub' }, { slug: 'ok', source: 'clawhub' }] }))
      .toEqual(['clawhub__ok']);
  });

  // spotify_2607 Phase D: liked_library() already serves typed shelves for
  // personalities and loops (library_service.py `shelves.personalities` /
  // `shelves.loops`), and followed bundles on their own `followed_bundles`
  // key. Hearts on those card types must paint pressed from the same
  // GET /api/library payload.
  it('also collects liked personalities and loops shelves', () => {
    const ids = likedIdsFromLibrary({
      shelves: {
        skills: [],
        personalities: [{ id: 'uuid-p1', slug: 'blunt-editor', title: 'Blunt Editor', liked_at: 'x' }],
        loops: [{ id: 'uuid-l1', slug: 'nightly-digest', title: 'Nightly Digest', liked_at: 'y' }],
      },
    });
    expect(ids).toEqual(['blunt-editor', 'nightly-digest']);
  });

  it('collects followed (liked) bundles by slug', () => {
    const ids = likedIdsFromLibrary({
      followed_bundles: [{ id: 'uuid-b1', slug: 'dev-essentials', name: 'Dev Essentials', followed_at: 'x' }],
    });
    expect(ids).toEqual(['dev-essentials']);
  });

  it('a followed bundle with no public slug (never published) contributes nothing', () => {
    // Bundle.slug is nullable for private bundles; a slug-less follow can't
    // be matched back to a button (buttons key on slug) and must not throw.
    expect(likedIdsFromLibrary({ followed_bundles: [{ id: 'uuid-b2', slug: null, name: 'X' }] })).toEqual([]);
  });
});

describe('isLikeable', () => {
  it('accepts both the plural and singular skill tag', () => {
    expect(isLikeable('skills', { slug: 'a' })).toBe(true);
    expect(isLikeable('skill', { slug: 'a' })).toBe(true);
  });

  // spotify_2607 Phase D: like now works on ALL FOUR artifact types — the
  // Phase B backend (artifact_like_routes.py) shipped slug-based
  // POST/DELETE /api/{personalities|loops|bundles}/{slug}/like specifically
  // so the portal could stop being skills-only. This supersedes the
  // ponytail_0724 "skills only for now" comment.
  it('accepts personalities, loops and bundles too (both singular and plural)', () => {
    expect(isLikeable('personalities', { slug: 'a' })).toBe(true);
    expect(isLikeable('personality', { slug: 'a' })).toBe(true);
    expect(isLikeable('loops', { slug: 'a' })).toBe(true);
    expect(isLikeable('loop', { slug: 'a' })).toBe(true);
    expect(isLikeable('bundles', { slug: 'a' })).toBe(true);
    expect(isLikeable('bundle', { slug: 'a' })).toBe(true);
  });

  it('rejects unknown artifact types and slugless items', () => {
    expect(isLikeable('widgets', { slug: 'a' })).toBe(false);
    expect(isLikeable('skills', {})).toBe(false);
    expect(isLikeable('skills', null)).toBe(false);
    expect(isLikeable('personalities', {})).toBe(false);
    expect(isLikeable('loops', null)).toBe(false);
    expect(isLikeable('bundles', {})).toBe(false);
  });
});

// ── Markup contract ─────────────────────────────────────────────────────────

describe('likeButtonHTML — markup contract', () => {
  it('renders a real <button> with the accessible pressed state', () => {
    const html = likeButtonHTML('skills', { slug: 'my-skill', title: 'My Skill' });
    expect(html).toContain('<button type="button"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-like-id="my-skill"');
    expect(html).toContain('aria-label="Save My Skill to your library"');
  });

  it('escapes hostile titles and slugs (no attribute break-out)', () => {
    const html = likeButtonHTML('skills', { slug: 'a"onmouseover="x', title: '<img src=x>' });
    expect(html).not.toContain('onmouseover="x"');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&quot;');
  });

  it('renders nothing for a non-likeable artifact', () => {
    expect(likeButtonHTML('widgets', { slug: 'a' })).toBe('');
    expect(likeButtonHTML('loops', {})).toBe('');
  });

  it('produces valid DOM — the button is NOT nested inside the card anchor', () => {
    document.body.innerHTML =
      `<div class="artifact-slot"><a href="/x" class="artifact-card">card</a>` +
      likeButtonHTML('skills', { slug: 'my-skill', title: 'My Skill' }) +
      `</div>`;
    const btn = document.querySelector('.artifact-like')!;
    expect(btn.closest('a')).toBeNull(); // a <button> inside an <a> is invalid HTML
    expect(btn.parentElement!.className).toBe('artifact-slot');
  });
});

// ── Behaviour (jsdom + injected fetch) ──────────────────────────────────────

function mountCard(item = { slug: 'my-skill', title: 'My Skill' }, type = 'skills') {
  document.body.innerHTML =
    `<div id="results"><div class="artifact-slot">` +
    `<a href="/skills/${item.slug}" class="artifact-card">card</a>` +
    likeButtonHTML(type, item) +
    `</div></div>`;
  return document.querySelector('.artifact-like') as HTMLButtonElement;
}

const okJson = (body: any) => ({ ok: true, status: 200, json: async () => body }) as any;
const status = (code: number) => ({ ok: code < 400, status: code, json: async () => ({}) }) as any;

describe('createLikeController — click behaviour', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('POSTs the correct track id and flips the heart on', async () => {
    const btn = mountCard({ slug: 'owner--repo--x', title: 'X', like_source: 'skills-sh' } as any);
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, init: any) => { calls.push([String(url), init?.method]); return status(200); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(calls[0][0]).toBe('https://api.test/api/skills/skills-sh__owner--repo--x/like');
    expect(calls[0][1]).toBe('POST');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  // spotify_2607 Phase D: the heart now appears on personality/loop/bundle
  // cards too. Each type has its own like route (artifact_like_routes.py);
  // the button must carry which one to hit via data-like-type.
  it('routes a personality heart to /api/personalities/{slug}/like', async () => {
    const btn = mountCard({ slug: 'blunt-editor', title: 'Blunt Editor' } as any, 'personalities');
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, init: any) => { calls.push([String(url), init?.method]); return status(200); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(calls[0][0]).toBe('https://api.test/api/personalities/blunt-editor/like');
  });

  it('routes a loop heart to /api/loops/{slug}/like', async () => {
    const btn = mountCard({ slug: 'nightly-digest', title: 'Nightly Digest' } as any, 'loops');
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, init: any) => { calls.push([String(url), init?.method]); return status(200); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(calls[0][0]).toBe('https://api.test/api/loops/nightly-digest/like');
  });

  it('routes a bundle heart (= follow) to /api/bundles/{slug}/like', async () => {
    const btn = mountCard({ slug: 'dev-essentials', title: 'Dev Essentials' } as any, 'bundles');
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, init: any) => { calls.push([String(url), init?.method]); return status(200); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(calls[0][0]).toBe('https://api.test/api/bundles/dev-essentials/like');
  });

  it('DELETEs and flips the heart off when already liked', async () => {
    const btn = mountCard();
    btn.setAttribute('aria-pressed', 'true');
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: any, init: any) => { calls.push([String(url), init?.method]); return status(200); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(calls[0][1]).toBe('DELETE');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('ROLLS BACK the optimistic paint when the server errors', async () => {
    const btn = mountCard();
    const fetchImpl = vi.fn(async () => status(500));
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(btn.getAttribute('aria-pressed')).toBe('false'); // never lie
    expect(btn.hasAttribute('aria-busy')).toBe(false);
  });

  it('ROLLS BACK when the network throws entirely', async () => {
    const btn = mountCard();
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('routes an anonymous visitor to sign-in and does not claim a like', async () => {
    const btn = mountCard();
    const onAuthRequired = vi.fn();
    const fetchImpl = vi.fn(async () => status(401));
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any, onAuthRequired });

    await c.toggle(btn);

    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('treats 403 the same as 401', async () => {
    const btn = mountCard();
    const onAuthRequired = vi.fn();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => status(403)) as any,
      onAuthRequired,
    });

    await c.toggle(btn);

    expect(onAuthRequired).toHaveBeenCalledOnce();
  });

  it('clicking the heart does NOT navigate to the card link', () => {
    mountCard();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => status(200)) as any,
    });
    const btn = document.querySelector('.artifact-like') as HTMLButtonElement;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });

    btn.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
  });

  it('ignores clicks that are not on a heart', () => {
    mountCard();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => status(200)) as any,
    });
    const card = document.querySelector('.artifact-card') as HTMLElement;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });

    card.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(false); // card navigation still works
  });

  it('is idempotent while a request is in flight (no double-toggle)', async () => {
    const btn = mountCard();
    btn.setAttribute('aria-busy', 'true');
    const fetchImpl = vi.fn(async () => status(200));
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    await c.toggle(btn);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createLikeController — hydration + repaint', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('paints hearts pressed from GET /api/library, matching federated identity', async () => {
    mountCard({ slug: 'owner--repo--x', title: 'X', like_source: 'skills-sh' } as any);
    const fetchImpl = vi.fn(async () =>
      okJson({
        shelves: { skills: [] },
        federated_skills: [{ slug: 'owner--repo--x', source: 'skills-sh', liked_at: 'z' }],
      }),
    );
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    c.refresh();
    await vi.waitFor(() =>
      expect((document.querySelector('.artifact-like') as HTMLElement).getAttribute('aria-pressed')).toBe('true'),
    );
  });

  it('leaves hearts unpressed for an anonymous visitor (401 on /api/library)', async () => {
    mountCard();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => status(401)) as any,
    });

    c.refresh();
    await new Promise((r) => setTimeout(r, 0));

    expect((document.querySelector('.artifact-like') as HTMLElement).getAttribute('aria-pressed')).toBe('false');
  });

  it('does NOT re-request /api/library on every render for an anonymous visitor', async () => {
    // Without latching on the 401 branch, refreshLikes() re-issues the call on
    // every tab switch / search / re-render for the whole session.
    mountCard();
    const fetchImpl = vi.fn(async () => status(401));
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    c.refresh();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 20; i++) c.refresh();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-request /api/library after a network failure either', async () => {
    mountCard();
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    c.refresh();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 10; i++) c.refresh();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fires onToggled ONLY after the server accepts the change', async () => {
    const btn = mountCard();
    const onToggled = vi.fn();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => status(200)) as any,
      onToggled,
    });

    await c.toggle(btn);

    expect(onToggled).toHaveBeenCalledWith({ id: 'my-skill', liked: true });
  });

  it('does NOT fire onToggled when the server rejects the change', async () => {
    const btn = mountCard();
    const onToggled = vi.fn();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => status(500)) as any,
      onToggled,
    });

    await c.toggle(btn);

    expect(onToggled).not.toHaveBeenCalled();
  });

  it('re-paints liked state after an innerHTML re-render (hearts do not forget)', async () => {
    mountCard();
    const c = createLikeController({
      apiBase: 'https://api.test',
      fetchImpl: (async () => okJson({ shelves: { skills: [{ id: 'u1', slug: 'my-skill' }] } })) as any,
    });
    c.refresh();
    await vi.waitFor(() => expect(c.isHydrated()).toBe(true));

    // Simulate load() replacing the results markup.
    mountCard();
    expect((document.querySelector('.artifact-like') as HTMLElement).getAttribute('aria-pressed')).toBe('false');

    c.refresh(); // called at the end of every render path

    expect((document.querySelector('.artifact-like') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('does not re-fetch /api/library on every repaint', async () => {
    mountCard();
    const fetchImpl = vi.fn(async () => okJson({ shelves: { skills: [] } }));
    const c = createLikeController({ apiBase: 'https://api.test', fetchImpl: fetchImpl as any });

    c.refresh();
    await vi.waitFor(() => expect(c.isHydrated()).toBe(true));
    c.refresh();
    c.refresh();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// ── Wiring assertions (the call sites must actually use it) ─────────────────

describe('portal wiring — the heart is actually rendered and refreshed', () => {
  const browse = existsSync(BROWSE) ? readFileSync(BROWSE, 'utf-8') : '';
  const home = existsSync(HOME) ? readFileSync(HOME, 'utf-8') : '';
  const css = existsSync(CSS) ? readFileSync(CSS, 'utf-8') : '';

  it('browse.astro wraps cards in .artifact-slot and appends the heart', () => {
    expect(browse).toContain('class="artifact-slot"');
    expect(browse).toContain('likeButtonHTML(type, item)');
  });

  it('browse.astro refreshes liked state on EVERY render path', () => {
    // Two innerHTML render exits in load(): the All-tab and the single-type tab.
    const refreshes = (browse.match(/refreshLikes\(\);/g) || []).length;
    expect(refreshes).toBeGreaterThanOrEqual(2);
  });

  it('browse.astro carries the federation source through to the card', () => {
    expect(browse).toContain('like_source: s.source || null');
  });

  it('home.astro imports the shared control rather than re-implementing it', () => {
    expect(home).toContain("from '../lib/likeControl'");
    expect(home).toContain('createLikeController({ apiBase: API_BASE })');
    expect(home).toContain('likeControl.refresh()');
  });

  it('the heart has styles, including a visible liked state and focus ring', () => {
    expect(css).toContain('.artifact-slot');
    expect(css).toContain('.artifact-like');
    expect(css).toContain('.artifact-like[aria-pressed="true"]');
    expect(css).toContain('.artifact-like:focus-visible');
  });

  it('the heart stays visible on touch devices (no hover to reveal it)', () => {
    expect(css).toContain('@media (hover: none)');
  });

  // Regression pin — caught in visual QA 2026-07-24, invisible to DOM tests.
  // The first cut styled `.artifact-slot { display:flex }` with no width, so in
  // the shelf-row the slot stretched wider than the 176px card and the
  // absolutely-positioned heart anchored to the SLOT's right edge — floating in
  // empty space beside the cover art instead of sitting on it.
  it('the slot is width-constrained so the heart lands ON the cover, not beside it', () => {
    const slotRule = css.slice(css.indexOf('.artifact-slot {'), css.indexOf('.artifact-like {'));
    expect(slotRule).toMatch(/width:\s*176px/);
    expect(slotRule).not.toMatch(/display:\s*flex/);
  });

  it('the card fills its slot so the two share a right edge', () => {
    expect(css).toContain('.artifact-slot > .artifact-card { width: 100%; max-width: none; }');
  });

  it('the Browse grid slot stretches to the column instead of the fixed width', () => {
    expect(css).toContain('.artifact-grid .artifact-slot { width: auto; max-width: 240px; }');
  });

  it('the heart is anchored to the slot, top-right, above the cover', () => {
    const likeRule = css.slice(css.indexOf('.artifact-like {'), css.indexOf('.artifact-slot:hover'));
    expect(likeRule).toMatch(/position:\s*absolute/);
    expect(likeRule).toMatch(/top:\s*6px/);
    expect(likeRule).toMatch(/right:\s*6px/);
    expect(likeRule).toMatch(/z-index:\s*2/);
  });

  it('the like CSS block is defined exactly once (no duplicated rules)', () => {
    // Count only TOP-LEVEL rule blocks — i.e. the selector at the start of a
    // line. Media-query overrides legitimately repeat the selector inline
    // (`@media (hover: none) { .artifact-like { … } }`) and must not be
    // counted as duplicates. An earlier naive count matched those too and
    // reported 3 for a file that is in fact correct.
    expect((css.match(/^\.artifact-slot \{/gm) || []).length).toBe(1);
    expect((css.match(/^\.artifact-like \{/gm) || []).length).toBe(1);
  });
});

// ── Mirror-drift guard ──────────────────────────────────────────────────────
//
// browse.astro carries `define:vars`, which forces Astro's `is:inline` mode
// where ESM imports are UNAVAILABLE — so it MIRRORS likeControl.ts inline and
// cannot import the tested module. That makes its runtime the least-tested code
// in this feature, and hairline drift invisible.
//
// R1 review (2026-07-24) found exactly that: the mirror read
// `btn.dataset.likeId` without likeControl.ts's `|| ''` fallback in TWO places,
// so an undefined id would have been sent to the API as the literal string
// "undefined". Unreachable today, but precisely the class the mirror invites.
//
// These assertions pin the load-bearing behaviours across BOTH copies. They are
// source assertions by necessity (the inline script cannot be imported), and
// they are deliberately narrow: each one names a specific defect class.

describe('browse.astro mirror does not drift from likeControl.ts', () => {
  const browse = existsSync(BROWSE) ? readFileSync(BROWSE, 'utf-8') : '';
  const lib = readFileSync(join(ROOT, 'src', 'lib', 'likeControl.ts'), 'utf-8');

  it('both read data-like-id with an empty-string fallback', () => {
    // Never send the literal string "undefined" to the API as a track id.
    expect(browse).not.toMatch(/dataset\.likeId(?!\s*\|\|)/);
    expect(lib).not.toMatch(/dataset\.likeId(?!\s*\|\|)/);
  });

  it('both guard against a re-entrant toggle with aria-busy', () => {
    expect(browse).toContain("getAttribute('aria-busy') === 'true'");
    expect(lib).toContain("getAttribute('aria-busy') === 'true'");
  });

  it('both roll back aria-pressed on failure', () => {
    const rollback = /aria-pressed', wasLiked \? 'true' : 'false'/;
    expect(browse).toMatch(rollback);
    expect(lib).toMatch(rollback);
  });

  it('both route 401/403 to sign-in rather than silently failing', () => {
    expect(browse).toMatch(/status === 401 \|\| .*status === 403/);
    expect(lib).toMatch(/status === 401 \|\| .*status === 403/);
  });

  it('both latch hydration so an anonymous visitor cannot loop /api/library', () => {
    // The MUST-FIX both reviewers independently found: without latching, the
    // 401 branch leaves hydrated=false and every re-render re-requests.
    expect(browse).toMatch(/likedHydrated = true;[\s\S]{0,80}return;/);
    expect(lib).toMatch(/hydrated = true;[\s\S]{0,80}return;/);
  });

  it('both read BOTH shelves.skills and federated_skills', () => {
    for (const src of [browse, lib]) {
      expect(src).toMatch(/shelves.*skills/);
      expect(src).toMatch(/federated_skills/);
    }
  });

  it('both stop event propagation so the heart never navigates the card', () => {
    expect(browse).toContain('ev.stopPropagation()');
    expect(lib).toContain('ev.stopPropagation()');
  });
});
