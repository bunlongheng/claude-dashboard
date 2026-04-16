import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

function findSession(sessionId: string): string | null {
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) return null;
    try {
        const folders = fs.readdirSync(CLAUDE_DIR);
        for (const folder of folders) {
            const fp = path.join(CLAUDE_DIR, folder, `${sessionId}.jsonl`);
            if (fs.existsSync(fp)) return fp;
        }
    } catch { /* skip */ }
    return null;
}

interface ContentBlock {
    type: string;
    text?: string;
    thinking?: string;
    name?: string;
    input?: Record<string, unknown>;
    content?: string;
    is_error?: boolean;
}

interface ReplayEvent {
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
    delay: number;
    index: number;
}

function classifyLine(obj: Record<string, unknown>): { type: string; data: Record<string, unknown> } | null {
    const ts = (obj.timestamp as string) ?? "";

    if (obj.type === "user") {
        const content = (obj.message as { content?: unknown })?.content;
        let text = "";
        if (Array.isArray(content)) {
            const textBlock = content.find((c: ContentBlock) => c.type === "text") as ContentBlock | undefined;
            text = textBlock?.text ?? "";
        } else if (typeof content === "string") {
            text = content;
        }
        return { type: "user_message", data: { text: text.slice(0, 4000), timestamp: ts } };
    }

    if (obj.type === "assistant") {
        const msg = obj.message as { content?: ContentBlock[]; usage?: Record<string, number>; model?: string } | undefined;
        if (!msg?.content) return null;

        const blocks: Record<string, unknown>[] = [];
        for (const block of msg.content) {
            if (block.type === "thinking" && block.thinking) {
                blocks.push({ type: "thinking", length: block.thinking.length });
            }
            if (block.type === "text" && block.text) {
                blocks.push({ type: "text", text: block.text });
            }
            if (block.type === "tool_use" && block.name) {
                const inp = block.input ?? {};
                let summary = "";
                switch (block.name) {
                    case "Bash":   summary = String(inp.command ?? "").slice(0, 300); break;
                    case "Read":   summary = String(inp.file_path ?? ""); break;
                    case "Edit":   summary = String(inp.file_path ?? ""); break;
                    case "Write":  summary = String(inp.file_path ?? ""); break;
                    case "Grep":   summary = `"${String(inp.pattern ?? "").slice(0, 100)}" in ${String(inp.path ?? ".")}`; break;
                    case "Glob":   summary = String(inp.pattern ?? "").slice(0, 200); break;
                    case "Agent":  summary = String(inp.description ?? inp.prompt ?? "").slice(0, 300); break;
                    default:       summary = JSON.stringify(inp).slice(0, 300);
                }
                blocks.push({ type: "tool_use", name: block.name, summary });
            }
        }

        return {
            type: "assistant_message",
            data: {
                blocks,
                usage: msg.usage ?? null,
                model: msg.model ?? "",
                timestamp: ts,
            },
        };
    }

    if (obj.type === "summary") {
        return { type: "summary", data: { summary: obj.summary ?? {}, timestamp: ts } };
    }

    if (obj.type === "custom-title") {
        return { type: "custom_title", data: { title: obj.customTitle ?? "", timestamp: ts } };
    }

    // Pass through any other types
    return { type: String(obj.type ?? "unknown"), data: { timestamp: ts } };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;
    const filePath = findSession(sessionId);

    if (!filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 1000, 5000) : 5000;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : 0;

    const data = fs.readFileSync(filePath, "utf-8");
    const lines = data.split("\n").filter(l => l.trim());

    const events: ReplayEvent[] = [];
    let prevTs = 0;
    let idx = 0;

    for (const line of lines) {
        try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const classified = classifyLine(obj);
            if (!classified) continue;

            const ts = (obj.timestamp as string) ?? "";
            const tsMs = ts ? new Date(ts).getTime() : 0;
            const delay = prevTs > 0 && tsMs > 0 ? Math.max(0, tsMs - prevTs) : 0;
            if (tsMs > 0) prevTs = tsMs;

            if (idx >= offset && idx < offset + limit) {
                events.push({
                    type: classified.type,
                    data: classified.data,
                    timestamp: ts,
                    delay,
                    index: idx,
                });
            }
            idx++;
        } catch { /* skip malformed */ }
    }

    const firstTs = lines.length > 0 ? (() => {
        try { return new Date(JSON.parse(lines[0]).timestamp).getTime(); } catch { return 0; }
    })() : 0;
    const lastTs = lines.length > 0 ? (() => {
        try { return new Date(JSON.parse(lines[lines.length - 1]).timestamp).getTime(); } catch { return 0; }
    })() : 0;
    const totalDuration = firstTs > 0 && lastTs > 0 ? lastTs - firstTs : 0;

    const folder = path.basename(path.dirname(filePath));

    return NextResponse.json({
        sessionId,
        project: folder.replace(/-/g, "/"),
        totalEvents: idx,
        eventCount: events.length,
        offset,
        limit,
        totalDuration,
        totalDurationFormatted: totalDuration > 0
            ? `${Math.floor(totalDuration / 60000)}m ${Math.floor((totalDuration % 60000) / 1000)}s`
            : "unknown",
        events,
    });
}
