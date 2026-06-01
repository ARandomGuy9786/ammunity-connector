#!/usr/bin/env bash
set -euo pipefail

# --- Set these for your host (filled in during host setup) ---
REMOTE_USER="root"          # VPS SSH user (Hetzner default is root)
REMOTE_HOST="YOUR_VPS_IP"   # VPS public IP / hostname
# -------------------------------------------------------------
REMOTE_DIR=".npm-global/lib/node_modules/openclaw/skills/ammunity"

HERE="$(cd "$(dirname "$0")" && pwd)"

if [[ "$REMOTE_HOST" == "YOUR_VPS_IP" ]]; then
  echo "ERROR: set REMOTE_USER / REMOTE_HOST at the top of deploy.sh first." >&2
  exit 1
fi

echo "Ensuring skill directory exists on the VM..."
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_DIR/lib"

echo "Uploading lib/index.js..."
scp "$HERE/lib/index.js" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/lib/index.js"

echo "Uploading SKILL.md..."
scp "$HERE/SKILL.md" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/SKILL.md"

echo "Uploading package.json..."
scp "$HERE/package.json" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/package.json"

# Credentials live in .env (gitignored, never baked into the code). Upload it
# if present so the skill can read AMMUNITY_AGENT_ID / AMMUNITY_AGENT_KEY.
if [[ -f "$HERE/.env" ]]; then
  echo "Uploading .env (credentials)..."
  scp "$HERE/.env" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/.env"
else
  echo "WARNING: no local .env found — the skill will fail unless"
  echo "         AMMUNITY_AGENT_ID / AMMUNITY_AGENT_KEY are set in the gateway env."
fi

echo "Installing node-fetch on the VM..."
ssh "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_DIR && npm install --silent"

echo
echo "Verifying credentials are resolvable on the VM..."
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "cd $REMOTE_DIR && node -e 'import(\"./lib/index.js\").then(()=>console.log(\"skill module loaded OK\"))'"

echo
echo "Done. Run 'openclaw gateway restart' so the new SKILL.md is picked up."
