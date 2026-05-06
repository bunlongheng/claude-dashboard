<p align="center">
  <img src="public/claude-logo.png" width="80" height="80" alt="Claude Dashboard" style="image-rendering: pixelated;" />
</p>

<h1 align="center">Claude Dashboard</h1>

<p align="center">
  <strong>The missing GUI for Claude Code.</strong>
</p>

<p align="center">
  Monitor sessions, tokens, context windows, memory, rules, skills, hooks, MCP servers, and more<br/>
  from one local-first dashboard with multi-machine support.
</p>

<p align="center">
  <img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/bunlongheng/claude-dashboard/main/.github/badges/clones.json&style=flat" alt="Clones" />
  <img src="https://img.shields.io/github/repo-size/bunlongheng/claude-dashboard?style=flat&color=7C5CFF&label=Size" alt="Repo Size" />
  <img src="https://img.shields.io/github/last-commit/bunlongheng/claude-dashboard?style=flat&color=3FB68B&label=Last%20Commit" alt="Last Commit" />
  <img src="https://img.shields.io/badge/Zero_Config-orange?style=flat" alt="Zero Config" />
</p>

<br/>

<p align="center">
  <img src="public/screenshot.png" width="700" alt="Claude Dashboard" style="border-radius: 12px;" />
</p>

<br/>

## Get Started

```bash
git clone https://github.com/bunlongheng/claude-dashboard.git
cd claude-dashboard
cp .env.example .env.local   # optional - everything works without it
npm install && npm run dev
```

Open **http://localhost:3000** - done. No config, no database, no account.

