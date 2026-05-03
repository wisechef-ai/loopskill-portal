#!/usr/bin/env bash
# install.sh — Recipes framework installer (stabilization_2605 Phase C).
#
# This file is a static fallback served from the portal at /fleet/install.sh.
# The canonical, always-fresh script lives in the recipes-skill repo at
# recipes-installer/install-fleet.sh; the /fleet route 302-redirects there.
#
# Operators normally run:
#   curl -fsSL recipes.wisechef.ai/fleet | bash
#
# This fallback is a thin bootstrap: it fetches the canonical script from
# the recipes-skill GitHub repo and execs it with the same args. That keeps
# the portal repo from drifting out of sync with the installer source of
# truth.

set -euo pipefail

CANONICAL_URL="https://raw.githubusercontent.com/wisechef-ai/recipes-skill/main/recipes-installer/install-fleet.sh"

if ! command -v curl >/dev/null 2>&1; then
    echo "install: curl is required to bootstrap the canonical installer" >&2
    exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl -fsSL "$CANONICAL_URL" -o "$tmp"
exec bash "$tmp" "$@"
