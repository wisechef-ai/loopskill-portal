#!/usr/bin/env bash
# ops/install-rebuild-timer.sh — Phase I (WIS-2005/I)
#
# Installs a nightly systemd timer that rebuilds the Astro portal at 04:30 London
# time — 35 minutes after the carousel cron fires at 03:55 UTC. This ensures the
# daily 7-card carousel is always reflected in the SSR output (belt-and-suspenders
# alongside the Phase I client-side fetch).
#
# Deployment: wisechef-hq (production portal host).
# Portal root: /home/wisechef/recipes-portal
# Web server:  Caddy (systemd unit: caddy.service)
#
# Usage (idempotent — safe to re-run):
#   sudo bash ops/install-rebuild-timer.sh
#
# Prerequisites:
#   - systemd ≥239
#   - node + npm available on PATH for the wisechef user
#   - git clone of recipes-portal at /home/wisechef/recipes-portal
#   - ntfy CLI available at /usr/local/bin/ntfy (optional; failures are non-fatal)
#
# Verified against:
#   - ops/Caddyfile (portal serves /home/wisechef/recipes-portal/dist via file_server)
#   - .github/workflows/ci.yml (npm ci + npm run build is the canonical build sequence)
#   - No deploy.yml in this repo — deploy is manual SSH rsync + this timer for nightly

set -euo pipefail

PORTAL_DIR="/home/wisechef/recipes-portal"
PORTAL_USER="wisechef"
SERVICE_NAME="recipes-portal-rebuild"
TIMER_FILE="/etc/systemd/system/${SERVICE_NAME}.timer"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Require root
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Error: this script must be run as root (sudo bash $0)" >&2
  exit 1
fi

echo "→ Installing ${SERVICE_NAME}.service ..."
cat > "${SERVICE_FILE}" << 'EOF'
[Unit]
Description=Recipes portal nightly Astro rebuild
# Runs after the carousel cron (03:55 UTC / ~04:55 London in summer BST).
# 35-min buffer gives the API carousel cron time to settle before the build
# bakes today's skeleton cards into the static dist/.
After=network-online.target

[Service]
Type=oneshot
User=wisechef
WorkingDirectory=/home/wisechef/recipes-portal
# Step 1: pull latest source
ExecStart=/usr/bin/git pull --ff-only

# Step 2: install exact locked deps; if npm registry is unreliable, send ntfy
# notification and exit 0 so the timer does not enter a failed state.
ExecStart=/bin/bash -c 'npm ci || ( /usr/local/bin/ntfy send "recipes-portal: npm ci failed on nightly rebuild — registry error?" 2>/dev/null || true ; exit 0 )'

# Step 3: build
ExecStart=/usr/bin/npm run build

# Step 4: reload Caddy to serve fresh dist/
ExecStart=/bin/systemctl restart caddy

StandardOutput=journal
StandardError=journal
SyslogIdentifier=recipes-portal-rebuild
EOF

echo "→ Installing ${SERVICE_NAME}.timer ..."
cat > "${TIMER_FILE}" << 'EOF'
[Unit]
Description=Nightly rebuild of Recipes portal (04:30 London time)

[Timer]
# 04:30 Europe/London — 35 min after the carousel cron (03:55 UTC).
# In summer (BST/UTC+1) this fires at 03:30 UTC; winter (GMT) at 04:30 UTC.
OnCalendar=*-*-* 04:30:00 Europe/London
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
EOF

echo "→ Reloading systemd daemon ..."
systemctl daemon-reload

echo "→ Enabling and starting ${SERVICE_NAME}.timer ..."
systemctl enable --now "${SERVICE_NAME}.timer"

echo "→ Current timer status:"
systemctl status "${SERVICE_NAME}.timer" --no-pager || true

echo ""
echo "✓ Done. Next fire: $(systemctl show ${SERVICE_NAME}.timer -p NextElapseUSecRealtime --value 2>/dev/null || echo 'check with: systemctl list-timers')"
echo "  Logs: journalctl -u ${SERVICE_NAME}.service -f"
