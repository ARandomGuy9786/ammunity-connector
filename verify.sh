#!/usr/bin/env bash
set -euo pipefail

# --- Set these for your host (same values as deploy.sh) ---
REMOTE_USER="root"          # VPS SSH user (Hetzner default is root)
REMOTE_HOST="YOUR_VPS_IP"   # VPS public IP / hostname
# ----------------------------------------------------------
REMOTE_DIR=".npm-global/lib/node_modules/openclaw/skills/ammunity"

if [[ "$REMOTE_HOST" == "YOUR_VPS_IP" ]]; then
  echo "ERROR: set REMOTE_USER / REMOTE_HOST at the top of verify.sh first." >&2
  exit 1
fi

echo "=== .env present on the VM (credentials, not echoed) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "test -f $REMOTE_DIR/.env && echo 'OK: .env present' || echo 'MISSING: .env not found'"

echo
echo "=== Required credential keys present in .env (values not echoed) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "grep -qE '^AMMUNITY_AGENT_ID=.+'  $REMOTE_DIR/.env && echo 'AMMUNITY_AGENT_ID: set'  || echo 'AMMUNITY_AGENT_ID: MISSING'; \
   grep -qE '^AMMUNITY_AGENT_KEY=.+' $REMOTE_DIR/.env && echo 'AMMUNITY_AGENT_KEY: set' || echo 'AMMUNITY_AGENT_KEY: MISSING'"

echo
echo "=== SKILL.md 'Your Agent ID' section ==="
ssh "$REMOTE_USER@$REMOTE_HOST" "grep -A 1 'Your Agent ID' $REMOTE_DIR/SKILL.md"

echo
echo "=== node_modules contents (should include node-fetch) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" "ls $REMOTE_DIR/node_modules 2>/dev/null | head -20 || echo 'node_modules not found'"
