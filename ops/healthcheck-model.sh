#!/usr/bin/env bash
# Model availability: run the Codex provider smoke test. Expensive/slow, so this
# is intended for an infrequent cron. Notifies via ntfy only on transitions.
set -uo pipefail

# Match the bot's runtime environment (node, npm, pm2, codex all live here).
export PATH="$HOME/.local/bin:$HOME/.local/node-v22.22.2/bin:$PATH"

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$OPS_DIR/lib.sh"
REPO="$HOME/DozerClawProject/repo"

cd "$REPO" || exit 1

out="$(timeout 150 npm run --silent dev:codex-smoke 2>&1)"
rc=$?

if [ $rc -eq 0 ] && printf '%s' "$out" | grep -q "DOZERCLAW_CODEX_SMOKE_OK"; then
  report_status "model" "ok" "" "" \
    "DozerClaw: model recovered" "Codex smoke test passed again"
else
  snippet="$(printf '%s' "$out" | tail -3 | tr '\n' ' ')"
  report_status "model" "fail" \
    "DozerClaw: model FAIL" "Codex smoke failed (rc=$rc): ${snippet}" "" ""
fi
