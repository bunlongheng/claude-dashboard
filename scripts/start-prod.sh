#!/bin/bash
# Production start script for launchd
cd "$(dirname "$0")/.."

export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Build first
npm run build

# Kill stale processes
lsof -ti :7878 | xargs kill 2>/dev/null

# Start WS server in background
node scripts/ws-server.mjs &

# Start Next.js production
PORT=3003 npx next start --hostname 0.0.0.0
