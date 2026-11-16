#!/usr/bin/env bash
#
# ocr-gate.sh — executable form of AGENTS.md rule 3 ("never let a failed `ocr`
# invocation become a skipped review").
#
# The gate is only real if "could not run" is distinguishable from "nothing to
# review". Before this script, both cases looked like an absent/silent `ocr` and
# an agent committing could read either one as permission to skip. They now have
# different exit codes, and 2 and 3 both mean: STOP, review another way.
#
# Usage:
#   scripts/ocr-gate.sh                      # workspace diff (staged+unstaged+untracked)
#   scripts/ocr-gate.sh --from main          # branch against main
#   scripts/ocr-gate.sh --from main --to feat
#   scripts/ocr-gate.sh -c <sha>             # one commit
#
# Exit codes:
#   0  review material produced, OR there is genuinely no diff
#   2  `ocr` binary missing or unrunnable  -> NOT a skip; run the degrade protocol
#   3  `ocr` errored / produced no usable material for a real diff -> NOT a skip
#
# Env:
#   OCR_BIN   override binary path (default: ~/bin/ocr, then `ocr` on PATH)
#
# Delegate mode is the fleet default: it needs no API key, no provider, no
# credits, so a quota cannot block it. `OCR_NO_UPDATE=1` is set here so the
# binary never spends an agent loop on a background update check.

set -uo pipefail

export OCR_NO_UPDATE=1

GATE="ocr-gate"
die() { echo "${GATE}: $*" >&2; }

# --- resolve the binary -----------------------------------------------------
# Every failure mode here exits 2, never 0. A missing binary is the exact case
# that used to degrade silently into a skipped review.
OCR_BIN="${OCR_BIN:-}"
if [[ -z "${OCR_BIN}" ]]; then
  if [[ -x "${HOME}/bin/ocr" ]]; then
    OCR_BIN="${HOME}/bin/ocr"
  elif command -v ocr >/dev/null 2>&1; then
    OCR_BIN="$(command -v ocr)"
  fi
fi

if [[ -z "${OCR_BIN}" ]]; then
  cat >&2 <<'EOF'
ocr-gate: BLOCKED — `ocr` binary not found (checked $OCR_BIN, ~/bin/ocr, PATH).

This is NOT permission to skip the review (AGENTS.md rule 3). Sanctioned
degrade path, in order:

  1. Install the keyless delegate lane (~60s, no API key, no provider):
       VER=v1.13.10
       BASE=https://github.com/alibaba/open-code-review/releases/download/$VER
       curl -fsSLO $BASE/sha256sum.txt
       curl -fsSLO $BASE/opencodereview-linux-amd64   # pick your platform asset
       sha256sum -c sha256sum.txt --ignore-missing    # must print "...: OK" first
       install -m 0755 opencodereview-linux-amd64 ~/bin/ocr
     or: npm install -g @alibaba-group/open-code-review
     Note: ~/bin is not on PATH on every host (wisechef-hq); this gate resolves
     ~/bin/ocr by absolute path, so a bare `ocr` miss is not evidence of absence.
  2. If you truly cannot install it, do the review yourself at the delegate
     standard — adversarial self-review plus at least one negative control that
     fails against the pre-change code — and say so in the commit body:
       ocr-review: degraded (binary absent); adversarial self-review + N controls
     An undeclared skip is the drift this gate exists to catch.
EOF
  exit 2
fi

if ! OCR_VER="$("${OCR_BIN}" --version 2>&1)"; then
  die "BLOCKED — '${OCR_BIN}' is present but not runnable: ${OCR_VER}"
  die "Treat as a failed invocation, not a skipped review (rule 3). Exit 3."
  exit 3
fi
echo "${GATE}: binary ${OCR_BIN} ($(echo "${OCR_VER}" | head -1))"

# --- step 1: what would be reviewed ----------------------------------------
PREVIEW_ARGS=(delegate preview --format json "$@")
if ! PREVIEW_JSON="$("${OCR_BIN}" "${PREVIEW_ARGS[@]}" 2>&1)"; then
  die "BLOCKED — 'ocr delegate preview' failed:"
  echo "${PREVIEW_JSON}" >&2
  die "A failed invocation is not a skipped review (rule 3). Fix or degrade; do not commit."
  exit 3
fi

if [[ -z "${PREVIEW_JSON//[[:space:]]/}" ]]; then
  die "BLOCKED — 'ocr delegate preview' returned no output at all (rule 3)."
  exit 3
fi

# Parse the preview. If python3 is unavailable we degrade to text passthrough
# rather than pretending the gate passed, so parse failures surface.
if ! command -v python3 >/dev/null 2>&1; then
  die "python3 missing; falling back to text preview (rules not auto-resolved)."
  "${OCR_BIN}" delegate preview "$@" || { die "delegate preview failed (rule 3)."; exit 3; }
  exit 0
fi

SUMMARY="$(printf '%s' "${PREVIEW_JSON}" | python3 -c '
import json,sys
try:
    d=json.loads(sys.stdin.read())
