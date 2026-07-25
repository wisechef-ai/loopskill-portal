# recipes-portal — agent guide (onechrome_0611, updated 2026-06-12)

`recipes.wisechef.ai` — Astro 5 STATIC site (no SSR; `astro.config.mjs` has no
`output:` line). npm, Node 22. Marketing for the product lives on `wisechef.ai`
(separate repo `wisechef-portal-v3`); THIS repo is the app.

## The ONE chrome

`src/layouts/AppShell.astro` is THE layout for the entire site (the "Garden":
left rail = unified search + Home / Search / Your Library / Fleets / Delivery +
live cookbook list + ambient fleet status + account footer). The legacy
`Base.astro` / `Nav.astro` marketing chrome was DELETED in onechrome_0611 P3 —
do not reintroduce a second chrome. `grep -rl "layouts/Base" src/pages` must
stay empty.

### The mode contract

```astro
<AppShell mode="member" ...>   <!-- default; omit mode -->
<AppShell mode="public" ...>
```

- `member` (default): member surfaces. Anonymous visitors are HARD-BOUNCED to
  `/signin?next=<here>` behind a gate splash (`#appshell-gate`). robots=noindex.
- `public`: public-browse surfaces. NO bounce, NO gate. The rail renders
  sign-in CTAs in static HTML (`[data-shell-anon]` nodes); when
  `/api/auth/me` resolves a session, client JS swaps to the member rail
  (`[data-shell-member]` nodes). Indexable; carries canonical/OG/JSON-LD,
  the `?ref=` referral-cookie script, and IntentSurvey.
- `src/layouts/AuthEdge.astro`: minimal no-rail layout for `signin` and
  `billing/success` only.

### The 3 IA tiers

| Tier | mode | Pages |
|---|---|---|
| PUBLIC-BROWSE | `public` | `/` (+ logged-in redirect), `skills/*`, `pricing`, `cookbooks/*`, `cookbook`, `docs/*`, `blog/*`, `bootcamp`, `carousel`, `integrations`, `intent`, `privacy`, `security`, `publish`, `referrals`, `404` |
| MEMBER-APP | `member` | `home`, `library`, `fleets`, `cockpit`, `composer`, `account`, `dashboard/*` |
| AUTH-EDGE | AuthEdge | `signin`, `billing/success` |

`/` detects a session client-side and `location.replace('/home')` for members;
anonymous visitors get the marketplace hero inside the public shell.

## Auth-state rules (REQUIRED for every state-driven UI — 4 trap classes)

1. Render BOTH states in static HTML; never branch a JS-fill target away
   behind a build-time ternary (Trap C).
2. Swap with `classList` AND inline `style.display` — Tailwind responsive
   variants (`md:flex`) outrank `.hidden` in the cascade (Trap A).
3. NEVER fetch `/api/auth/me` (or any user data) in frontmatter — frontmatter
   runs at BUILD time in static mode and bakes the anonymous branch (Trap B).
   All auth fetches are client-side with `credentials: 'include'`.
4. New authed page? Add its path to the API's `SAFE_NEXT_PREFIXES` allow-list
   (repo `recipes-api`) or OAuth will silently land users on `/library`.

Full doctrine: Hermes skill `tailwind-auth-aware-ui-class-toggle-trap`.

## Build-time fetch ban

NEVER add a build-time API fetch for user data. A handful of catalog pages
(index, skills) do build-time fetches WITH fallbacks — do not add more; a
build-time fetch couples the build to API uptime (WIS-737 incident class;
`scripts/assert-dist.sh` guards the blast radius). New live data = client
island over `src/lib/api.ts` (`API_BASE = https://app.loopskill.io`; the legacy
`recipes.wisechef.ai` 301s here as of 2026-07-10).

## Build, CI, deploy (deploy is MANUAL)

- `npm run build` = `astro build && bash scripts/assert-dist.sh`.
- CI (`.github/workflows/ci.yml`, runner `wisechef-runner`): astro check,
  build, page-size anti-SPA-fallback asserts, auth-marker guard (greps
  `dist/index.html` AND `dist/_astro/` — Astro externalizes big scripts).
  CI does NOT deploy.
- Deploy: `npm run build` -> backup prod dist -> `rsync -az --delete dist/
  wisechef-hq:/home/wisechef/loopskill-portal/dist/`. Caddy serves it.
  NOTE (ah_0706): app.loopskill.io Caddy `root *` is
  `/home/wisechef/loopskill-portal/dist` — NOT `recipes-portal/dist` (that is
  the legacy recipes.wisechef.ai root, verify with `grep -A40 'app.loopskill.io'
  /etc/caddy/Caddyfile` on wisechef-hq). Rsyncing to recipes-portal/dist is a
  silent no-op on this domain — always re-probe the live URL after deploy.
  "Merged to main" is NOT "live" — re-probe live URLs after rsync.
- Redirects: static SSG means redirects are client-JS or Caddy. Cut pages
  301 in `/etc/caddy/Caddyfile` on wisechef-hq (`/graph`->`/skills`,
  `/stats`->`/home`, `/vs`->wisechef.ai, `/whitepaper`->`/whitepaper.pdf`,
  `/compatibility`->`/docs`, `/whats-new`->`/blog/`). Validate with
  `caddy validate` then `systemctl reload caddy` (sudo, on wisechef-hq).

## Page-cut policy (D6)

Cut pages are archived in git history + 301'd at Caddy — never hard-404 a
formerly-live URL. The 6 cuts above were Adam-confirmed 2026-06-12.

## P4 impress layer (where it lives)

- Unified search (one box, two groups): `AppShell.astro` (`#shell-search`).
  Hands off to `/skills?q=` — `skills/index.astro` honors `?q=`.
- First-login onboarding pane: `AppShell.astro` member hydration
  (localStorage `recipes_onboarding_v1`, only when 0 cookbooks).
- Inline upgrade wall: `composer.astro` `showUpgradeWall()` — cap 403 slides
  a panel into the basket pane, live `POST /api/checkout/pro_plus`. Never
  replace it with a toast or redirect.
- Ambient fleet status: `AppShell.astro` member hydration -> `#rail-fleet-status`.

Canonical architecture doc: `~/obsidian-vault/shared-knowledge/recipes/portal-architecture.md`.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **recipes-portal** (232 symbols, 305 relationships, 5 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/recipes-portal/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/recipes-portal/context` | Codebase overview, check index freshness |
| `gitnexus://repo/recipes-portal/clusters` | All functional areas |
| `gitnexus://repo/recipes-portal/processes` | All execution flows |
| `gitnexus://repo/recipes-portal/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

- Re-index: `npx gitnexus analyze`
- Check freshness: `npx gitnexus status`
- Generate docs: `npx gitnexus wiki`

<!-- gitnexus:end -->
