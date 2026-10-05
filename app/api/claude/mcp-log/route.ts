import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { cachedToolLog, computeToolLog, parseWin, type Win, type ToolLogData } from "@/lib/tool-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every MCP tool call rebuilt from the session transcripts, grouped by server
// with a verdict each. Engine and types live in lib/tool-log.ts (shared with
// /api/claude/cli-log).
export type { Win, ToolCall as McpCall, ToolGroupStat as McpServerStat, ToolSubStat as McpToolStat, ToolLogData as McpLogData, Verdict } from "@/lib/tool-log";

export const computeMcpLog = (win: Win, now: number): Promise<ToolLogData> => computeToolLog("mcp", win, now);

const CC = { headers: { "Cache-Control": "public, max-age=30" } };

export const GET = withErrorHandler(async (req: Request) => {
    const win = parseWin(new URL(req.url).searchParams.get("win"));
    return NextResponse.json(await cachedToolLog("mcp", win), CC);
}) as (req: Request) => Promise<Response>;
