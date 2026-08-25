# CHANGELOG — recipes-portal

All notable changes to recipes-portal (Astro 5 static site at recipes.wisechef.ai) are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed — landing_onramp (2026-08-25)

- **Homepage rebuilt as "THE ON-RAMP"** (landing-concepts v2, Concept 3 + Concept 2's
  drift matrix): career-path hero ("Deploying AI agents for clients is a job now.
  This is its toolkit.") with a 4-station journey rail — Day 1 → First client →
  Fleet → Get paid — each station expanding inline (ARIA tabs, deep-linkable via
  `/#station-<id>`, all four server-rendered for crawlers/no-JS).
- NEW `src/components/JourneyRail.astro` — the station rail (progressive
  enhancement: panels visible in static HTML, JS only toggles).
- NEW `src/components/FleetDriftMatrix.astro` — interactive fleet drift-matrix
  demo in the Fleet station: 5 agents × 5 skills, three-way verdict cells
  (declared/installed/extras), hover/click inspection, per-row Converge
  animation, reset. Fleet state is simulated and labelled DEMO; column
  headers + declared versions are LIVE catalog data (slug + `latest_version`),
  fail-closed when unresolvable.
- First public surfacing of: the offline `loopskill import`/`diff` CLI, bundle
  fork/preview, and the staged connector-index count (live-bound, phrased
  "indexed, review-gated").
- FIX: bootcamp step chips rendered blank when `/api/bootcamp/{id}` returns
  `title: null` for catalog-absent steps — now falls back to the slug.
- NEW `tests/landing-onramp.test.ts` — 41 assertions pinning the rail contract,
  matrix interactivity/honesty (DEMO label, no hardcoded slugs/versions), claim
  grounding, and one-click reachability of the top-value capability docs.


## [v0.5.0] — 2026-05-20 — recipes_2005 sprint

### Added

- NEW blog post: `src/content/blog/v0.5.0-creator-onboarding.md` — release notes for the recipes_2005 sprint.
- NEW `src/components/ReferralDashboard.astro` + `src/components/ReferralPitch.astro` — split the `/referrals` page into authenticated-user dashboard variant (referral code, click count, conversion count, MRR earned) and anonymous-visitor pitch variant.
- NEW docs pages: `creator-workflow.astro` (235 LOC, end-to-end creator journey), `fleet.astro` (189 LOC, multi-agent fleet sync).
- NEW `ops/install-rebuild-timer.sh` — systemd timer config for nightly portal rebuild (belt-and-suspenders alongside the Phase I client-side carousel fetch).
- 10 real SVG logos for the integrations page: `public/icons/integrations/{hermes,openclaw,claude-code,codex,claude-desktop,cursor,cline,continue,zed,rest}.svg`.

### Changed — portal bugs surfaced by Adam, fixed in one sprint

- **Bug 1 — Nav indirection.** `src/components/Nav.astro` link relabeled from "Creators" to "Referrals", `href` flipped from `/creators` to `/referrals` directly. `/creators` keeps a 302 compat-redirect for external link survivors.
- **Bug 2 — `/referrals` auth-state.** Server-side session check at Astro page-render time. Logged-in users no longer see eight stray "Sign up for free" CTAs; they get the dashboard variant.
- **Bug 3 — Integration icons.** Emoji (🜲 ⚙️ 🟠 ⚡ 🪟 ⌨️ 🧩 ↻ 🌐) replaced with 10 real SVG logos.
- **Bug 4 — Hero "Pro skills" spotlight.** Was a hardcoded array including `web-scraper-pro` (404, didn't exist). Now a live `/api/skills/search?tier=pro&is_public=true&page_size=4&sort=install_count_desc` fetch with `spotlightFallback` for offline-build resilience.
- **Carousel staleness.** `src/pages/index.astro` carousel block moved from build-time `await fetchApi('/api/carousel/today')` to client-side fetch via `data-fetch-url` attribute. Stale window: <1h (was up to 7 days between deploys).

### Changed — docs sweep

- `getting-started.astro` 44 → 154 LOC.
- `how-it-works.astro` 44 → 152 LOC.
- `security.astro` 45 → 181 LOC.
- `api-reference.astro` 56 → 243 LOC.
- `publishing.astro` 58 → 218 LOC.
- `new-agent.astro` 60 → 190 LOC.
- All commands in docs verified to exist; vaporware claims ("24h review", "earnings at /dashboard", `recipes share` CLI before Phase F merged) deleted.

### Fixed

- `Icon.astro` type union extended with `clipboard`; matching SVG added (was crashing `ReferralDashboard.astro` build).
- `index.astro:395` `s.tier.toUpperCase()` null-guarded — `(s.tier ?? 'pro').toUpperCase()` — API may omit `tier` for spotlight skills.
- Free-tier skill bodies remain visible to anonymous callers (was being paywalled by mistake on `/skills/[slug]`).

### Tier rename (mirrors recipes-api/CHANGELOG.md)

- `src/lib/tiers.ts`, `src/components/SkillCard.astro`, `src/pages/{index,library,skills/[slug],skills/index,stats}.astro`, and `src/content/blog/recipes-vertical-skill-marketplace-whitepaper.md` all use `{free, pro, pro_plus}` consistently.

### Infrastructure

- `ci.yml` migrated `ubuntu-latest` → self-hosted `wisechef-runner`.
- NEW `.github/actionlint.yaml` registers the `wisechef-runner` label so pre-commit's actionlint hook accepts the custom self-hosted label.

[Unreleased]: https://github.com/wisechef-ai/recipes-portal/compare/v0.5.0...HEAD
[v0.5.0]: https://github.com/wisechef-ai/recipes-portal/releases/tag/v0.5.0
