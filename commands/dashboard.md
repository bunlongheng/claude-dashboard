---
description: Launch the Claude Dashboard GUI to browse sessions, memory, skills, and settings
allowed-tools: [Bash, Read]
---

Launch the Claude Dashboard - a local GUI for browsing your Claude Code data. It runs on port 3003.

1. Check if the dashboard is already running (there is no /api/claude/health route; /api/claude/lan is the cheapest open GET):
   - Try `curl -s http://localhost:3003/api/claude/lan`
   - If it responds with JSON, tell the user: "Dashboard is running at http://localhost:3003"

2. If not running, check if it's installed:
   - Look for `~/Sites/claude/package.json` or check if `claude` exists in the current directory
   - If not found, tell the user to install: `git clone https://github.com/bunlongheng/claude-dashboard.git claude && cd claude && npm i`

3. If installed but not running:
   - Run `cd ~/Sites/claude && npm run dev:full &` (dev:full also starts the WebSocket watcher on 7878 for the live agents feed)
   - Wait 3 seconds
   - Tell the user: "Dashboard started at http://localhost:3003"

4. Open the dashboard URL in the default browser:
   - Run `open http://localhost:3003` (macOS) or `xdg-open http://localhost:3003` (Linux)
