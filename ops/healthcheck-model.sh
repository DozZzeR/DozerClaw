#!/usr/bin/env bash
# Model availability: run the prod-safe Codex provider health check. Expensive/slow,
# so this is intended for an infrequent cron. Notifies via ntfy only on transitions.
set -uo pipefail

# Match the bot's runtime environment (node, npm, pm2, codex all live here).
export PATH="$HOME/.local/bin:$HOME/.local/node-v22.22.2/bin:$PATH"

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$OPS_DIR/lib.sh"
REPO="$(cd "$OPS_DIR/.." && pwd)"

cd "$REPO" || exit 1

if [ -f "$REPO/dist/entrypoints/cli/codex-healthcheck.js" ]; then
  out="$(timeout -k 10 150 node --env-file-if-exists=.env dist/entrypoints/cli/codex-healthcheck.js 2>&1)"
  rc=$?
else
  out="dist/entrypoints/cli/codex-healthcheck.js not found; run npm run build"
  rc=1
fi

if [ $rc -eq 0 ] && printf '%s' "$out" | grep -q "DOZERCLAW_CODEX_SMOKE_OK"; then
  report_status "model" "ok" "" "" \
    "DozerClaw: model recovered" "Codex health check passed again"
else
  # Redact secret-like patterns and cap length before sending to external ntfy.
  snippet="$(printf '%s' "$out" | tail -3 | tr '\n' ' ' | sed -E \
    -e 's/[0-9]{6,12}:[A-Za-z0-9_-]{30,}/[redacted-token]/g' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._+/=-]+/Bearer [redacted]/gi' \
    -e 's/([?&](access_token|refresh_token|token|api_key|apikey|key|secret|client_secret)=)[^&[:space:]]+/\1[redacted]/gi' \
    | cut -c1-200)"
  report_status "model" "fail" \
    "DozerClaw: model FAIL" "Codex health check failed (rc=$rc): ${snippet}" "" ""
fi
