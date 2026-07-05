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
CRITICAL_PAGES=(
  "index.html"
  "skills/index.html"
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
index_html="$DIST_DIR/index.html"
if [ -f "$index_html" ]; then
  for desc in "${FICTIONAL_DESCRIPTIONS[@]}"; do
    if grep -F -n "$desc" "$index_html" >/dev/null 2>&1; then
      fail_id "$index_html contains fictional hardcoded fallback description '$desc' — offending line(s):"
      grep -F -n "$desc" "$index_html" | sed 's/^/    /'
    fi
  done
fi

if [ "$id_failures" -gt 0 ]; then
  echo ""
  echo "BLOCKED: $id_failures identity guard(s) failed. Deploy aborted."
  echo "This usually means a stale-brand string or fictional fallback data"
  echo "regressed back into the build. See fix/identity-guards PR for context."
  exit 1
fi

echo "All identity guards passed (canonical origin, robots/sitemap/llms domain, no fictional catalog data)."
echo ""
echo "Safe to deploy."
exit 0