> **Requires:** [Node.js 18+](https://nodejs.org/) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`~/.claude/` must exist with session data)

<br/>

## Features

| Feature | Description |
|---------|-------------|
| **Token Analytics** | Daily stacked charts, per-model pricing (Opus/Sonnet/Haiku), plan-aware cost (API/Pro/Max/Max 20x), cost by model and project tables |
| **Context Window** | Live per-session context usage bars with cache/input/create breakdown, color-coded thresholds |
| **RAG Memory** | Personal knowledge base - ingest sessions, memory, CLAUDE.md into searchable FTS index with preference extraction |
| **Overview Dashboard** | 12 stat cards, configuration donut, top sessions by tokens, context window visualizer, 7-day breakdown |
| **Activity Heatmap** | GitHub-style contribution calendar with active days, longest/current streak, most active day, top model |
| **Session Monitor** | Live session viewer with thinking state, tool calls, SSE streaming, custom title sync |
| **Multi-Machine** | Switch between machines (Mac, Pi, VPS) - all API calls proxied to remote dashboards |
| **Memory Browser** | All memory files across projects - user, feedback, project, reference types with timeline view |
| **CLAUDE.md Editor** | View and edit global instructions Claude reads on every startup |
| **MCP Servers** | Connection status, tools list, configuration viewer for all MCP servers |
| **Skills** | Browse all custom skills and reusable prompt workflows |
| **Commands** | Slash commands across all projects with source file locations |
| **Hooks** | Event-driven automation hooks - PreToolUse, PostToolUse, Notification, etc. |
| **Plugins** | Installed plugin directories and marketplace status |
| **Settings** | Global and local Claude Code settings editor (settings.json, settings.local.json) |
| **Health Check** | Project health scores 0-100 based on CLAUDE.md, memory, sessions, settings quality |
| **Timeline** | Memory events across all projects with chronological view |
| **Session Export** | Export any session as clean Markdown |
| **Global Search** | Cmd+K search across sessions, memory, skills, and settings |
| **QR Code LAN** | Share dashboard access via QR code on your local network |
| **Mobile Responsive** | Full mobile support with adaptive layouts |
| **Active Session Pills** | Top bar shows all running Claude sessions with live status |

<br/>

## All Pages

| Page | What it shows |
|------|--------------|
| **Overview** | Stat cards, config donut, top sessions, context window, activity heatmap, 7-day breakdown |
| **CLAUDE.md** | Global instructions Claude reads on every startup |
| **Memory** | What Claude remembers about you and your projects |
| **MCP** | Model Context Protocol server configs and tools |
| **Plugins** | Installed plugin directories |
| **Skills** | Reusable prompts and workflows |
| **Commands** | Slash commands across all projects |
| **Hooks** | Event-driven automation hooks |
| **Sessions** | Complete session history with live monitoring |
| **Tokens** | Daily charts, cost by model/project, plan comparison, glossary |
| **Settings** | Global and local Claude Code settings |
| **Health** | Project health scores and setup quality |
| **Timeline** | Memory events across all projects |
| **RAG** | Personal knowledge base with document ingestion, FTS search, preferences extraction |

<br/>

## How It Works

```
~/.claude/                        Your Claude Code data (already exists)
  CLAUDE.md                       Global instructions
  settings.json                   Your preferences
  projects/
    your-project/
      memory/                     What Claude remembers
      *.jsonl                     Session transcripts
```

The dashboard reads these files directly. **Nothing is uploaded. Nothing leaves your machine.**

<br/>

## Multi-Machine Setup

Connect multiple machines running Claude Dashboard to view all your sessions from one place.

```bash
# On each remote machine
git clone https://github.com/bunlongheng/claude-dashboard.git
cd claude-dashboard && npm install && npm run build
PORT=3003 npm start
```

On your main machine, add to `.env.local`:

```
MODE=admin
MACHINES=10.0.0.57:3003,10.0.0.97:3003
```

Remote machines appear in the dropdown - all data fetched from their dashboards.

<br/>

## Inspired By

Features inspired by these excellent open-source projects:

**Dashboard & Token Analytics**

| Project | What we learned |
|---------|----------------|
| [phuryn/claude-usage](https://github.com/phuryn/claude-usage) | Token analytics, daily charts, per-model pricing, cost tracking |
| [nateherkai/token-dashboard](https://github.com/nateherkai/token-dashboard) | Plan-aware pricing (API/Pro/Max), token glossary, top tools chart |

**RAG & Memory Systems**

| Project | What we learned |
|---------|----------------|
| [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) | Hook-driven lifecycle (SessionStart/Stop), instinct-based learning, continuous pattern extraction |
| [MemPalace/mempalace](https://github.com/MemPalace/mempalace) | Hybrid BM25 + semantic search, temporal knowledge graph, pluggable backends |
| [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | Progressive 3-layer disclosure, structured observation compiler, worker service architecture |
| [coleam00/claude-memory-compiler](https://github.com/coleam00/claude-memory-compiler) | Karpathy-inspired compile-not-search pattern, article-first knowledge organization, lint health checks |
| [lyonzin/knowledge-rag](https://github.com/lyonzin/knowledge-rag) | Query expansion, keyword routing, cross-encoder reranking, multi-format parsers |
| [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) | Knowledge graph entity extraction, dual-mode retrieval (local + global graph) |
| [Ricardo-Kaminski/local-rag](https://github.com/Ricardo-Kaminski/local-rag) | MCP as first-class integration, document checkpointing, file watcher daemon |
| [doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) | Turn-level storage, decay/compression consolidation, quality scoring |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Multi-level memory taxonomy, entity linking, multi-signal retrieval |

Thank you to these creators for sharing their work with the community.

<br/>

## Built With

[Next.js 16](https://nextjs.org/) | [Tailwind CSS](https://tailwindcss.com/) | [Lucide Icons](https://lucide.dev/)

<br/>

## Contributing

```bash
git clone https://github.com/bunlongheng/claude-dashboard.git
cd claude-dashboard && npm install && npm run dev
```

1. Fork the repo
2. Create your branch (`git checkout -b feature/awesome`)
3. Make your changes
4. Push and open a PR

<br/>

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built by <a href="https://www.bunlongheng.com">Bunlong Heng</a> for the Claude Code community</sub>
</p>
