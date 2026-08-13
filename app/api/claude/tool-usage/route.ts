import { NextResponse } from "next/server";
import { walkProjectJsonl, PROJECTS_DIR } from "@/lib/jsonl-walk";
import * as fs from "fs";
import { withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolStat = { name: string; count: number; lastUsed: number; server?: string; tool?: string };
type ToolEvent = { name: string; ts: number; server?: string; tool?: string; project?: string };

const RECENT_CAP = 400;
// Session .jsonl files reach 100MB+; the tool_use events in the query window live
// near the tail, so read a bounded tail instead of the whole file (matches the
// token-stats routes). Partial first lines fault JSON.parse and are skipped below.
const MAX_BYTES = 2 * 1024 * 1024;


// The "no projects dir" early-return payload omits recentMcp/recentCli, so
// those stay optional here to match both shapes without changing behavior.
interface ToolUsageData {
    hours: number;
    total: number;
    mcp: ToolStat[];
    cli: ToolStat[];
    recent: ToolEvent[];
    recentMcp?: ToolEvent[];
    recentCli?: ToolEvent[];
}

const CACHE_TTL_MS = 30_000;
const CC = { headers: { "Cache-Control": "public, max-age=30" } };
let cache: { at: number; hours: number; data: ToolUsageData } | null = null;

function projectShortName(dir: string): string {
    return dir.replace(/^-Users-[^-]+-Sites-/, "").replace(/^-Users-[^-]+-/, "");
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const hours = Math.min(Math.max(parseInt(url.searchParams.get("hours") || "24", 10), 1), 720);
    const now = Date.now();
    if (cache && cache.hours === hours && now - cache.at < CACHE_TTL_MS) {
        return NextResponse.json(cache.data, CC);
    }

    const since = now - hours * 3600_000;
    const mcpCounts = new Map<string, ToolStat>();
    const cliCounts = new Map<string, ToolStat>();
    const recent: ToolEvent[] = [];

    if (!fs.existsSync(PROJECTS_DIR)) {
        const empty: ToolUsageData = { hours, total: 0, mcp: [], cli: [], recent: [] };
        cache = { at: now, hours, data: empty };
        return NextResponse.json(empty, CC);
    }

    walkProjectJsonl({ sinceMs: since, maxBytes: MAX_BYTES }, (parsed, ctx) => {
        const m = parsed as { timestamp?: string; message?: { content?: unknown } };
        const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
        if (ts && ts < since) return;
        const content = m.message?.content;
        if (!Array.isArray(content)) return;
        const project = projectShortName(ctx.folder);
        for (const c of content as Array<{ type?: string; name?: string }>) {
            if (c.type !== "tool_use" || !c.name) continue;
            const isMcp = c.name.startsWith("mcp__");
            const map = isMcp ? mcpCounts : cliCounts;
            let server: string | undefined;
            let tool: string | undefined;
            if (isMcp) {
                const parts = c.name.split("__");
                server = parts[1];
                tool = parts.slice(2).join("__");
            }
            const existing = map.get(c.name);
            if (existing) {
                existing.count++;
                if (ts > existing.lastUsed) existing.lastUsed = ts;
            } else {
                map.set(c.name, { name: c.name, count: 1, lastUsed: ts, server, tool });
            }
            if (ts) recent.push({ name: c.name, ts, server, tool, project });
        }
    });

    recent.sort((a, b) => b.ts - a.ts);
    const mcp = [...mcpCounts.values()].sort((a, b) => b.count - a.count);
    const cli = [...cliCounts.values()].sort((a, b) => b.count - a.count);
    const total = mcp.reduce((s, m) => s + m.count, 0) + cli.reduce((s, c) => s + c.count, 0);

    // Split recent into separate buckets so high-volume CLI traffic doesn't
    // crowd MCP out of the visible list.
    const recentMcp = recent.filter(r => r.name.startsWith("mcp__")).slice(0, RECENT_CAP / 2);
    const recentCli = recent.filter(r => !r.name.startsWith("mcp__")).slice(0, RECENT_CAP / 2);

    const data = { hours, total, mcp, cli, recent: recent.slice(0, RECENT_CAP), recentMcp, recentCli };
    cache = { at: now, hours, data };
    return NextResponse.json(data, CC);
}) as (req: Request) => Promise<Response>;
