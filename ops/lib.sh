#!/usr/bin/env bash
# Shared helpers for DozerClaw health checks. Sourced by the check scripts.

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$OPS_DIR/state"
mkdir -p "$STATE_DIR"

# Load ntfy configuration (NTFY_URL, optional NTFY_TOKEN). Never committed.
if [ -f "$OPS_DIR/notify.env" ]; then
  # shellcheck disable=SC1091
  . "$OPS_DIR/notify.env"
fi

# notify <title> <message> [priority] [tags]
notify() {
  local title="$1" msg="$2" prio="${3:-default}" tags="${4:-}"
  case "${NTFY_URL:-}" in
    "" | *REPLACE_ME*)
      echo "[notify] NTFY_URL not configured; would send: [$title] $msg" >&2
      return 0
      ;;
  esac
  local args=(-s -m 10 -H "Title: $title" -H "Priority: $prio")
  [ -n "$tags" ] && args+=(-H "Tags: $tags")
  [ -n "${NTFY_TOKEN:-}" ] && args+=(-H "Authorization: Bearer $NTFY_TOKEN")
  if ! curl "${args[@]}" -d "$msg" "$NTFY_URL" >/dev/null 2>&1; then
    echo "[notify] curl to ntfy failed" >&2
  fi
}

# report_status <name> <ok|fail> <fail_title> <fail_msg> <recover_title> <recover_msg>
# Notifies only on OK<->FAIL transitions (state kept per check).
report_status() {
  local name="$1" status="$2" ftitle="$3" fmsg="$4" rtitle="$5" rmsg="$6"
  local sf="$STATE_DIR/$name.status"
  local prev="ok"
  [ -f "$sf" ] && prev="$(cat "$sf")"
  printf '%s' "$status" > "$sf"

  if [ "$status" = "fail" ] && [ "$prev" != "fail" ]; then
    notify "$ftitle" "$fmsg" "high" "rotating_light,dozerclaw"
  elif [ "$status" = "ok" ] && [ "$prev" = "fail" ]; then
    notify "$rtitle" "$rmsg" "default" "white_check_mark,dozerclaw"
  fi
}
