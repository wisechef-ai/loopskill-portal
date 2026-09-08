#!/usr/bin/env bash
# assert-dist.sh — Post-build CI gate for recipes-portal
#
# Prevents the WIS-737 incident class: Astro build completes "successfully"
# even when aggregator pages fail to render (e.g. API 429 during build).
# rsync --delete then ships the partial dist, wiping the previous good copy.
#
# This script asserts that critical aggregator pages exist in dist/ and are
# above a minimum size threshold. Run AFTER `astro build`, BEFORE deploy.
#
# Usage: bash scripts/assert-dist.sh [dist_dir]
#   dist_dir defaults to dist/
#
# Exit 0 = safe to deploy, Exit 1 = DO NOT DEPLOY

set -euo pipefail

DIST_DIR="${1:-dist}"
MIN_BYTES=$((5 * 1024))  # 5 KB

# Pages that MUST be present after every build.
# These are the aggregator pages that fetch the full catalog at build time
# and are most vulnerable to API failures silently producing empty output.
#
# feat/spotify-ia (council report §10/§12): skills/index.html is now a thin
# redirect stub (no longer the catalog aggregator) — the load-bearing pages
# are browse/index.html, home/index.html, and library/index.html.
# unisearch_0709/P3: skills/external/view/index.html joins the list. It is no
# longer just a detail page — it is the install surface every federated card on
# /browse now links to (one card per install_ref, href
# /skills/external/view?ref=...). If the build stops emitting it, every
# federated result on Browse becomes a dead link.
CRITICAL_PAGES=(
  "index.html"
  "browse/index.html"
  "home/index.html"
  "library/index.html"
  "fleet-map/index.html"
  "bundles/view/index.html"
  "skills/external/view/index.html"
)

failures=0

for page in "${CRITICAL_PAGES[@]}"; do
  path="$DIST_DIR/$page"

  if [ ! -f "$path" ]; then
    echo "FAIL: $path is MISSING (aggregator page not rendered)"
    failures=$((failures + 1))
    continue
  fi

  size=$(wc -c < "$path")
  if [ "$size" -lt "$MIN_BYTES" ]; then
    echo "FAIL: $path is ${size}B (below ${MIN_BYTES}B threshold — likely empty/error page)"
    failures=$((failures + 1))
    continue
  fi

  echo "OK:   $path (${size}B)"
done

