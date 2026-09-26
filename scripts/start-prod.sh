#!/bin/bash
# Production start script for launchd
set -euo pipefail
cd "$(dirname "$0")/.."

# Node major from .nvmrc (matches CI + engines); newest installed patch of it.
NODE_MAJOR="$(tr -d 'v[:space:]' < .nvmrc)"
NODE_DIR="$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | grep "^v${NODE_MAJOR}\." | sort -V | tail -1 || true)"
[ -n "$NODE_DIR" ] || { echo "start-prod: no nvm Node v${NODE_MAJOR}.x installed (nvm install ${NODE_MAJOR})" >&2; exit 1; }
export PATH="$HOME/.nvm/versions/node/$NODE_DIR/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Loopback by default; LAN=1 exposes dashboard + WS server on 0.0.0.0.
HOST=127.0.0.1; export WS_LAN=0
[ "${LAN:-0}" = "1" ] && { HOST=0.0.0.0; export WS_LAN=1; }

# Build first. set -e aborts here on failure, so a broken build never silently
# serves the previous stale .next.
npm run build

# Stop only our own previous instance (by pidfile), never other port holders.
PIDFILE="$HOME/.claude/dashboard.pids"
if [ -f "$PIDFILE" ]; then xargs kill < "$PIDFILE" 2>/dev/null || true; rm -f "$PIDFILE"; fi

# Both servers in the background, pids recorded; launchd keeps THIS script alive
# and the trap tears both down on exit so a relaunch never leaves orphans.
node scripts/ws-server.mjs &
WS_PID=$!
PORT=3003 node_modules/.bin/next start --hostname "$HOST" &
NEXT_PID=$!
echo "$WS_PID $NEXT_PID" > "$PIDFILE"
trap 'kill "$WS_PID" "$NEXT_PID" 2>/dev/null || true; rm -f "$PIDFILE"' EXIT
wait "$NEXT_PID"
