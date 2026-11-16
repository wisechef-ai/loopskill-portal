# loopskill-portal — agent guide (spotify_2607 Phase −1, updated 2026-07-26)

`app.loopskill.io` — Astro 5 STATIC site (no SSR; `astro.config.mjs` has no
`output:` line). npm, Node 22. Marketing for the product lives on `wisechef.ai`
(separate repo `wisechef-portal-v3`); THIS repo is the app.

## ⚠️ Repo identity — read before you push

The live repo is **`wisechef-ai/loopskill-portal`**. It owns the CI runner
(`wisechef-hq-portal`, on the prod host), the `RECIPES_API_KEY` secret, and the
deploy job.

`wisechef-ai/recipes-portal` was **ARCHIVED read-only on 2026-07-26**. Pushes to
it are rejected with a misleading *"Please make sure you have the correct access
rights"* — check `archived` before debugging credentials. Any doc, skill, or
note saying "origin = recipes-portal, the loopskill remote is stale" is
**INVERTED and wrong**; that guidance predates 2026-07-26.

Runners and secrets are **per-repo and do NOT transfer** when a repo is
archived — both were re-provisioned on `loopskill-portal` in Phase −1. The
archived repo's 4 stranded PRs live on as `rescued/recipes-portal-pr-*`
branches here; see issue #23.

Locally, `origin` points at `loopskill-portal`; the archive is kept as
`archived-recipes-portal` with its push URL deliberately disabled.

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

## Build, CI, deploy (CI DEPLOYS — this is not manual)

- `npm run build` = `astro build && bash scripts/assert-dist.sh`.
- CI (`.github/workflows/ci.yml`, job "Build (Astro) + deploy on main", runner
  `wisechef-runner`): astro check, build, page-size anti-SPA-fallback asserts,
  auth-marker guard (greps `dist/index.html` AND `dist/_astro/` — Astro
  externalizes big scripts), **then rsyncs `dist/` to prod in the SAME job**
  (artifactfree_0730: build+deploy were merged so a passing build cannot ship
  a different artifact than the one tested). A merge to `main` DEPLOYS.
  *(Corrected 2026-08-25: this section previously said "deploy is MANUAL",
  which predates artifactfree_0730 and would send an agent doing a redundant
  hand-rsync over a deploy that already happened.)*
