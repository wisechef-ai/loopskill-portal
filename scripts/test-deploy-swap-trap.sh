#!/usr/bin/env bash
# Failure-injection test for the artifactfree_0730 swap trap.
# Extracts the real swap logic shape and drives it through 4 scenarios.
set -uo pipefail
PASS=0; FAIL=0
ok(){ echo "  PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# The swap body under test — mirrors ci.yml lines 231-258.
swap_body() {
  set -euo pipefail
  cd "$APP_DIR"
  test -d dist.incoming || { echo "ERR: dist.incoming missing"; exit 1; }
  test -f dist.incoming/index.html || { echo "ERR: dist.incoming/index.html missing"; exit 1; }
  STAMP=$(date -u +%Y%m%d-%H%M%S)-$$

  restore_on_abort() {
    rc=$?
    if [ ! -d dist ] && [ -d "dist.bak-${STAMP}" ]; then
      echo "::error::Swap aborted mid-window (rc=${rc}) — restoring dist.bak-${STAMP}"
      mv "dist.bak-${STAMP}" dist || echo "::error::RESTORE FAILED"
    fi
    exit "${rc}"
  }
  trap restore_on_abort EXIT INT TERM HUP

  if [ -d dist ]; then mv dist "dist.bak-${STAMP}"; fi

  # INJECTION POINT: simulate being killed / failing mid-window
  if [ "${INJECT:-none}" = "kill_midwindow" ]; then kill -TERM $$; sleep 5; fi
  if [ "${INJECT:-none}" = "fail_midwindow" ]; then exit 9; fi
  if [ "${INJECT:-none}" = "promote_fails" ]; then rm -rf dist.incoming; fi

  if ! mv dist.incoming dist; then
    echo "ERR: promote failed — restoring previous dist"
    if [ -d "dist.bak-${STAMP}" ]; then mv "dist.bak-${STAMP}" dist; fi
    exit 1
  fi
}

setup() {
  APP_DIR=$(mktemp -d); export APP_DIR
  mkdir -p "$APP_DIR/dist" "$APP_DIR/dist.incoming"
  echo "OLD-LIVE-SITE" > "$APP_DIR/dist/index.html"
  echo "NEW-BUILD" > "$APP_DIR/dist.incoming/index.html"
}
check_live() {  # $1=expected content, $2=scenario
  if [ ! -d "$APP_DIR/dist" ]; then no "$2 — dist MISSING (origin would 404!)"; return; fi
  got=$(cat "$APP_DIR/dist/index.html" 2>/dev/null || echo "<unreadable>")
  [ "$got" = "$1" ] && ok "$2 — dist present, content=$got" || no "$2 — expected '$1' got '$got'"
}

echo "=== 1. HAPPY PATH: swap succeeds, new build goes live ==="
setup; INJECT=none bash -c "$(declare -f swap_body); swap_body" >/dev/null 2>&1; echo "  exit=$?"
check_live "NEW-BUILD" "happy path"
[ -d "$APP_DIR"/dist.bak-* ] && ok "backup retained for rollback" || no "no backup kept"

echo "=== 2. KILLED MID-WINDOW (SIGTERM between the two mv calls) ==="
setup; INJECT=kill_midwindow bash -c "$(declare -f swap_body); swap_body" >/dev/null 2>&1; echo "  exit=$?"
check_live "OLD-LIVE-SITE" "killed mid-window"

echo "=== 3. HARD FAILURE MID-WINDOW (exit 9 between the two mv calls) ==="
setup; INJECT=fail_midwindow bash -c "$(declare -f swap_body); swap_body" >/dev/null 2>&1; rc=$?; echo "  exit=$rc"
check_live "OLD-LIVE-SITE" "failed mid-window"
[ "$rc" -eq 9 ] && ok "propagates original exit code 9" || no "exit code became $rc, expected 9"

echo "=== 4. PROMOTE FAILS (dist.incoming vanishes before the mv) ==="
setup; INJECT=promote_fails bash -c "$(declare -f swap_body); swap_body" >/dev/null 2>&1; echo "  exit=$?"
check_live "OLD-LIVE-SITE" "promote fails"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
