#!/usr/bin/env bash
set -euo pipefail

# NOTE: Prefer install.sh run ON THE HOST (clone the repo there, then `bash
# install.sh`). install.sh also creates the `ammunity` command the chat agent
# needs — this scp-based deploy only copies files and does NOT create it, so
# the skill won't be usable from chat on its own. Use this only if you can't
# clone on the host.

# Host config — override at invocation (keeps real host values out of git), e.g.:
#   REMOTE_USER=nick REMOTE_HOST=203.0.113.10 bash deploy.sh
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:?set REMOTE_HOST=<vps ip|hostname>, e.g. REMOTE_USER=nick REMOTE_HOST=203.0.113.10 bash deploy.sh}"
REMOTE_DIR=".npm-global/lib/node_modules/openclaw/skills/ammunity"

HERE="$(cd "$(dirname "$0")" && pwd)"

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
echo "Verifying the skill module loads on the VM..."
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "cd $REMOTE_DIR && node -e 'import(\"./lib/index.js\").then(()=>console.log(\"skill module loaded OK\"))'"

echo
echo "Files copied. NOTE: this does NOT create the 'ammunity' command — run"
echo "install.sh on the host for a usable setup. Then reload the gateway"
echo "(or start a new chat) so OpenClaw re-reads the skill."
