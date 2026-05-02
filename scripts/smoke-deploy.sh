#!/usr/bin/env bash
# smoke-deploy.sh — Post-rsync smoke test for recipes.wisechef.ai
#
# After deploying, curl the critical aggregator pages to verify they return
# real content. Catches the case where a bad dist was synced to production.
#
# Usage: bash scripts/smoke-deploy.sh [base_url]
#   base_url defaults to https://recipes.wisechef.ai
#
# Run AFTER rsync, BEFORE announcing deploy complete.
# Exit 0 = site healthy, Exit 1 = ROLL BACK

set -euo pipefail

BASE_URL="${1:-https://recipes.wisechef.ai}"
MIN_BYTES=$((5 * 1024))  # 5 KB

CRITICAL_PATHS=(
  "/"
  "/skills"
)

failures=0

for path in "${CRITICAL_PATHS[@]}"; do
  url="${BASE_URL}${path}"

  # Fetch with timeout, capture status code and body size
  tmpfile=$(mktemp)
  http_code=$(curl -sS -o "$tmpfile" -w "%{http_code}" --max-time 15 "$url" 2>/dev/null || echo "000")
  size=$(wc -c < "$tmpfile" 2>/dev/null || echo "0")
  rm -f "$tmpfile"

  if [ "$http_code" != "200" ]; then
    echo "FAIL: $url → HTTP $http_code (expected 200)"
    failures=$((failures + 1))
    continue
  fi

  if [ "$size" -lt "$MIN_BYTES" ]; then
    echo "FAIL: $url → ${size}B (below ${MIN_BYTES}B threshold — likely error page)"
    failures=$((failures + 1))
    continue
  fi

  echo "OK:   $url → HTTP $http_code (${size}B)"
done

if [ "$failures" -gt 0 ]; then
  echo ""
  echo "SMOKE FAIL: $failures page(s) failed. ROLL BACK the deploy."
  echo "Check dist/ integrity and rebuild if needed."
  exit 1
fi

echo ""
echo "All smoke tests passed. Site is live."
exit 0
