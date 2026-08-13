#!/bin/bash
# Production start script for launchd
set -euo pipefail
cd "$(dirname "$0")/.."

# Newest installed node (version-sorted, not lexicographic tail).
NODE_DIR="$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -1 || true)"
export PATH="$HOME/.nvm/versions/node/$NODE_DIR/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Build first. set -e aborts here on failure, so a broken build never silently
# serves the previous stale .next.
npm run build

# Free stale holders of BOTH ports so a relaunch doesn't EADDRINUSE-crash-loop.
lsof -ti :7878 | xargs kill 2>/dev/null || true
lsof -ti :3003 | xargs kill 2>/dev/null || true

# Start WS server in background; clean it up when this script exits so a launchd
# relaunch never leaves an orphaned ws-server holding port 7878.
node scripts/ws-server.mjs &
WS_PID=$!
trap 'kill "$WS_PID" 2>/dev/null || true' EXIT

# Start Next.js production (foreground - launchd keeps THIS process alive)
PORT=3003 npx next start --hostname 0.0.0.0
