#!/usr/bin/env bash
# assert-no-secret-in-dist.sh — nothing that looks like an API key may ever
# reach the deployable artifact.
#
# WHY (kanban t_c50df5cd, found 2026-11-16 while making build-time catalog
# calls present x-api-key). Vite substitutes `import.meta.env.FOO` with the
# LITERAL value at build time. `src/lib/api.ts` reads the build key that way, so
# a build run with LOOPSKILL_API_KEY/RECIPES_API_KEY exported writes the secret
# verbatim into `dist/.prerender/chunks/api_*.mjs` — measured on
# wisechef-agents, the deployed CI dist happened not to carry .prerender (and
# the live web root was grepped clean the same day), so nothing was exposed.
# That is luck about a deploy step, not a control. "Build a secret into an
# artifact and hope the rsync skips the directory" is precisely the class of
# latent exposure that only ever gets noticed after it ships.
#
# So: the key stays out of the artifact by construction (buildTimeApiKey()
# prefers process.env, which Vite cannot inline) AND this gate fails the build
# if a key literal appears anyway. A secret in dist IS a deploy blocker —
# unlike the catalog degradation note, this one is allowed to stop a deploy.
#
# Prints FILE NAMES ONLY. Never echoes a matched value: this script runs in
# CI logs, and a secret scanned into a log is the same leak with extra steps.
#
#   usage: assert-no-secret-in-dist.sh [DIST_DIR]     (default: dist)
set -uo pipefail

DIST_DIR="${1:-dist}"

if [ ! -d "$DIST_DIR" ]; then
  echo "SKIP: no $DIST_DIR to scan"
  exit 0
fi

# Hard-block patterns. Every one of them is written so the site's OWN install
# docs stay green: dist/docs/mcp/index.html legitimately ships
# `"LOOPSKILL_API_KEY": "rec_live_…"` and the copy-button script ships
# `x-api-key":"YOUR_KEY_…"` (measured 2026-11-16 — a first draft of this gate
# flagged both, and a deploy blocker that cries wolf is deleted inside a day,
# which is worse than no gate at all). The discriminator that separates those
# placeholders from a real key is a body of >=32 chars containing BOTH a digit
# AND an uppercase letter: the real member key is 52 chars with both, the docs
# placeholder is 22 chars all-lowercase, the JS placeholder 25 with no digit.
PATTERNS=(
  'rec_(live|test)_(?=[A-Za-z0-9_-]{32,})(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9_-]+'
  'sk-(proj|pat)-(?=[A-Za-z0-9_-]{20,})(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]+'
  'ghp_(?=[A-Za-z0-9]{30,})(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+'
  'x-api-key["'\'']?[[:space:]]*[:=][[:space:]]*["'\''](?=[A-Za-z0-9_-]{24,})(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Z])'
  '(LOOPSKILL|RECIPES)_API_KEY["'\'']?[[:space:]]*[:=][[:space:]]*["'\''](?=[A-Za-z0-9_-]{24,})(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Z])'
)

offenders=""
for pat in "${PATTERNS[@]}"; do
  # -l so only paths come back; -I skips binary; the matched text never leaves
  # this process, so a red build cannot leak the value into CI logs.
  hits=$(grep -rlIP "$pat" "$DIST_DIR" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    while IFS= read -r f; do offenders+="$f"$'\n'; done <<< "$hits"
  fi
done

if [ -n "$offenders" ]; then
  uniq_offenders=$(printf '%s' "$offenders" | sort -u)
  n=$(printf '%s\n' "$uniq_offenders" | grep -c .)
  echo "FAIL: $n file(s) under $DIST_DIR contain what looks like a live API key."
  printf '%s\n' "$uniq_offenders" | sed 's/^/        /'
  echo ""
  echo "  Values are deliberately NOT printed — this runs in CI logs."
  echo "  Likely cause: a build-time value reached the artifact via"
  echo "  import.meta.env (Vite inlines it). Read build-time secrets from"
  echo "  process.env in src/lib/api.ts instead, and treat this red as a"
  echo "  REASON TO ROTATE the key, not to re-run the build."
  exit 1
fi

echo "OK:   no API-key-shaped literals anywhere under $DIST_DIR"
exit 0
