#!/bin/sh
# Starts the WS server (scripts/ws-server.mjs) in the background, then runs the
# given command (e.g. `next dev`/`next start`) in the foreground. Traps
# EXIT/INT/TERM to kill the WS server when the foreground command exits, so a
# relaunch or Ctrl-C never leaves an orphaned ws-server holding port 7878.
# Mirrors the trap pattern in scripts/start-prod.sh.
set -e
cd "$(dirname "$0")/.."

node scripts/ws-server.mjs &
WS_PID=$!
trap 'kill "$WS_PID" 2>/dev/null || true' EXIT INT TERM

"$@"
