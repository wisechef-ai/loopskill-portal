#!/usr/bin/env bash
# recipes — universal installer
# Detects platform, installs the meta-skill via npm or pip, falls back to a
# direct SKILL.md copy if neither runtime is present.
#
# Usage:
#   curl -fsSL https://recipes.wisechef.ai/install.sh | bash
#
# Source: https://github.com/wisechef-ai/recipes-skill
# License: Apache-2.0

set -euo pipefail

INSTALLER_VERSION="1.0.0"
NPM_PKG="wisechef-recipes"
PYPI_PKG="wisechef-recipes"
SKILL_URL="https://recipes.wisechef.ai/skill"

print() { printf '\033[1;33m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

print "recipes installer v${INSTALLER_VERSION}"
print "Detecting platform: $(uname -s) $(uname -m)"

have() { command -v "$1" >/dev/null 2>&1; }

INSTALLED=0

if have npm; then
  print "npm detected → installing ${NPM_PKG}"
  if npm install -g "${NPM_PKG}" 2>/tmp/recipes-npm.log; then
    ok "Installed ${NPM_PKG} via npm"
    INSTALLED=1
  else
    warn "npm install failed (see /tmp/recipes-npm.log) — trying pip"
  fi
fi

if [ "${INSTALLED}" -eq 0 ] && (have pip3 || have pip); then
  PIP=$(have pip3 && echo pip3 || echo pip)
  print "pip detected → installing ${PYPI_PKG}"
  if "${PIP}" install --user "${PYPI_PKG}" 2>/tmp/recipes-pip.log; then
    ok "Installed ${PYPI_PKG} via ${PIP}"
    INSTALLED=1
  else
    warn "pip install failed (see /tmp/recipes-pip.log) — falling back to direct copy"
  fi
fi

if [ "${INSTALLED}" -eq 0 ]; then
  print "Neither npm nor pip available — copying SKILL.md directly"
  if [ -d "${HOME}/.claude/skills" ]; then
    target="${HOME}/.claude/skills/recipes"
  elif [ -d "${HOME}/.codex/skills" ]; then
    target="${HOME}/.codex/skills/recipes"
  else
    target="${PWD}/skills/recipes"
  fi
  mkdir -p "${target}"
  if curl -fsSL "${SKILL_URL}" -o "${target}/SKILL.md"; then
    ok "Wrote ${target}/SKILL.md"
    INSTALLED=1
  else
    warn "Could not fetch ${SKILL_URL}"
    exit 1
  fi
fi

cat <<MSG

──────────────────────────────────────────────
recipes is installed.

  Try it:    recipes --help
  Verify:    recipes verify client-reporter
  Browse:    https://recipes.wisechef.ai

Tell your agent: "Read the recipes skill and follow it."
──────────────────────────────────────────────
MSG
