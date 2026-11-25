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

# Escape a value for curl --config double-quoted strings.
curl_escape() {
  printf '%s' "$1" | tr '\r\n' '  ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# notify <title> <message> [priority] [tags]
notify() {
  local title="$1" msg="$2" prio="${3:-default}" tags="${4:-}"
  case "${NTFY_URL:-}" in
    "" | *REPLACE_ME*)
      echo "[notify] NTFY_URL not configured; would send: [$title] $msg" >&2
      return 0
      ;;
  esac

  local cfg
  cfg="silent
show-error
fail
max-time = 10
url = \"$(curl_escape "$NTFY_URL")\"
header = \"Title: $(curl_escape "$title")\"
header = \"Priority: $(curl_escape "$prio")\""

  if [ -n "$tags" ]; then
    cfg="$cfg
header = \"Tags: $(curl_escape "$tags")\""
  fi
  if [ -n "${NTFY_TOKEN:-}" ]; then
    cfg="$cfg
header = \"Authorization: Bearer $(curl_escape "$NTFY_TOKEN")\""
  fi

  if ! printf '%s\n' "$cfg" | curl --config - --data-raw "$msg" >/dev/null 2>&1; then
    echo "[notify] curl to ntfy failed" >&2
    return 1
  fi
  return 0
}

# report_status <name> <ok|fail> <fail_title> <fail_msg> <recover_title> <recover_msg>
# Notifies only on OK<->FAIL transitions (state kept per check).
# Persists the new status atomically ONLY after notification succeeds so a
# transient ntfy outage never swallows a transition alert.
report_status() {
  local name="$1" status="$2" ftitle="$3" fmsg="$4" rtitle="$5" rmsg="$6"
  local sf="$STATE_DIR/$name.status"
  local prev="ok"
  [ -f "$sf" ] && prev="$(cat "$sf")"

  if [ "$status" = "fail" ] && [ "$prev" != "fail" ]; then
    if ! notify "$ftitle" "$fmsg" "high" "rotating_light,dozerclaw"; then
      return 1
    fi
  elif [ "$status" = "ok" ] && [ "$prev" = "fail" ]; then
    if ! notify "$rtitle" "$rmsg" "default" "white_check_mark,dozerclaw"; then
      return 1
    fi
  fi

  local tmp="${sf}.tmp.$$"
  printf '%s' "$status" > "$tmp" && mv -f "$tmp" "$sf"
}
