#!/usr/bin/env npx tsx
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const RAG_URL = process.env.CLAUDE_DASHBOARD_URL || `http://localhost:${process.env.PORT || 3003}`;

const server = new Server({ name: "rag-memory", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "rag_search",
      description: "Search the user's personal knowledge base (sessions, memory files, preferences, insights) for relevant context. Use when you need to recall past decisions, patterns, or user preferences.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "What to search for" },
          project: { type: "string", description: "Optional: filter by project name" },
        },
        required: ["query"],
      },
    },
    {
      name: "rag_context",
      description: "Get assembled context block with user preferences + relevant chunks for a given task. Returns structured context ready to apply.",
      inputSchema: {
        type: "object" as const,
        properties: {
          prompt: { type: "string", description: "The task/prompt to get context for" },
          project: { type: "string", description: "Optional: project name" },
        },
        required: ["prompt"],
      },
    },
    {
      name: "rag_preferences",
      description: "Get all extracted user preferences (tech stack, workflow rules, code style, etc.)",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "rag_health",
      description: "Check RAG system health — stale preferences, duplicate entries, cold documents",
      inputSchema: { type: "object" as const, properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "rag_search": {
        const q = (args as { query?: string }).query;
        const res = await fetch(`${RAG_URL}/api/rag/search?q=${encodeURIComponent(q ?? "")}`);
        const data = await res.json();
        const results = (data.results || []).slice(0, 5).map((r: { project: string; title: string; content: string }) =>
          `[${r.project}/${r.title}] ${r.content.slice(0, 400)}`
        ).join("\n\n---\n\n");
        return { content: [{ type: "text", text: results || "No results found." }] };
      }
      case "rag_context": {
        const res = await fetch(`${RAG_URL}/api/rag/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: (args as { prompt?: string }).prompt, project: (args as { project?: string }).project }),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: data.context || "No context available." }] };
      }
      case "rag_preferences": {
        const res = await fetch(`${RAG_URL}/api/rag/preferences`);
        const prefs = await res.json();
        const text = prefs.map((p: { category: string; key: string; value: string }) => `[${p.category}] ${p.key}: ${p.value}`).join("\n");
        return { content: [{ type: "text", text: text || "No preferences extracted yet." }] };
      }
      case "rag_health": {
        const res = await fetch(`${RAG_URL}/api/rag/health`);
        const checks = await res.json();
        const text = checks.map((c: { severity: string; check_type: string; message: string }) => `[${c.severity}] ${c.check_type}: ${c.message}`).join("\n");
        return { content: [{ type: "text", text }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: `RAG server error: ${msg}. Is Claude dashboard (localhost:3003) running?` }] };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