except Exception as e:
    print(f"PARSE_ERROR {e}"); sys.exit(0)
rv=[f.get("path","") for f in d.get("reviewable_files",[]) if f.get("path")]
ex=[(f.get("path",""),f.get("exclude_reason","?")) for f in d.get("excluded_files",[]) if f.get("path")]
print("MODE",d.get("mode","?"))
print("TOTAL",d.get("total_files",0))
print("REVIEWABLE",d.get("reviewable_count",len(rv)))
print("INS",d.get("total_insertions",0),"DEL",d.get("total_deletions",0))
for p in rv: print("R|"+p)
for p,r in ex: print("E|"+p)
' 2>&1)"

if [[ "${SUMMARY}" == PARSE_ERROR* ]]; then
  die "BLOCKED — could not parse delegate preview output: ${SUMMARY}"
  exit 3
fi

MODE="$(awk '$1=="MODE"{print $2}' <<<"${SUMMARY}")"
TOTAL="$(awk '$1=="TOTAL"{print $2}' <<<"${SUMMARY}")"
REVIEWABLE="$(awk '$1=="REVIEWABLE"{print $2}' <<<"${SUMMARY}")"
STATS="$(awk '$1=="INS"{print "+"$2" -"$4}' <<<"${SUMMARY}")"
# marker-prefixed paths, stripped without word-splitting (paths may contain spaces)
mapfile -t REVIEW_PATHS < <(sed -n 's/^R|//p' <<<"${SUMMARY}")
mapfile -t EXCLUDED_PATHS < <(sed -n 's/^E|//p' <<<"${SUMMARY}")

echo "${GATE}: mode=${MODE} files=${TOTAL} reviewable=${REVIEWABLE} excluded=${#EXCLUDED_PATHS[@]} (${STATS})"

# Genuinely nothing to review: an empty diff. This is the ONLY case that exits 0
# without producing rules.
if [[ "${TOTAL}" == "0" ]]; then
  echo "${GATE}: no diff — nothing to review. Commit is unblocked."
  exit 0
fi

# --- step 2: resolve rules --------------------------------------------------
# The deterministic filter drops non-code extensions (.md, .txt, ...) as
# `unsupported_ext`, which makes a docs-only diff look like an empty one.
# `delegate rule` resolves rules for any path you name, so ask for EVERY changed
# file — reviewable and filtered-out alike. A docs change is review material
# (this very section drifted once already); excluding it from the ruleset would
# recreate the silent skip one level up.
TARGET_PATHS=()
seen=" "
add_path() {
  local p="$1"
  [[ -z "${p}" ]] && return 0
  case "${seen}" in *" ${p} "*) return 0 ;; esac
  seen="${seen}${p} "
  TARGET_PATHS+=("${p}")
}
for p in "${REVIEW_PATHS[@]}"; do add_path "${p}"; done
if [[ ${#EXCLUDED_PATHS[@]} -gt 0 && "${REVIEWABLE}" -eq 0 ]]; then
  echo "${GATE}: NOTE — the deterministic filter excluded every changed file"
  echo "${GATE}:        (${EXCLUDED_PATHS[*]}). That is NOT 'nothing to review'."
  echo "${GATE}:        Resolving rules for those paths explicitly instead."
fi
for p in "${EXCLUDED_PATHS[@]}"; do add_path "${p}"; done

if [[ ${#TARGET_PATHS[@]} -eq 0 ]]; then
  die "BLOCKED — a real diff produced no rule targets (rule 3). Review the diff manually."
  exit 3
fi

if ! RULES="$("${OCR_BIN}" delegate rule "${TARGET_PATHS[@]}" 2>&1)"; then
  die "BLOCKED — 'ocr delegate rule' failed:"
  echo "${RULES}" >&2
  exit 3
fi
if [[ -z "${RULES//[[:space:]]/}" ]]; then
  die "BLOCKED — 'ocr delegate rule' returned no rules for: ${TARGET_PATHS[*]} (rule 3)."
  exit 3
fi

# --- hand off to the host agent --------------------------------------------
echo
echo "===== ocr delegate preview (json) ====="
printf '%s\n' "${PREVIEW_JSON}"
echo
echo "===== resolved rules (${#TARGET_PATHS[@]} file(s)) ====="
printf '%s\n' "${RULES}"
echo
echo "===== next (host agent) ====="
echo "1. Read each diff — git --no-pager diff --no-ext-diff --no-textconv --no-color HEAD -- \"<path>\""
echo "   (untracked files: cat them). Use the mode/refs above: mode=${MODE}"
echo "2. Apply the rule set above to each file yourself. You are the LLM in this lane."
echo "3. critical/high findings BLOCK the commit (AGENTS.md rule 1) — fix, or record the"
echo "   false-positive reasoning in the commit body. low is advisory (rule 2)."
echo "4. Stamp the commit body so the gate is auditable:"
echo "     ocr-review: delegate (${#TARGET_PATHS[@]} file(s), mode=${MODE})"
