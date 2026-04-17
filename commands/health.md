---
description: Check project health scores across all Claude Code projects
allowed-tools: [Bash, Read]
---

Check the health score of all Claude Code projects. Each project is scored 0-100 based on:
- Has CLAUDE.md (+20)
- Has memory files (+20, +5 per file up to 40)
- Recent sessions within 7 days (+20)
- Has instructions.md (+10)
- Has settings (+10)

Run: `curl -s http://localhost:3000/api/claude/health | python3 -c "
import sys,json
d = json.load(sys.stdin)
for p in d.get('projects', []):
    bar = '#' * (p['score'] // 5) + '.' * (20 - p['score'] // 5)
    print(f\"{p['score']:3d}/100 [{bar}] {p['name']}\")
"`

If the dashboard isn't running, tell the user to start it with `/dashboard`.
