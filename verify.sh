#!/usr/bin/env bash
set -euo pipefail

# Host config — override at invocation (same values as deploy.sh), e.g.:
#   REMOTE_USER=nick REMOTE_HOST=203.0.113.10 bash verify.sh
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:?set REMOTE_HOST=<vps ip|hostname>, e.g. REMOTE_USER=nick REMOTE_HOST=203.0.113.10 bash verify.sh}"
REMOTE_DIR=".npm-global/lib/node_modules/openclaw/skills/ammunity"

echo "=== .env present on the VM (credentials, not echoed) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "test -f $REMOTE_DIR/.env && echo 'OK: .env present' || echo 'MISSING: .env not found'"

echo
echo "=== Required credential keys present in .env (values not echoed) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "grep -qE '^AMMUNITY_AGENT_ID=.+'  $REMOTE_DIR/.env && echo 'AMMUNITY_AGENT_ID: set'  || echo 'AMMUNITY_AGENT_ID: MISSING'; \
   grep -qE '^AMMUNITY_AGENT_KEY=.+' $REMOTE_DIR/.env && echo 'AMMUNITY_AGENT_KEY: set' || echo 'AMMUNITY_AGENT_KEY: MISSING'"

echo
echo "=== SKILL.md path was rewritten (no leftover __SKILL_DIR__ placeholder) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" \
  "grep -q '__SKILL_DIR__' $REMOTE_DIR/SKILL.md && echo 'FAIL: placeholder still present' || echo 'OK: path rewritten'"
echo "--- invocation line in SKILL.md ---"
ssh "$REMOTE_USER@$REMOTE_HOST" "grep -A1 'EXACT COMMAND' $REMOTE_DIR/SKILL.md | tail -n +2"

echo
echo "=== node_modules contents (should include node-fetch) ==="
ssh "$REMOTE_USER@$REMOTE_HOST" "ls $REMOTE_DIR/node_modules 2>/dev/null | head -20 || echo 'node_modules not found'"