- **Nightly rebuild (added 2026-08-25, PR #88):** `schedule: 20 3 * * *` on the
  same workflow, with all 7 deploy gates and the concurrency group widened from
  `event_name == 'push'` to `push || schedule`. This exists because the portal
  is STATIC: skills published through the API are invisible on the site until
  something rebuilds it. It REPLACED `ops/install-rebuild-timer.sh`, which
  targeted the ARCHIVED `/home/wisechef/recipes-portal` path and was never
  installed on the host — i.e. there was no working scheduled rebuild at all.
  Verify it is still firing: `gh run list --repo wisechef-ai/loopskill-portal
  --workflow ci.yml --event schedule --limit 3` must show recent runs.
- Deploy target: Caddy `root *` for app.loopskill.io is
  `/home/wisechef/loopskill-portal/dist` — NOT `recipes-portal/dist` (that is
  the legacy recipes.wisechef.ai root, verify with `grep -A40 'app.loopskill.io'
  /etc/caddy/Caddyfile` on wisechef-hq). Writing to recipes-portal/dist is a
  silent no-op on this domain.
  **"Merged to main" is NOT "live" — always re-probe the live URL.** Cheap
  proof the deploy landed: `curl -sI https://app.loopskill.io/ | grep -i
  last-modified` should be minutes old, and the run's `headSha` should equal
  `git rev-parse origin/main`.
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

## Pre-commit gate: `ocr` review (alibaba/open-code-review)

**Before you commit code, review the diff with `ocr`.** Not a suggestion — it is
the step between "tests pass" and `git commit`. Tests prove the code does what
you told it to; this catches what you didn't think to tell it.

`ocr` is Alibaba's open-source hybrid reviewer (Apache-2.0): a deterministic
pipeline (file selection, rule resolution, line mapping) with an LLM agent on
top. It reports **line-accurate** findings with `severity` and `category`, and
it is tuned for precision over recall — it stays silent rather than guessing, so
a finding is worth reading.

### Run the gate, don't retype it

```bash
scripts/ocr-gate.sh                 # workspace diff
scripts/ocr-gate.sh --from main     # branch against main
scripts/ocr-gate.sh -c <sha>        # one commit
```

The script resolves the binary, runs `ocr delegate preview` +
`ocr delegate rule`, and hands you the reviewable file list with its resolved
rule set. **Read its exit code — that exit code is the whole point of the script:**

| exit | meaning | commit allowed? |
|---|---|---|
| `0` | review material produced, or genuinely no diff | yes — after you do the review |
| `2` | binary missing / not installed | **no** — install it, or use the declared degrade path (rule 3) |
| `3` | `ocr` errored, or produced no usable material for a real diff | **no** — a failed invocation is not a skipped review |

Before this script existed, "gate unrunnable" and "nothing to review" were
indistinguishable, so an agent could read a missing binary as permission to
commit unreviewed. `2` and `3` must never be read as "nothing to review".

### Where the binary actually lives

Verified 2026-11-16 on the fleet hosts; re-verify with `ls -l ~/bin/ocr` and
`ocr --version` before trusting this table — it rots.

| host | binary | real git clone of this repo | bare `ocr` on PATH |
|---|---|---|---|
| **wisechef-agents** | `~/bin/ocr` v1.13.10 | `~/repos/loopskill-portal-git` | yes |
| **wisechef-hq** | `~/bin/ocr` v1.13.10 | none — `~/loopskill-portal` is a deploy dir with no `.git` | **no** — call `~/bin/ocr` explicitly |
| CI runner | not installed | `_work/loopskill-portal/…` | n/a — CI has its own gates |

Commits happen on **wisechef-agents**. hq carries a binary so the gate is
runnable there too, but there is no working clone to commit from.

Install (pinned + checksum-verified — never execute an unverified download):

```bash
VER=v1.13.10
BASE=https://github.com/alibaba/open-code-review/releases/download/$VER
curl -fsSLO $BASE/sha256sum.txt
curl -fsSLO $BASE/opencodereview-linux-amd64   # pick your platform asset
sha256sum -c sha256sum.txt --ignore-missing    # must print "...: OK" before running
install -m 0755 opencodereview-linux-amd64 ~/bin/ocr
```

or `npm install -g @alibaba-group/open-code-review`. The pinned linux-amd64
v1.13.10 asset is
`sha256 8a0cbf6dfaa1d8681ad3d854971623e34b3f51c4585d2c4ae352f1ff5eee5cb8`.
`ocr --version` confirms; `OCR_NO_UPDATE=1` suppresses the background update check.

### Default: delegate mode (no LLM endpoint, no cost, always available)

You already have an LLM — you are one. Delegate mode uses `ocr` for the
deterministic half only and hands the actual reviewing to you:

```bash
ocr delegate preview --format json          # what would be reviewed + refs
ocr delegate rule <file> [<file>...]        # the resolved rule set for those files
```

Then read the diff and apply those rules yourself. This path needs **no API
key, no provider, no credits** — it is the fleet default and it cannot be
blocked by an exhausted quota.

### Full mode (when a funded endpoint is configured)

```bash
ocr review --audience agent --background "<why this change exists>"   # workspace
ocr review --audience agent -c <sha>                                  # one commit
ocr review --audience agent --from main --to <branch>                 # a PR
ocr review --preview                                                  # dry-run, no LLM
```

Always pass `--background` — the reviewer's precision depends on knowing what
the change is *for*. Always pass `--audience agent` (summary only, no progress
UI). For big diffs write to a file (`--output /tmp/ocr.txt`) and read it whole;
piping through `head`/`tail` silently drops earlier findings.

### Provider state (verify before trusting, do not assume)

Config lives in **`~/.opencodereview/config.json`** — *not*
`~/.config/opencodereview/`. The env trio `OCR_LLM_URL` / `OCR_LLM_TOKEN` /
`OCR_LLM_MODEL` (or `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` /
`ANTHROPIC_MODEL`) satisfies it too.

Quota and provider availability change weekly, so there is no table here to go
stale — `ocr llm test` is the one-second truth check and it is the only
acceptable answer to "is the full lane up":

```bash
~/bin/ocr llm test
```

`no valid LLM endpoint configured` is a *configuration* fact, not a broken tool,
and the delegate lane above still works. One lane worth trying (it answered
`/v1/models` with `qwen3.8-27b-heretic` on 2026-11-16; free, slow on large
diffs):

```bash
OCR_LLM_URL=http://100.106.27.136:8000/v1 \
OCR_LLM_MODEL=qwen3.8-27b-heretic OCR_LLM_TOKEN=unused ~/bin/ocr llm test
```

A `402`/`429` is a **billing** fact, not a broken tool — fall back to
`ocr delegate`, never skip the review.

### Docs-only diffs are not empty diffs

The deterministic filter drops non-code files as `unsupported_ext`, so a
Markdown-only change reports `reviewable_count: 0` and is byte-for-byte as
convincing as an empty diff. It is not empty. `ocr delegate rule <path>` resolves
rules for any path you name explicitly, and `scripts/ocr-gate.sh` does exactly
that when the filter swallows every changed file — so never conclude that a docs
diff needs no review.

### Rules

1. **A finding at `critical` or `high` blocks the commit.** Fix it or write down
   why it is a false positive — in the commit body, not in your head.
2. **`low` severity is advisory.** Discard nitpicks; do not burn a cycle on style.
3. **Never let a failed `ocr` invocation become a skipped review.** A missing
   binary, an exec failure, empty output, and "every file was filtered out" are
   all *failed invocations* — none of them is an empty diff. The delegate path
   has no dependency that can fail once installed, so install it. If you
   genuinely cannot, review the diff yourself to the delegate standard —
   adversarial self-review plus at least one negative control that goes red
   against the pre-change code — and **declare it in the commit body**:
   `ocr-review: degraded (binary absent); adversarial self-review + N controls`.
   An undeclared skip is precisely the drift this gate exists to catch.
4. **Stamp reviewed commits** so the gate is auditable after the fact:
   `ocr-review: delegate (N file(s), mode=workspace)`.
5. **This does not replace CI, tests, or human review.** It is the cheapest gate
   in the chain and it runs first, before the expensive ones have to.

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
