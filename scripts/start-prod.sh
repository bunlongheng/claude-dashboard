#!/bin/bash
# Production start script for launchd
cd /Users/bheng/Sites/claude

export PATH="/Users/bheng/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Build first
npm run build

# Kill stale processes
lsof -ti :7878 | xargs kill 2>/dev/null

# Start WS server in background
node scripts/ws-server.mjs &

# Start Next.js production
PORT=3003 npx next start --hostname 0.0.0.0
