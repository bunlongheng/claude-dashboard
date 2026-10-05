import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { cachedToolLog, computeToolLog, parseWin, type Win, type ToolLogData } from "@/lib/tool-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every built-in tool call (Bash, Read, Edit, Agent, Skill...) rebuilt from
// the session transcripts, grouped by tool with a verdict each. Engine and
// types live in lib/tool-log.ts (shared with /api/claude/mcp-log).
export type { Win, ToolCall as CliCall, ToolGroupStat as CliToolStat, ToolLogData as CliLogData, Verdict } from "@/lib/tool-log";

export const computeCliLog = (win: Win, now: number): Promise<ToolLogData> => computeToolLog("cli", win, now);

const CC = { headers: { "Cache-Control": "public, max-age=30" } };

export const GET = withErrorHandler(async (req: Request) => {
    const win = parseWin(new URL(req.url).searchParams.get("win"));
    return NextResponse.json(await cachedToolLog("cli", win), CC);
}) as (req: Request) => Promise<Response>;
