---
description: Launch the Claude Dashboard GUI to browse sessions, memory, skills, and settings
allowed-tools: [Bash, Read]
---

Launch the Claude Dashboard - a local GUI for browsing your Claude Code data.

1. Check if the dashboard is already running:
   - Try `curl -s http://localhost:3000/api/claude/health` 
   - If it responds, tell the user: "Dashboard is running at http://localhost:3000"

2. If not running, check if it's installed:
   - Look for `~/claude-dashboard/package.json` or check if `claude-dashboard` exists in the current directory
   - If not found, tell the user to install: `curl -fsSL https://raw.githubusercontent.com/bunlongheng/claude-dashboard/main/install.sh | bash`

3. If installed but not running:
   - Run `cd ~/claude-dashboard && npm run dev &`
   - Wait 3 seconds
   - Tell the user: "Dashboard started at http://localhost:3000"

4. Open the dashboard URL in the default browser:
   - Run `open http://localhost:3000` (macOS) or `xdg-open http://localhost:3000` (Linux)