if [ "$failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $failures critical page(s) failed assertion. Deploy aborted."
  echo "This usually means API 429s during build caused Astro to skip rendering."
  echo "Rebuild with a stable API connection before deploying."
  exit 1
fi

echo ""
echo "All critical pages present."

# ─────────────────────────────────────────────────────────────────────────
# Identity guards (2026-07-05, fix/identity-guards)
#
# Prevents the stale-brand incident class: LoopSkill was renamed from
# recipes.wisechef.ai, but several build-time constants and canonical URLs
# kept pointing at the old domain (or the un-served apex loopskill.io),
# telling search engines and installers to hit dead/wrong endpoints.
# These asserts fail the build (not just warn) because a regression here
# is a silent SEO/installer defect — nothing else in the pipeline catches it.
# ─────────────────────────────────────────────────────────────────────────

CANONICAL_ORIGIN="https://app.loopskill.io"
id_failures=0

fail_id() {
  echo "IDENTITY-FAIL: $1"
  id_failures=$((id_failures + 1))
}

# (a) robots.txt / sitemap.xml / llms.txt must never reference the legacy
# domain, and must never reference the bare loopskill.io apex as a path
# origin (content lives on app.loopskill.io; the apex serves only its own
# root page and 404s on everything else).
for f in robots.txt sitemap.xml llms.txt; do
  path="$DIST_DIR/$f"
  if [ -f "$path" ]; then
    if grep -n 'recipes\.wisechef\.ai' "$path" >/dev/null 2>&1; then
      fail_id "$path references recipes.wisechef.ai (stale brand) — offending line(s):"
      grep -n 'recipes\.wisechef\.ai' "$path" | sed 's/^/    /'
    fi
    # Bare apex path reference: https://loopskill.io/<something>. Matches
    # http(s)://loopskill.io followed by a '/' and at least one more char
    # (i.e. NOT just the bare origin with nothing after it), which is what
    # a broken canonical/sitemap/robots entry would emit.
    if grep -nE 'https?://loopskill\.io/[^"'"'"' <)]+' "$path" >/dev/null 2>&1; then
      fail_id "$path references the bare loopskill.io apex as a path origin (content is served from app.loopskill.io) — offending line(s):"
      grep -nE 'https?://loopskill\.io/[^"'"'"' <)]+' "$path" | sed 's/^/    /'
    fi
  fi
done

# (c) robots.txt Sitemap: line must point at app.loopskill.io specifically.
robots_path="$DIST_DIR/robots.txt"
if [ -f "$robots_path" ]; then
  if ! grep -qE '^Sitemap: https://app\.loopskill\.io/sitemap\.xml' "$robots_path"; then
    fail_id "$robots_path 'Sitemap:' line does not point at https://app.loopskill.io/sitemap.xml — found:"
    grep -n '^Sitemap:' "$robots_path" | sed 's/^/    /' || echo "    (no Sitemap: line found at all)"
  fi
fi

# (b) every dist/**/*.html rel=canonical must have origin https://app.loopskill.io.
# We extract the href value and check its scheme+host prefix. Relative-path
# canonicals (e.g. href="/signin?next=...", emitted by Astro.redirect() stub
# pages) are skipped — they resolve same-origin by construction and are not
# a domain-drift defect; this guard exists to catch ABSOLUTE hrefs pointing
# at the wrong host/apex.
while IFS= read -r -d '' html_file; do
  # Grep the canonical link tag (may have other attrs in either order; we
  # only require rel="canonical" and href="..." to both appear on the line
  # since Astro emits it as a single self-closing <link> element).
  canonical_line=$(grep -o '<link[^>]*rel="canonical"[^>]*>' "$html_file" || true)
  if [ -z "$canonical_line" ]; then
    continue
  fi
  href=$(echo "$canonical_line" | grep -oE 'href="[^"]*"' | sed -E 's/href="([^"]*)"/\1/')
  if [ -z "$href" ]; then
    fail_id "$html_file has a rel=canonical tag with no href: $canonical_line"
    continue
  fi
  case "$href" in
    http://*|https://*)
      case "$href" in
        "$CANONICAL_ORIGIN"|"$CANONICAL_ORIGIN"/*)
          : # ok — absolute and correct origin
          ;;
        *)
          fail_id "$html_file canonical origin is not $CANONICAL_ORIGIN — found href=\"$href\""
          ;;
      esac
      ;;
    *)
      : # relative href — same-origin by construction, not an identity defect
      ;;
  esac
done < <(find "$DIST_DIR" -name '*.html' -print0)

# (d) fictional catalog entries must never ship in dist/index.html. These
# descriptions were hardcoded build-time fallback data (indistinguishable
# from real catalog cards, shown with PRO/PRO+ badges) while the real
# catalog was empty — a direct contradiction of the pricing page's "never
# a feature gate" claim.
#
# IMPORTANT: we fingerprint by the OLD FALLBACK DESCRIPTION TEXT, not by
# skill title. "Web Scraper Pro" and "Smart Email Composer" are, as of
# 2026-07-05, ALSO real live catalog entries (confirmed via
# GET /api/skills/search) — the live descriptions differ from the removed
# hardcoded fallback text below. A title-only guard would permanently
# false-positive against genuine future catalog content; the description
# string is what actually identifies the fabricated fallback data.
FICTIONAL_DESCRIPTIONS=(
  "Headless scraping with Cloudflare bypass, structured output, and auto-retry."
  "Cognee + Postgres + pgvector wired together. MIT-licensed. The pro_open gateway"
)
# feat/spotify-ia (council report §7 kill-test #2 + §10): extend the guard
# beyond dist/index.html to the two new hero surfaces — Home shelves and
# Browse are equally vulnerable to fictional fallback data disguised as real
# catalog cards.
FICTIONAL_GUARD_PAGES=(
  "$DIST_DIR/index.html"
  "$DIST_DIR/home/index.html"
  "$DIST_DIR/browse/index.html"
)
for guard_page in "${FICTIONAL_GUARD_PAGES[@]}"; do
  if [ -f "$guard_page" ]; then
    for desc in "${FICTIONAL_DESCRIPTIONS[@]}"; do
      if grep -F -n "$desc" "$guard_page" >/dev/null 2>&1; then
        fail_id "$guard_page contains fictional hardcoded fallback description '$desc' — offending line(s):"
        grep -F -n "$desc" "$guard_page" | sed 's/^/    /'
      fi
    done
  fi
done

if [ "$id_failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $id_failures identity guard(s) failed. Deploy aborted."
  echo "This usually means a stale-brand string or fictional fallback data"
  echo "regressed back into the build. See fix/identity-guards PR for context."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────
# Bundles-public-pages guards (2026-07-05, feat/bundles-public-pages)
#
# Class rule: no homepage CTA may point at a page the build did not emit.
# The P0 this guards against: homepage bundle cards linked to
# /bundles/p/{slug} (path form) while no /bundles pages existed in the
# portal at all — both cards 404'd in prod. Two asserts:
#   (e) the new public bundle pages must actually be emitted by the build.
#   (f) dist/index.html must never regress to the broken path-form href —
#       homepage links must use the query form (/bundles/p?slug=...).
# ─────────────────────────────────────────────────────────────────────────

BUNDLES_PAGES=(
  "bundles/index.html"
  "bundles/p/index.html"
)

for page in "${BUNDLES_PAGES[@]}"; do
  path="$DIST_DIR/$page"
  if [ ! -f "$path" ]; then
    fail_id "$path is MISSING (public bundles page not rendered — homepage bundle-card CTAs would 404)"
  else
    echo "OK:   $path present"
  fi
done

index_html="$DIST_DIR/index.html"
if [ -f "$index_html" ]; then
  # Broken path form: href="/bundles/p/<slug>" (a literal slash + at least one
  # more path segment after "p/"). The correct query form is
  # href="/bundles/p?slug=..." which this pattern does not match.
  if grep -nE 'href="/bundles/p/[^"?]+' "$index_html" >/dev/null 2>&1; then
    fail_id "$index_html contains a broken path-form /bundles/p/<slug> href (must be the query form /bundles/p?slug=<slug>) — offending line(s):"
    grep -nE 'href="/bundles/p/[^"?]+' "$index_html" | sed 's/^/    /'
  fi
fi

if [ "$id_failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $id_failures identity/bundles guard(s) failed. Deploy aborted."
  echo "This usually means a stale-brand string, fictional fallback data, or a"
  echo "homepage CTA pointing at a page the build did not emit regressed back"
  echo "into the build. See fix/identity-guards and feat/bundles-public-pages"
  echo "PRs for context."
  exit 1
fi

echo "All identity guards passed (canonical origin, robots/sitemap/llms domain, no fictional catalog data)."
echo ""

# ─────────────────────────────────────────────────────────────────────────
# Spotify-model IA kill-tests (feat/spotify-ia, council report §7/§10)
#
# These are the build-checkable subset of the council's 12 kill-tests.
# Runtime-only checks (kill-tests #1, #6, #7, #8 — empty-shelf behavior,
# grouped-section caps, keyboard nav) are verified by curling the served
# dist/ output and are NOT re-implemented here; see the PR body for that
# evidence. This block covers the three that are cheaply build-checkable:
#   (g) rail has exactly 5 primary links in dist/home/index.html
#   (h) redirect stubs exist for every §5 legacy route
#   (i) dist/skills/<slug>/ detail dirs still exist (§8 SEO — must not be
#       swept up by the aggregator cut)
# ─────────────────────────────────────────────────────────────────────────

ia_failures=0
fail_ia() {
  echo "IA-FAIL: $1"
  ia_failures=$((ia_failures + 1))
}

# (g) Rail has exactly 5 primary nav destinations (Home / Browse / Your
# Library / Add to your agent (install_0902) / Federated (fednav_0902).
# We count anchors carrying the shared `rail-link` class emitted
# by AppShell.astro's primary <nav aria-label="Primary">, then normalize by
# href so the anon/member dual-render of "Your Library" (one goes to
# /signin?next=/library, the other to /library — only one is ever visible
# at a time via [data-shell-anon]/[data-shell-member], but AGENTS.md Trap C
# requires BOTH to exist in static HTML) counts as ONE destination, not two.
# The Pro pill and footer/account links intentionally do NOT carry the
# rail-link class (council §1: Pricing is a smaller pill, never primary nav).
home_html="$DIST_DIR/home/index.html"
if [ -f "$home_html" ]; then
  rail_dest_count=$(grep -oE '<a href="[^"]*"[^>]*class="rail-link[^"]*"' "$home_html" \
    | grep -oE 'href="[^"]*"' \
    | sed -E 's#href="/signin\?next=/library"#href="/library"#' \
    | sort -u | wc -l | tr -d ' ')
  if [ "$rail_dest_count" -ne 5 ]; then
    fail_ia "$home_html has $rail_dest_count distinct rail-link primary nav destinations — expected exactly 5 (Home, Browse, Your Library, Add to your agent, Federated)"
  else
    echo "OK:   $home_html has exactly 5 primary rail destinations"
  fi
else
  fail_ia "$home_html is MISSING — cannot verify rail primary-link count"
fi

# (h) Redirect stubs exist for every §5 legacy route migration target.
REDIRECT_STUB_PAGES=(
  "skills/index.html"
  "loops/index.html"
  "bundles/index.html"
  "personalities/index.html"
  "composer/index.html"
  "fleets/index.html"
  "cockpit/index.html"
  "carousel/index.html"
  "cookbooks/index.html"
  "cookbooks/view/index.html"
  "cookbooks/p/index.html"
)
for page in "${REDIRECT_STUB_PAGES[@]}"; do
  path="$DIST_DIR/$page"
  if [ ! -f "$path" ]; then
    fail_ia "$path is MISSING (redirect stub not rendered — a legacy bookmark would 404 until PR 2's Caddy redirects land)"
  elif ! grep -q 'noindex' "$path"; then
    fail_ia "$path does not carry robots noindex — a redirect stub must never be indexed as content"
  else
    echo "OK:   $path present (redirect stub)"
  fi
done

# (i) dist/skills/<slug>/ detail dirs must still exist — the aggregator cut
# (skills/index.html → redirect stub) must NOT have swept up the per-skill
# detail pages (council §8 SEO: these must stay live).
skill_detail_count=$(find "$DIST_DIR/skills" -mindepth 2 -maxdepth 2 -name 'index.html' 2>/dev/null | wc -l | tr -d ' ')
if [ "$skill_detail_count" -lt 1 ]; then
  fail_ia "No dist/skills/<slug>/index.html detail pages found — the aggregator cut may have swept up per-skill SEO pages (council §8 forbids this)"
else
  echo "OK:   $skill_detail_count dist/skills/<slug>/ detail page(s) present"
fi

# (j) dist/loops/<slug>/ detail dirs must exist — atomic_0714: src/pages/loops/[slug].astro
# was built TWICE (2026-07-08 commit 72a2dea, then silently deleted by the
# fc0d01f IA-restructure refactor with zero guard, then rebuilt 2026-07-14).
# Same regression-prevention pattern as (i) above — a future aggregator cut
# on loops/index.html must NOT sweep up the per-loop SEO detail pages.
loop_detail_count=$(find "$DIST_DIR/loops" -mindepth 2 -maxdepth 2 -name 'index.html' 2>/dev/null | wc -l | tr -d ' ')
if [ "$loop_detail_count" -lt 1 ]; then
  fail_ia "No dist/loops/<slug>/index.html detail pages found — src/pages/loops/[slug].astro may have been deleted or getStaticPaths broken (LRN-119, this has happened once before — commit fc0d01f)"
else
  echo "OK:   $loop_detail_count dist/loops/<slug>/ detail page(s) present"
fi

if [ "$ia_failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $ia_failures Spotify-IA kill-test(s) failed. Deploy aborted."
  echo "See feat/spotify-ia PR (council report §7/§10) for context."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────
# Unified-search guards (unisearch_0709 / P3)
#
# Three defects these exist to catch, none of which any other check sees:
#
#   (k) The federated group silently disappearing from Browse. It is rendered
#       by a client-side template, so `astro build` succeeds and the page is
#       the right size whether or not the group survives — the only evidence
#       in dist/ is the template string itself. Federated rows ARE the
#       catalog (91k+ indexed vs ~dozens curated); losing them is the
#       "where are all the skills?" defect the whole sprint exists to fix.
#
#   (l) The card-level "Copy for agent" affordance disappearing. Same failure
#       mode: it lives in a template string, so nothing else notices. Without
#       it, discovery and install are disconnected again — a visitor finds a
#       skill and has no way to hand it to an agent.
#
#   (m) A hardcoded inventory literal ("90,000+ skills", "91k+ entries")
#       creeping back into a search surface. Sprint locked decision #7: every
#       count in user-facing copy is live-derived from the API envelope
#       (enabled_sources / counts.external_installable), never a literal that
#       silently rots as the index grows. tests/p0-no-hardcoded-skill-counts
#       polices the .astro SOURCES for CATALOG counts; this polices the
#       RENDERED bytes for FEDERATED-scale ones, which that gate explicitly
#       does not cover.
# ─────────────────────────────────────────────────────────────────────────

us_failures=0
fail_us() {
  echo "UNISEARCH-FAIL: $1"
  us_failures=$((us_failures + 1))
}

browse_html="$DIST_DIR/browse/index.html"

# (k) the federated group markup must be present in the Browse bundle.
if [ -f "$browse_html" ]; then
  if grep -F -q 'data-federated-group' "$browse_html"; then
    echo "OK:   $browse_html ships the federated group markup"
  else
    fail_us "$browse_html has no data-federated-group marker — the federated results group is not being rendered on Browse (unisearch_0709/P3)"
  fi
else
  fail_us "$browse_html is MISSING — cannot verify the federated group"
fi

# (l) the card-level "Copy for agent" affordance must be present on Browse.
#
# Checked at BOTH ends deliberately. Grepping for the words alone would pass
# on a page that merely still defines the label constant in dead code, so:
#   - the RENDERED control must exist in the build-time prerendered cards
#     (real <button class="artifact-copy"> markup a non-JS reader receives), and
#   - the client-side card template must still CALL the builder, which is the
#     path every JS-rendered card (including every federated one) goes through.
# Removing either one alone turns this red.
COPY_SURFACES=(
  "$DIST_DIR/browse/index.html"
  "$DIST_DIR/skills/external/view/index.html"
)
for surface in "${COPY_SURFACES[@]}"; do
  if [ ! -f "$surface" ]; then
    fail_us "$surface is MISSING — cannot verify the Copy for agent affordance"
    continue
  fi
  if grep -F -q 'Copy for agent' "$surface"; then
    echo "OK:   $surface ships a Copy for agent affordance"
  else
    fail_us "$surface has no 'Copy for agent' affordance — federated results are discoverable again but not installable (unisearch_0709/P3)"
  fi
done

if [ -f "$browse_html" ]; then
  # Client path. Match the CALL SITE, not the identifier: grepping for
  # `copyForAgentHTML(type, item)` alone also matches the function's own
  # declaration, so deleting the call would have left this guard green.
  if ! grep -F -q '${likeButtonHTML(type, item)}${copyForAgentHTML(type, item)}' "$browse_html"; then
    fail_us "$browse_html's client card template no longer appends copyForAgentHTML to the artifact slot — every JS-rendered card, including every federated result, would ship with no install affordance"
  fi
  # Prerendered path. `data-copy-text="` followed by anything other than a
  # `$` is RENDERED markup — the client template's own copy of that attribute
  # is literally `data-copy-text="${esc(text)}"`, so it cannot satisfy this.
  # Self-skips when the build-time catalog prerender produced no cards at all
  # (a real, separately-guarded condition — not this guard's job to diagnose);
  # a real slug in data-artifact-slug is the proof that it did.
  if grep -qE 'data-artifact-slug="[a-z0-9][a-z0-9-]*"' "$browse_html"; then
    if ! grep -qE 'data-copy-text="[^$"]' "$browse_html"; then
      fail_us "$browse_html's build-time prerendered cards carry no rendered Copy for agent button — a non-JS reader gets a catalog with no install affordance"
    fi
  fi
fi

# The viewer's own button must carry the agent-shaped label, not the old
# bare "Copy" that handed a visitor a shell command.
viewer_html="$DIST_DIR/skills/external/view/index.html"
if [ -f "$viewer_html" ] && ! grep -qE '<button[^>]*id="copy-install-btn"[^>]*>Copy for agent<' "$viewer_html"; then
  fail_us "$viewer_html's #copy-install-btn is not labelled 'Copy for agent' — the viewer and the browse cards must offer ONE format"
fi

# (m) no hardcoded inventory literal in any search surface.
#
# Pattern: a comma-grouped or k-suffixed figure (optionally "+") sitting
# directly on an inventory noun — "90,000+ skills", "91k+ entries",
# "21,206 installable". Deliberately NARROW: bare 4-digit numbers appear all
# over legitimate markup (hashes, years, CSS), so the guard requires the noun.
INVENTORY_LITERAL='([0-9]{1,3},[0-9]{3}|[0-9]{2,4}k)\+?[[:space:]]*(\+[[:space:]]*)?(skills?|entries|results|registries|sources|installable)'
SEARCH_SURFACES=(
  "$DIST_DIR/browse/index.html"
  "$DIST_DIR/home/index.html"
  "$DIST_DIR/skills/external/view/index.html"
)
for surface in "${SEARCH_SURFACES[@]}"; do
  [ -f "$surface" ] || continue
  if grep -nEo "$INVENTORY_LITERAL" "$surface" >/dev/null 2>&1; then
    fail_us "$surface hardcodes an inventory count literal — counts must be live-derived from the API envelope (unisearch_0709 locked decision #7). Offending match(es):"
    grep -nEo "$INVENTORY_LITERAL" "$surface" | head -5 | sed 's/^/    /'
  fi
done

# (n) llms.txt must teach a CREDENTIAL-LESS agent the whole path (unisearch_0709/P4).
#
# llms.txt is the surface built for our primary buyer: an agent. Before P4 it
# listed the MCP tools without ever saying a key is required or where one comes
# from — and a keyless MCP call answers `401 {"detail":"Invalid or missing
# x-api-key header"}`. A cold agent therefore hit a 401 on its first call with
# nothing in the file explaining it, and gave up. That failure is invisible to
# every other check here: the build succeeds, the file is the right size, the
# identity guards pass, and only an agent that actually tried notices.
#
# These four tokens are the four things it cannot recover from on its own:
# where a key comes from, what to call, how to install, and the header that
# carries the key. Each is a separate guard so a regression names the exact
# step that went missing rather than "llms.txt changed".
llms_path="$DIST_DIR/llms.txt"
if [ ! -f "$llms_path" ]; then
  fail_us "$llms_path is MISSING — the machine-readable agent manifest was not emitted"
else
  # Written as (token, what an agent loses without it) pairs.
  COLD_START_TOKENS=(
    "agents/register|the enrollment endpoint — an agent with no credentials has no way to obtain one"
    "loopskill_search|the search tool name — an enrolled agent cannot find a skill"
    "metasearch/install|the keyless install route — a non-MCP agent cannot fetch a skill body"
    "x-api-key|the auth header — every MCP call 401s and the agent reads the 401 as a rejection"
  )
  for entry in "${COLD_START_TOKENS[@]}"; do
    token="${entry%%|*}"
    loses="${entry#*|}"
    if ! grep -F -q "$token" "$llms_path"; then
      fail_us "$llms_path does not mention '$token' — cold-agent onboarding is broken: $loses (unisearch_0709/P4)"
    else
      echo "OK:   $llms_path documents '$token'"
    fi
  done
fi

if [ "$us_failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $us_failures unified-search guard(s) failed. Deploy aborted."
  echo "See the unisearch_0709/P3 PR (Browse single-authority federated group +"
  echo "card-level Copy for agent) for context."
  exit 1
fi

echo "OK:   unified-search guards passed (federated group, Copy for agent, live counts)"
echo ""

# ─────────────────────────────────────────────────────────────────────────
# Dark-theme guard (mesh0408 W3)
#
# This site is dark-only: AppShell sets --color-bg #0a0a0a and every surface
# token is built for it. Tailwind's light-theme greys are therefore ALWAYS a
# defect here, and they fail silently — the build succeeds, the page renders,
# and only a human looking at it notices.
#
# /bootcamp shipped like that. The whole page was authored against a light
# design (bg-white/50 cards, border-gray-200, text-gray-600 body) and never
# converted. On the dark shell it rendered as translucent white panels with
# grey-on-grey text that was close to unreadable — on a public page, for
# months, while every automated check stayed green.
#
# `bg-white/N` is included deliberately: a translucent white panel is exactly
# what produced the bootcamp defect. If a genuinely white surface is ever
# wanted, it needs a token, not a raw utility.
# ─────────────────────────────────────────────────────────────────────────

theme_failures=0
LIGHT_THEME_CLASSES='class="[^"]*\b(bg-white(/[0-9]+)?|bg-gray-[0-9]{2,3}|text-gray-[0-9]{2,3}|border-gray-[0-9]{2,3}|bg-slate-[0-9]{2,3}(/[0-9]+)?|text-slate-[0-9]{2,3}|text-black)\b'

while IFS= read -r -d '' html_file; do
  if grep -nEo "$LIGHT_THEME_CLASSES" "$html_file" >/dev/null 2>&1; then
    echo "THEME-FAIL: $html_file uses light-theme utilities on a dark-only site:"
    grep -nEo "$LIGHT_THEME_CLASSES" "$html_file" | head -5 | sed 's/^/    /'
    theme_failures=$((theme_failures + 1))
  fi
done < <(find "$DIST_DIR" -name '*.html' -print0)

if [ "$theme_failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $theme_failures page(s) carry light-theme classes. Deploy aborted."
  echo "Use the site tokens: bg-bg-card / bg-bg-elev, text-text / text-muted /"
  echo "text-muted-soft, border-border, text-accent. See src/styles/global.css."
  exit 1
fi

echo "OK:   no light-theme utilities in any emitted page"

echo "All Spotify-IA kill-tests passed (rail link count, redirect stubs, skill detail pages)."
echo ""
echo "Safe to deploy."
exit 0
