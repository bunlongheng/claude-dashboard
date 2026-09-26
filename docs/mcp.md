# MCP server (rag-memory)

`mcp-server.ts` is a stdio MCP server that gives Claude Code 4 tools over the dashboard's RAG index. It holds no data itself: every tool is an HTTP call to the running dashboard at `CLAUDE_DASHBOARD_URL` (default `http://localhost:3003`, or `http://localhost:$PORT` when `PORT` is set).

## Register

`tsx` is not a dependency of this repo, so the shebang and the command below fetch it on demand with `npx -y`:

```bash
claude mcp add rag-memory -- npx -y tsx /absolute/path/to/claude-dashboard/mcp-server.ts
```

Or in `~/.claude.json` / a project `.mcp.json`:

```json
{ "mcpServers": { "rag-memory": { "command": "npx", "args": ["-y", "tsx", "/absolute/path/to/claude-dashboard/mcp-server.ts"] } } }
```

Start the dashboard first (`npm run dev`) and ingest once from the RAG page or `POST /api/rag/ingest`; until then every tool answers "No results found." or a `RAG server error` naming `localhost:3003`.

## Tools

| Tool | Input | Dashboard route | Returns |
|------|-------|-----------------|---------|
| `rag_search` | `query` (required), `project` (optional filter) | `GET /api/rag/search?q=` | Top 5 hits as `[project/title] first 400 chars`, separated by `---` |
| `rag_context` | `prompt` (required), `project` (optional) | `POST /api/rag/context` | An assembled context block: user preferences plus relevant chunks |
| `rag_preferences` | none | `GET /api/rag/preferences` | Every extracted preference as `[category] key: value` |
| `rag_health` | none | `GET /api/rag/health` | Health checks as `[severity] check_type: message` |

Note on `rag_context`: it is the only tool that uses a non-`GET` route. Non-`GET` routes require a same-site browser call (`lib/route-guard.ts`), and a stdio MCP process sends no `Sec-Fetch-Site` header, so this tool returns the guard's `403` until `/api/rag/context` is exempted or offered as a `GET`.

## Env

| Var | Purpose |
|-----|---------|
| `CLAUDE_DASHBOARD_URL` | Base URL to proxy to; overrides `PORT` |
| `PORT` | Fallback port when `CLAUDE_DASHBOARD_URL` is unset, default 3003 |
