#!/usr/bin/env bash
# LoopSkill installer — install agent skills from app.loopskill.io
#
# Usage:
#   curl -fsSL https://app.loopskill.io/install.sh | bash -s -- <skill-slug>
#   curl -fsSL https://app.loopskill.io/install.sh | bash -s -- --bundle <bundle-slug>
#
# Env overrides:
#   LOOPSKILL_API_BASE     — API origin        (default: https://app.loopskill.io)
#   LOOPSKILL_INSTALL_DIR  — install target    (default: ~/.claude/skills)
#   LOOPSKILL_API_KEY      — optional; only needed for Pro-tier skills
#
# Free-tier skills install anonymously. Paid-tier skills require an API key
# and fail loudly, never silently.
# License: Apache-2.0
set -euo pipefail

API_BASE="${LOOPSKILL_API_BASE:-https://app.loopskill.io}"
DEST="${LOOPSKILL_INSTALL_DIR:-$HOME/.claude/skills}"

usage() {
  cat >&2 <<EOF
LoopSkill installer

  install a skill:   curl -fsSL ${API_BASE}/install.sh | bash -s -- <skill-slug>
  install a bundle:  curl -fsSL ${API_BASE}/install.sh | bash -s -- --bundle <bundle-slug>

Browse the catalog:  ${API_BASE}/skills
MCP server (agents): ${API_BASE}/api/mcp  (46 tools, e.g. loopskill_install)
Docs:                ${API_BASE}/docs
EOF
  exit 2
}

[ $# -ge 1 ] || usage

if [ "$1" = "--bundle" ]; then
  [ $# -ge 2 ] || usage
  # Delegate to the canonical bundle installer (auth-free for free-tier members).
  exec bash <(curl -fsSL "${API_BASE}/api/bundles/install.sh") "$2"
fi

SLUG="$1"
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 3; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 3; }

AUTH_ARGS=()
[ -n "${LOOPSKILL_API_KEY:-}" ] && AUTH_ARGS=(-H "x-api-key: ${LOOPSKILL_API_KEY}")

echo "LoopSkill: resolving skill '${SLUG}'..."
HTTP_CODE=$(curl -sS -o /tmp/loopskill_install_$$.json -w "%{http_code}" -m 30 \
  "${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"}" \
  "${API_BASE}/api/skills/install?slug=${SLUG}")

if [ "$HTTP_CODE" = "402" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "'${SLUG}' is a paid-tier skill. Set LOOPSKILL_API_KEY with a Pro key: ${API_BASE}/pricing" >&2
  rm -f /tmp/loopskill_install_$$.json
  exit 4
elif [ "$HTTP_CODE" = "404" ]; then
  echo "Skill '${SLUG}' not found. Browse: ${API_BASE}/skills" >&2
  rm -f /tmp/loopskill_install_$$.json
  exit 5
elif [ "$HTTP_CODE" != "200" ]; then
  echo "API error (HTTP ${HTTP_CODE}) resolving '${SLUG}'" >&2
  rm -f /tmp/loopskill_install_$$.json
  exit 6
fi

python3 - "$SLUG" "$DEST" "$API_BASE" /tmp/loopskill_install_$$.json <<'PYEOF'
import hashlib, io, json, pathlib, sys, tarfile, urllib.request

slug, dest_root, api_base, meta_path = sys.argv[1:5]
meta = json.load(open(meta_path))
url = meta["tarball_url"]
if url.startswith("/"):
    url = api_base + url
expected = meta.get("checksum_sha256")

data = urllib.request.urlopen(url, timeout=60).read()
if expected:
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        sys.exit(f"checksum mismatch for {slug}: expected {expected}, got {actual}")

dest = pathlib.Path(dest_root).expanduser() / slug
dest.mkdir(parents=True, exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as tf:
    base = dest.resolve()
    members = tf.getmembers()
    for m in members:
        target = (base / m.name).resolve()
        if not str(target).startswith(str(base)):
            sys.exit(f"unsafe path in tarball: {m.name}")
    tf.extractall(base, members=members)  # noqa: S202 — members path-checked above

print(f"installed '{slug}' v{meta.get('version','?')} -> {dest}")
PYEOF
STATUS=$?
rm -f /tmp/loopskill_install_$$.json
[ $STATUS -eq 0 ] || exit $STATUS

echo ""
echo "Done. Tell your agent: \"You have a new skill in ${DEST}/${SLUG} — read its SKILL.md and follow it.\""
