# REST API Surface

Every route under `app/api`, from each `route.ts` file's exported handlers (`find app/api -name route.ts`).

Access rules, all routes are local and have no login:

- `GET` routes are open to anything that can reach the port, so keep the default `127.0.0.1` bind unless you trust the network.
- Every non-`GET` handler (`POST`, `PUT`, `DELETE`) calls `requireSameSite` from `lib/route-guard.ts`: the request must carry `Sec-Fetch-Site: same-origin` or `same-site` and a trusted `Host` (localhost, `.local`, `.ts.net`, private or Tailscale IPs). `curl`, scripts and pages on another origin get `403 {"error":"Forbidden"}`.
- 4 reads are guarded the same way because they return config or proxy to peers: marked **same-site** below.
- The service worker (`public/sw.js`) never caches `/api/*`.

## /api/claude

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/claude/agents` | GET | Parses recent session `.jsonl` tails to list Agent tool calls (subagent run history) |
| `/api/claude/brain` | GET **same-site** | Aggregates every project's CLAUDE.md, config, hooks, commands and memory for the nav and Overview |
| `/api/claude/claude-md` | GET | Returns the global `~/.claude/CLAUDE.md` content |
| `/api/claude/claude-md-history` | GET | Saved CLAUDE.md version history from `~/.claude/dashboard.db` (or 1 version by id) |
| `/api/claude/claude-sessions/[sessionId]/input` | POST | Sends keystrokes to the live terminal running that session (iTerm2 or VS Code) |
| `/api/claude/claude-sessions/[sessionId]/stream` | GET | SSE stream of a session's live transcript (text, tool calls, usage) |
| `/api/claude/context` | GET | Live per-session context-window usage for sessions with an attached process (no UI caller today) |
| `/api/claude/jev` | GET | Jev router totals, tiers and per-prompt log from `~/.claude/logs/jev.jsonl`; `?days=7&project=` |
| `/api/claude/jev/router` | GET, PUT | Reads or flips the router switch in `~/.claude/jev-router.json`; PUT body `{force: null or a tier}` |
| `/api/claude/lan` | GET | This machine's LAN IP, port, hostname and model, used by the QR code (`PORT`, default 3000, sets the port) |
| `/api/claude/machines` | GET | Local machine plus peers from `MACHINES`; `?discover=1` scans the LAN |
| `/api/claude/mcp-activity` | GET | Proxies MCP tool-call activity from a local-apps monitor on `LOCAL_APPS_PORT` (no UI caller today) |
| `/api/claude/project-icon` | GET | Resolves a project's favicon or app icon from disk or the local-apps cache |
| `/api/claude/search` | GET **same-site** | Cmd+K search across sessions, memory, skills, commands and CLAUDE.md files |
| `/api/claude/sessions` | GET, DELETE | GET: `{projects:[{project,path,machine,sessions:[...]}]}` cached per machine. DELETE: removes 1 `.jsonl` under `~/.claude/projects` |
| `/api/claude/settings` | GET **same-site** | Global and local `settings.json`; non same-site callers get key counts only |
| `/api/claude/skill-usage` | GET | Skill and Agent tool_use counts parsed from session tails |
| `/api/claude/skills` | GET, PUT | Lists MCP servers, skills, commands and plugins; PUT writes CLAUDE.md, a command `.md` or `hooks.json` under `~/.claude`, anything else is 403 |
| `/api/claude/sync-skill` | POST | Pushes a skill file to a peer through its local-apps monitor (`LOCAL_APPS_PORT`, default 9876) |
| `/api/claude/token-stats` | GET | Token usage and cost aggregated across all sessions and models |
| `/api/claude/token-stats/daily` | GET | Daily token stats plus the hourly punchcard for the last 7 days |
| `/api/claude/tool-usage` | GET | Tool-call counts within a query window |
| `/api/claude/turns-by-hour` | GET | Per-day and per-hour turn counts for the activity punchcard |

## /api/proxy

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/proxy` | GET **same-site**, POST | Same-origin reverse proxy to a peer dashboard's APIs for the multi-machine switcher |

## /api/rag

Served whether or not `NEXT_PUBLIC_RAG_ENABLED` is set; the flag only shows the page.

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/rag/context` | POST | Assembles a context block (FTS5 top hits plus preferences) for a prompt |
| `/api/rag/docs` | GET | Lists ingested RAG documents |
| `/api/rag/docs/[id]` | GET | 1 document plus its chunks |
| `/api/rag/eval` | GET, POST | GET: eval batch report (latest, by id, or per-question). POST: runs the eval matrix |
| `/api/rag/eval/questions` | GET, POST, DELETE | Manage the eval question set (list, replace or append, clear) |
| `/api/rag/health` | GET | RAG subsystem health checks (stale preferences, duplicates, cold documents) |
| `/api/rag/ingest` | POST | Discovers and ingests CLAUDE.md, memory, session and Obsidian sources |
| `/api/rag/insights` | POST | Extracts insights from ingested content (needs `ANTHROPIC_API_KEY`) |
| `/api/rag/preferences` | GET | Extracted user preferences by category |
| `/api/rag/search` | GET | FTS5 search over the index, optional semantic rerank |
| `/api/rag/stats` | GET | Doc and chunk counts plus FTS benchmark timings |

## /api/qr

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/qr` | GET | QR code image for a given `?url=` (LAN sharing) |
