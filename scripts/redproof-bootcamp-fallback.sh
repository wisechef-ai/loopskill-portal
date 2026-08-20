#!/usr/bin/env bash
# RED-proof the fallback rot: build with the bootcamp API unreachable.
#
# The fallback ONLY fires when /api/bootcamp fails, which is why the rot went
# unnoticed for months — a normal build never executes that branch.
#
# We force it by pointing the API base at port 9 (discard; nothing listens).
# That is HARSHER than the real failure mode: it also stops skills/[slug].astro
# from generating any detail page, so a handful of unrelated hardcoded CTAs
# (hero, pricing, billing/success) go 404 too. Those are a pre-existing property
# of a total blackout, not this bug — so we assert on the CURRICULUM slugs
# specifically, read from audit-links' own verdict rather than re-grepping dist.
#
#   before fix: 5 curriculum slugs dead  -> audit-links kills the build
#   after fix:  0                        -> dead steps render as plain text
set -uo pipefail
cd "$(dirname "$0")/.."

LOG=/tmp/fallback-build.log
CURRICULUM=(scrapling-official cognee comfyui chef maestro framework-v0
            manim-video multi-agent-discord-coordination local-tts-kokoro
            hyperspace-matrix client-reporter)

echo "=== building with the bootcamp API unreachable (port 9) ==="
PUBLIC_LOOPSKILL_API_BASE="http://127.0.0.1:9" \
PUBLIC_RECIPES_API_BASE="http://127.0.0.1:9" \
  npm run build > "$LOG" 2>&1
echo "build exit=$?  (a total blackout also breaks unrelated CTAs — see header)"

echo
echo "=== curriculum slugs reported dead by audit-links ==="
dead=()
for slug in "${CURRICULUM[@]}"; do
  grep -qE "^\s*/skills/${slug}\s+— 404" "$LOG" && dead+=("$slug")
done
if [ ${#dead[@]} -eq 0 ]; then
  echo "  none"
else
  printf '  DEAD: %s\n' "${dead[@]}"
fi

echo
echo "=== every dead route audit-links found (context) ==="
grep -E "^\s*/[a-z/-]+\s+— 404" "$LOG" || echo "  none"

echo
if [ ${#dead[@]} -eq 0 ]; then
  echo "PASS: the fallback ships no dead curriculum link even with its API down."
  exit 0
fi
echo "FAIL: ${#dead[@]} curriculum slug(s) still linked while dead — see $LOG"
exit 1
