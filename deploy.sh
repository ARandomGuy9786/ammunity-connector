#!/usr/bin/env bash
set -euo pipefail

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

echo "Rewriting __SKILL_DIR__ in SKILL.md to the absolute install path on the host..."
ssh "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_DIR && sed -i \"s#__SKILL_DIR__#\$(pwd)#g\" SKILL.md"

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
echo "Done. Run 'openclaw gateway restart' on the host so the new SKILL.md is picked up."
