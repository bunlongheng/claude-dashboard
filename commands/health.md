---
description: Check that the Claude Dashboard and its WebSocket watcher are up
allowed-tools: [Bash, Read]
---

Check the health of the running Claude Dashboard. There is no per-project scoring route; this command probes the 2 servers that exist.

Run:

```bash
curl -s -o /dev/null -w "dashboard :3003 -> %{http_code}\n" http://localhost:3003/api/claude/lan
curl -s -o /dev/null -w "ws-server :7878 -> %{http_code}\n" http://localhost:7878/api/health
curl -s http://localhost:3003/api/claude/sessions | python3 -c "
import sys,json
d = json.load(sys.stdin)
ps = d.get('projects', [])
print(f'{len(ps)} projects, {sum(len(p.get(\"sessions\", [])) for p in ps)} sessions indexed')
"
```

Report each line as-is. 200 on :3003 means the dashboard is up; 200 on :7878 means the live agents feed is up (only started by `npm run dev:full`, `dev:lan` or `prod`). Anything else, tell the user to start it with `/dashboard`.
