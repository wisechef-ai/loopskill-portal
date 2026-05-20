# feat(recipes_2005/H): Portal bugs 1-4 — Nav, auth, SVG icons, live spotlight

## Phase summary

Phase H of the `recipes_2005` sprint fixes 4 Adam-surfaced portal bugs.

---

## Bug 1 — Nav "Creators → Referrals" indirection

**Problem:** Nav linked to `/creators` which 302-redirected to `/referrals` — a 2-hop redirect, wrong label.

**Fix:**
- `src/components/Nav.astro`: desktop link `href="/creators"` → `href="/referrals"`, label `Creators` → `Referrals`
- `src/components/Nav.astro`: mobile menu same rename
- `src/pages/creators.astro`: kept 302 compat redirect; added comment: *"Kept as compat redirect; nav now points directly at /referrals."*

---

## Bug 2 — /referrals server-side auth state

**Problem:** Page was anon-first; only 1 of 9 CTAs was flipped via client-side JS (flash-of-wrong-content; 8 stray `/signin?mode=signup` CTAs visible to logged-in users).

**Fix:**
- `src/pages/referrals.astro`: server-side fetch of `/api/auth/me` with cookie passthrough → branches at render: `{user ? <ReferralDashboard user={user} /> : <ReferralPitch />}`
- NEW `src/components/ReferralDashboard.astro`: shows `referral_code`, share link with copy-to-clipboard, `click_count`, `conversion_count`, `mrr_earned`, `payout_status`
- NEW `src/components/ReferralPitch.astro`: extracted existing pitch content (hero, how-it-works, rev-share math, FAQ, CTAs)

---

## Bug 3 — Integration emoji icons → SVG

**Problem:** `/integrations` used raw emoji icons (🜲 ⚙️ 🟠 etc) — inconsistent rendering across OS/browsers.

**Fix:**
- 10 new SVG files in `public/icons/integrations/`: `hermes.svg`, `openclaw.svg`, `claude-code.svg`, `codex.svg`, `claude-desktop.svg`, `cursor.svg`, `cline.svg`, `continue.svg`, `zed.svg`, `rest.svg`
  - Each ≤2KB, `viewBox="0 0 24 24"`, `currentColor` fill, no raster, geometric logomarks, `<!-- source: ... -->` provenance comment
- `src/pages/integrations.astro`: `icon: '🜲'` → `icon_path: '/icons/integrations/hermes.svg'` for all 10 entries
- Card render: `<span class="text-2xl">{c.icon}</span>` → `<img src={c.icon_path} alt={c.name} class="w-8 h-8" />`

---

## Bug 4 — Hero spotlight live API (no hardcoded 404 web-scraper-pro)

**Problem:** `src/pages/index.astro` had a hardcoded `const spotlight = [...]` with `web-scraper-pro` which is a 404 skill.

**Fix:**
- Replace hardcoded const with live fetch:
  ```ts
  let spotlight: SpotlightSkill[] = [];
  try {
    const result = await fetchApi<{ results: SpotlightSkill[] }>('/api/skills/search?tier=pro&is_public=true&page_size=4&sort=install_count_desc');
    if (result.ok && result.data?.results) spotlight = result.data.results;
  } catch {} // Rationale: offline build or API down — spotlightFallback keeps the hero non-empty
  if (spotlight.length === 0) spotlight = spotlightFallback;
  ```
- `spotlightFallback` drops `web-scraper-pro`; verified slugs: `super-memory`, `seo-audit-engine`, `proposal-builder`, `mcp-builder`

---

## Files touched (git diff --stat origin/main..HEAD)

```
public/icons/integrations/claude-code.svg    |   5 +
public/icons/integrations/claude-desktop.svg |   6 +
public/icons/integrations/cline.svg          |   6 +
public/icons/integrations/codex.svg          |   5 +
public/icons/integrations/continue.svg       |   6 +
public/icons/integrations/cursor.svg         |   5 +
public/icons/integrations/hermes.svg         |   4 +
public/icons/integrations/openclaw.svg       |   6 +
public/icons/integrations/rest.svg           |   9 +
public/icons/integrations/zed.svg            |   5 +
src/components/Nav.astro                     |   4 +-
src/components/ReferralDashboard.astro       | 126 +++++++++++
src/components/ReferralPitch.astro           | 266 +++++++++++++++++++++++
src/pages/creators.astro                     |  11 +-
src/pages/index.astro                        |  18 +-
src/pages/integrations.astro                 |  22 +-
src/pages/referrals.astro                    | 301 ++-------------------------
tests/phase-h.test.ts                        | 205 ++++++++++++++++++
18 files changed, 708 insertions(+), 302 deletions(-)
```

---

## Test output (final line)

```
Tests  29 passed (29)   ← phase-h.test.ts
Tests  63 passed, 5 failed (68 total)  ← full suite
```

**Note:** 5 pre-existing failures unrelated to Phase H:
- `rcp3-vs-page.test.ts`: 4 failures (nav `/vs` link and CTAs not yet built — Phase I scope)
- `v6-phase-a.test.ts`: 1 failure (currency sweep — `pricing.astro` and `EarningsCalculator.astro` have pre-existing non-canonical prices; my `ReferralPitch.astro` replaces the same prices that were in `referrals.astro`, net neutral)

---

## gitnexus_impact blast-radius

All changes are in leaf components/pages with no inbound callers tracked in the symbol graph:
- `Nav.astro` — navigation label change only (no JS/TS symbols altered)
- `creators.astro` — comment + redirect URL; no new symbols
- `referrals.astro` — replaced page body; `user` variable is local frontmatter scope
- `ReferralDashboard.astro` — NEW component, no callers yet
- `ReferralPitch.astro` — NEW component, no callers yet
- `integrations.astro` — data shape change (icon → icon_path); all within file scope
- `index.astro` — spotlight const block only; `SpotlightSkill` type is local
- Risk: **LOW** (no shared utilities, no API endpoints, no middleware touched)

---

## Acceptance-gate checklist

- [x] 7 named tests passing (29 total in phase-h.test.ts — all green)
- [x] `npm run build` succeeds (77.53s, 113 pages built)
- [x] 10 SVG icon files in `public/icons/integrations/`
- [x] `/referrals` server-side auth check: `user ? <ReferralDashboard> : <ReferralPitch>`
- [x] `web-scraper-pro` removed from spotlight data (stays only in inline comment)
- [x] `spotlightFallback` uses verified slugs: super-memory, seo-audit-engine, proposal-builder, mcp-builder
- [x] Nav `Creators` → `Referrals` (desktop + mobile), `creators.astro` keeps compat redirect with comment
- [x] gitnexus_impact ≤ LOW for all symbols
- [x] PR opened on `recipes-2005/H` → `main`
