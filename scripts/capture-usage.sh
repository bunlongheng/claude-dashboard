#!/bin/bash
# Captures Anthropic rate-limit usage (5h session + 7d week) and writes to
# ~/.claude/usage-status.json — read by claude-dashboard.
#
# Supports:  ANTHROPIC_API_KEY env var  |  macOS keychain OAuth  |  Linux creds file
# Install:   See README or run:  npm run install-hooks

set -euo pipefail

STATUS_FILE="$HOME/.claude/usage-status.json"
HEADERS_TMP=$(mktemp)
trap 'rm -f "$HEADERS_TMP"' EXIT

# ── Cooldown: skip if updated within last 5 minutes ──────────────────────────
if [ -f "$STATUS_FILE" ]; then
  UPDATED=$(python3 -c "
import json, time
try:
    d = json.load(open('$STATUS_FILE'))
    from datetime import datetime, timezone
    t = datetime.fromisoformat(d.get('updated_at','').replace('Z','+00:00')).timestamp()
    print(int(time.time() - t))
except: print(999)
" 2>/dev/null || echo 999)
  if [ "$UPDATED" -lt 300 ] 2>/dev/null; then exit 0; fi
fi

# ── Resolve auth ──────────────────────────────────────────────────────────────
AUTH_HEADER=""
AUTH_TYPE=""

# 1. ANTHROPIC_API_KEY env var
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  AUTH_HEADER="x-api-key: $ANTHROPIC_API_KEY"
  AUTH_TYPE="api_key"

# 2. macOS keychain (claude.ai OAuth)
elif command -v security &>/dev/null; then
  CREDS=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true)
  if [ -n "$CREDS" ]; then
    TOKEN=$(echo "$CREDS" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('accessToken') or d.get('access_token') or '')
except: print('')
" 2>/dev/null || true)
    if [ -n "$TOKEN" ]; then
      AUTH_HEADER="Authorization: Bearer $TOKEN"
      AUTH_TYPE="oauth"
    fi
  fi
fi

# 3. Linux credential file fallback
if [ -z "$AUTH_HEADER" ] && [ -f "$HOME/.config/claude/credentials.json" ]; then
  TOKEN=$(python3 -c "
import json
try:
    d = json.load(open('$HOME/.config/claude/credentials.json'))
    print(d.get('accessToken') or d.get('access_token') or '')
except: print('')
" 2>/dev/null || true)
  if [ -n "$TOKEN" ]; then
    AUTH_HEADER="Authorization: Bearer $TOKEN"
    AUTH_TYPE="oauth_linux"
  fi
fi

if [ -z "$AUTH_HEADER" ]; then
  python3 -c "
import json
from datetime import datetime, timezone
json.dump({'five_hour':None,'seven_day':None,'auth':'none','updated_at':datetime.now(timezone.utc).isoformat()}, open('$STATUS_FILE','w'))
"
  exit 0
fi

# ── Minimal API call — count_tokens (no generation, no cost) ─────────────────
curl -s -o /dev/null \
  -D "$HEADERS_TMP" \
  "https://api.anthropic.com/v1/messages/count_tokens" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: token-counting-2024-11-01" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"model":"claude-haiku-4-5-20251001","messages":[{"role":"user","content":"hi"}]}' \
  2>/dev/null || true

# If count_tokens didn't return rate-limit headers, fall back to a 1-token message
if ! grep -qi "anthropic-ratelimit-unified" "$HEADERS_TMP" 2>/dev/null; then
  curl -s -o /dev/null \
    -D "$HEADERS_TMP" \
    "https://api.anthropic.com/v1/messages" \
    -H "anthropic-version: 2023-06-01" \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    -d '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
    2>/dev/null || true
fi

# ── Parse headers → write JSON ────────────────────────────────────────────────
python3 - "$HEADERS_TMP" "$STATUS_FILE" "$AUTH_TYPE" << 'PYEOF'
import sys, re, json
from datetime import datetime, timezone

headers_file, out_file, auth_type = sys.argv[1], sys.argv[2], sys.argv[3]

def parse_headers(path):
    h = {}
    try:
        for line in open(path):
            m = re.match(r'^([\w-]+):\s*(.+)', line.strip(), re.I)
            if m: h[m.group(1).lower()] = m.group(2).strip()
    except: pass
    return h

h = parse_headers(headers_file)

def get_window(abbrev):
    util  = h.get(f"anthropic-ratelimit-unified-{abbrev}-utilization")
    reset = h.get(f"anthropic-ratelimit-unified-{abbrev}-reset")
    if util is None: return None
    try:
        util_f  = float(util)
        reset_i = int(reset) if reset else None
        reset_iso = datetime.fromtimestamp(reset_i, tz=timezone.utc).isoformat() if reset_i else None
        return {"utilization": util_f, "percent_used": round(util_f * 100, 1),
                "resets_at": reset_i, "resets_at_iso": reset_iso}
    except: return None

json.dump({
    "five_hour":  get_window("5h"),
    "seven_day":  get_window("7d"),
    "auth":       auth_type,
    "updated_at": datetime.now(timezone.utc).isoformat(),
}, open(out_file, "w"), indent=2)
print("usage-status.json updated")
PYEOF

exit 0
