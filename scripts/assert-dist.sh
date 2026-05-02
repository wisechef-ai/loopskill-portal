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
echo "All critical pages present. Safe to deploy."
exit 0
