#!/usr/bin/env bash
# Liveness: DozerClaw pm2 service is online, and the Telegram bot answers getMe.
# Notifies via ntfy only on status transitions. Intended for a frequent cron.
set -uo pipefail

# Match the bot's runtime environment (node, npm, pm2, codex all live here).
export PATH="$HOME/.local/bin:$HOME/.local/node-v22.22.2/bin:$PATH"

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$OPS_DIR/lib.sh"
REPO="$HOME/DozerClawProject/repo"

# 1) Service running under pm2.
pid="$(pm2 pid dozerclaw 2>/dev/null | tr -d '[:space:]')"
if [ -n "$pid" ] && [ "$pid" != "0" ]; then
  report_status "service" "ok" "" "" \
    "DozerClaw: service recovered" "pm2 dozerclaw is online again (pid $pid)"
else
  report_status "service" "fail" \
    "DozerClaw: service DOWN" "pm2 process 'dozerclaw' is not online" "" ""
fi

# 2) Telegram bot reachable / registered (getMe).
token="$(grep -E '^DOZERCLAW_TELEGRAM_BOT_TOKEN=' "$REPO/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'\''[:space:]')"
if [ -n "$token" ]; then
  resp="$(curl -s -m 15 "https://api.telegram.org/bot${token}/getMe" 2>/dev/null)"
  if printf '%s' "$resp" | grep -q '"ok":true'; then
    report_status "telegram" "ok" "" "" \
      "DozerClaw: Telegram recovered" "getMe returned ok again"
  else
    report_status "telegram" "fail" \
      "DozerClaw: Telegram FAIL" "getMe did not return ok (network or token issue)" "" ""
  fi
else
  echo "[liveness] no bot token in .env; skipping telegram check" >&2
fi
