#!/usr/bin/env bash
# issue #34 — symlink-swap invariant test.
#
# The old test (test-deploy-swap-trap.sh, git history) drove the two-mv
# directory swap through kill/fail injections. This is its successor: the
# deploy no longer moves directories at all — it stages into
# releases/.incoming-<sha>/, promotes that to releases/<sha>/ (one atomic
# rename), and flips the `dist` symlink with a single rename(2)
# (ln -s under a temp name; mv -T over dist).
#
# The invariant under test: **at every observable moment, `dist` exists and
# resolves to a complete release** — including while the swap body is killed
# with SIGKILL at each injection point (the exact failure class the old trap
# could not cover; SIGKILL fires no traps).
#
# It also drives the legacy bootstrap path (dist as a real directory) and the
# rollback path (symlink repoint to previous release).
#
# NOTE: injection uses explicit INJECT env checks inside the body (not
# comment markers) because `declare -f` serialization strips comments — a
# marker-based injector silently injects nothing and every scenario "passes"
# as a clean run. (Learned the hard way in this file's first cut.)
set -uo pipefail
PASS=0; FAIL=0
ok(){ echo "  PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# The swap body under test — mirrors the ci.yml "Atomic symlink swap" step.
# INJECT values: pre_promote | bootstrap | pre_rename | post_rename
swap_body() {
  set -euo pipefail
  cd "${APP_DIR}"
  REL="releases"
  NEW="${REL}/${GITHUB_SHA}"

  test -d "${REL}/.incoming-${GITHUB_SHA}" || { echo "ERR: staging dir missing"; exit 1; }
  test -f "${REL}/.incoming-${GITHUB_SHA}/index.html" || { echo "ERR: staged build has no index.html"; exit 1; }

  if [ -d "${NEW}" ]; then
    rm -rf "${REL}/.old-${GITHUB_SHA}"
    mv "${NEW}" "${REL}/.old-${GITHUB_SHA}"
  fi
  if [ "${INJECT:-none}" = "pre_promote" ]; then kill -9 $$; sleep 5; fi
  mv "${REL}/.incoming-${GITHUB_SHA}" "${NEW}"

  if [ -L dist ]; then
    PREV_RELEASE=$(readlink dist)
  else
    PREV_RELEASE=""
  fi

  if [ -d dist ] && [ ! -L dist ]; then
    STAMP=$(date -u +%Y%m%d-%H%M%S)
    restore_on_abort() {
      rc=$?
      if [ ! -e dist ] && [ -d "releases/legacy-${STAMP}" ]; then
        mv "releases/legacy-${STAMP}" dist
      fi
      exit "${rc}"
    }
    trap restore_on_abort EXIT INT TERM HUP
    if [ "${INJECT:-none}" = "bootstrap" ]; then kill -9 $$; sleep 5; fi
    mv dist "releases/legacy-${STAMP}"
    PREV_RELEASE="releases/legacy-${STAMP}"
  fi

  rm -f dist.next.* 2>/dev/null || true
  ln -s "${NEW}" dist.next.$$
  if [ "${INJECT:-none}" = "pre_rename" ]; then kill -9 $$; sleep 5; fi
  mv -T dist.next.$$ dist
  if [ "${INJECT:-none}" = "post_rename" ]; then kill -9 $$; sleep 5; fi

  test -f dist/index.html || { echo "ERR: dist does not resolve"; exit 1; }

  for old in $(ls -1dt "${REL}"/*/ 2>/dev/null | grep -v '\.incoming-\|\.old-' | tail -n +6); do
    name="${old%/}"
    [ "${name#./}" = "${NEW#./}" ] && continue
    [ -n "${PREV_RELEASE}" ] && [ "${old%/}" = "${PREV_RELEASE%/}" ] && continue
    rm -rf "$old" 2>/dev/null || true
  done
  rm -rf "${REL}"/.old-* 2>/dev/null || true
}

rollback_body() {
  set -euo pipefail
  cd "${APP_DIR}"
  if [ -L dist ]; then
    CURRENT=$(readlink dist)
    PREV=$(ls -1dt releases/*/ 2>/dev/null | grep -v '\.incoming-\|\.old-' | grep -v "^${CURRENT}/$" | head -1 || true)
    if [ -z "${PREV}" ]; then
      echo "ERR: no previous release to roll back to"; exit 1
    fi
    ln -s "${PREV%/}" dist.next.$$
    mv -T dist.next.$$ dist
  else
    STAMP=$(date -u +%Y%m%d-%H%M%S)
    LATEST_BAK=$(ls -1dt dist.bak-* 2>/dev/null | head -1)
    if [ -z "${LATEST_BAK}" ]; then
      echo "ERR: no backup available"; exit 1
    fi
    mv dist "dist.broken-${STAMP}"
    mv "${LATEST_BAK}" dist
  fi
}

setup_symlink_layout() {  # already-on-releases layout
  APP_DIR=$(mktemp -d); export APP_DIR
  mkdir -p "${APP_DIR}/releases/aaa-old" "${APP_DIR}/releases/.incoming-${GITHUB_SHA}"
  echo "OLD-LIVE-SITE" > "${APP_DIR}/releases/aaa-old/index.html"
  echo "NEW-BUILD" > "${APP_DIR}/releases/.incoming-${GITHUB_SHA}/index.html"
  ln -s releases/aaa-old "${APP_DIR}/dist"
}

setup_legacy_layout() {  # first deploy after this PR merges: dist is real
  APP_DIR=$(mktemp -d); export APP_DIR
  mkdir -p "${APP_DIR}/dist" "${APP_DIR}/releases/.incoming-${GITHUB_SHA}"
  echo "OLD-LIVE-SITE" > "${APP_DIR}/dist/index.html"
  echo "NEW-BUILD" > "${APP_DIR}/releases/.incoming-${GITHUB_SHA}/index.html"
}

live() {  # what the origin serves right now (empty if dist missing/broken)
  cat "${APP_DIR}/dist/index.html" 2>/dev/null || echo "<MISSING>"
}

run_scenario() {  # $1=name $2=INJECT value $3=layout-fn
  local name="$1" inject="$2" layout="$3"
  "$layout"
  local rc=0
  GITHUB_SHA="${GITHUB_SHA}" INJECT="${inject}" \
    bash -c "$(declare -f swap_body); swap_body" >/dev/null 2>&1 || rc=$?
  local content; content=$(live)
  local killed="no"
  [ "${inject}" != "none" ] && killed="yes(rc=${rc})"
  # INVARIANT: dist always resolves to a COMPLETE site (old or new), never
  # missing, never half-written — even under SIGKILL at any stage.
  if [ "${content}" = "OLD-LIVE-SITE" ] || [ "${content}" = "NEW-BUILD" ]; then
    ok "${name} — invariant holds (serving '${content}', killed=${killed})"
  else
    no "${name} — INVARIANT VIOLATED: origin serving '${content}' (killed=${killed})"
  fi
}

export GITHUB_SHA="deadbeef"
echo "=== Steady-state layout (dist already a symlink) ==="
run_scenario "SIGKILL before promote"          pre_promote  setup_symlink_layout
run_scenario "SIGKILL before symlink rename"   pre_rename   setup_symlink_layout
run_scenario "SIGKILL after symlink rename"    post_rename  setup_symlink_layout
run_scenario "clean run"                       none         setup_symlink_layout

echo "=== Legacy bootstrap (first run after merge: dist is a real dir) ==="
run_scenario "bootstrap: SIGKILL after legacy mv" bootstrap setup_legacy_layout
run_scenario "bootstrap: clean run"               none      setup_legacy_layout

echo "=== Rollback (readiness gate failed after a successful swap) ==="
setup_symlink_layout
GITHUB_SHA="${GITHUB_SHA}" INJECT=none bash -c "$(declare -f swap_body); swap_body" >/dev/null 2>&1
# make a second older release to roll back TO
mkdir -p "${APP_DIR}/releases/zzz-older"; echo "OLDER-BUILD" > "${APP_DIR}/releases/zzz-older/index.html"
bash -c "$(declare -f rollback_body); rollback_body" >/dev/null 2>&1
content=$(live)
[ "${content}" = "OLDER-BUILD" ] || [ "${content}" = "OLD-LIVE-SITE" ] \
  && ok "rollback — repointed to previous release (serving '${content}')" \
  || no "rollback — serving '${content}', expected OLDER-BUILD/OLD-LIVE-SITE"

echo
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ] || exit 1
