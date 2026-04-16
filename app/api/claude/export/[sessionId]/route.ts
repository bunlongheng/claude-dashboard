import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

function findSession(sessionId: string): string | null {
    // Validate session ID — alphanumeric + hyphens only (prevent path traversal)
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

function folderToProject(folder: string): string {
    return folder.replace(/-/g, "/");
}

interface ContentBlock {
    type: string;
    text?: string;
    thinking?: string;
    name?: string;
    input?: Record<string, unknown>;
    content?: string;
    is_error?: boolean;
    tool_use_id?: string;
}

interface StructuredEvent {
    role: "user" | "assistant" | "tool" | "system";
    timestamp: string;
    text?: string;
    toolName?: string;
    toolSummary?: string;
    toolError?: boolean;
}

function parseLineToEvents(obj: Record<string, unknown>): StructuredEvent[] {
    const ts = (obj.timestamp as string) ?? "";
    const events: StructuredEvent[] = [];

    if (obj.type === "user") {
        const content = (obj.message as { content?: unknown })?.content;
        if (Array.isArray(content)) {
            const textBlock = content.find((c: ContentBlock) => c.type === "text") as ContentBlock | undefined;
            if (textBlock?.text?.trim()) {
                events.push({ role: "user", timestamp: ts, text: textBlock.text });
            }
            for (const block of content) {
                const b = block as ContentBlock;
                if (b.type === "tool_result" && b.content) {
                    events.push({
                        role: "tool",
                        timestamp: ts,
                        text: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
                        toolName: "Result",
                        toolSummary: b.tool_use_id ?? "",
                        toolError: b.is_error ?? false,
                    });
                }
            }
        } else if (typeof content === "string" && content.trim()) {
            events.push({ role: "user", timestamp: ts, text: content });
        }
    }

    if (obj.type === "assistant") {
        const msg = obj.message as { content?: ContentBlock[] } | undefined;
        if (!msg?.content) return events;

        for (const block of msg.content) {
            // Skip thinking blocks
            if (block.type === "thinking") continue;

            if (block.type === "text" && block.text) {
                events.push({ role: "assistant", timestamp: ts, text: block.text });
            }
            if (block.type === "tool_use" && block.name) {
                const inp = block.input ?? {};
                let summary = "";
                switch (block.name) {
                    case "Bash":   summary = String(inp.command ?? ""); break;
                    case "Read":   summary = String(inp.file_path ?? ""); break;
                    case "Edit":   summary = String(inp.file_path ?? ""); break;
                    case "Write":  summary = String(inp.file_path ?? ""); break;
                    case "Grep":   summary = `pattern: "${inp.pattern ?? ""}" path: ${inp.path ?? "."}`; break;
                    case "Glob":   summary = String(inp.pattern ?? ""); break;
                    case "Agent":  summary = String(inp.description ?? inp.prompt ?? ""); break;
                    default:       summary = JSON.stringify(inp).slice(0, 500);
                }
                events.push({ role: "tool", timestamp: ts, toolName: block.name, toolSummary: summary });
            }
        }
    }

    return events;
}

function formatTimestamp(ts: string): string {
    if (!ts) return "";
    try {
        const d = new Date(ts);
        return d.toLocaleString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        });
    } catch { return ts; }
}

function eventsToMarkdown(events: StructuredEvent[], projectName: string, sessionId: string): string {
    const firstUser = events.find(e => e.role === "user");
    const title = firstUser?.text?.slice(0, 80) ?? "Session";
    const lines: string[] = [];

    lines.push(`# ${projectName} — ${title}`);
    lines.push("");
    lines.push(`> Session: \`${sessionId}\``);
    if (events.length > 0 && events[0].timestamp) {
        lines.push(`> Started: ${formatTimestamp(events[0].timestamp)}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const ev of events) {
        const tsLabel = ev.timestamp ? `_${formatTimestamp(ev.timestamp)}_` : "";

        if (ev.role === "user") {
            lines.push(`## User`);
            if (tsLabel) lines.push(tsLabel);
            lines.push("");
            lines.push(ev.text ?? "");
            lines.push("");
        } else if (ev.role === "assistant") {
            lines.push(`## Claude`);
            if (tsLabel) lines.push(tsLabel);
            lines.push("");
            lines.push(ev.text ?? "");
            lines.push("");
        } else if (ev.role === "tool" && ev.toolName === "Result") {
            // Tool result — render as collapsed output
            const content = ev.text ?? "";
            if (content.length > 500) {
                lines.push(`<details><summary>Tool Result${ev.toolError ? " (error)" : ""}</summary>`);
                lines.push("");
                lines.push("```");
                lines.push(content);
                lines.push("```");
                lines.push("");
                lines.push("</details>");
            } else {
                lines.push(`### Tool Result${ev.toolError ? " (error)" : ""}`);
                lines.push("");
                lines.push("```");
                lines.push(content);
                lines.push("```");
            }
            lines.push("");
        } else if (ev.role === "tool") {
            lines.push(`### Tool: ${ev.toolName}`);
            lines.push("");
            lines.push("```");
            lines.push(ev.toolSummary ?? "");
            lines.push("```");
            lines.push("");
        }
    }

    return lines.join("\n");
}

function readAndParseJSONL(filePath: string): StructuredEvent[] {
    const events: StructuredEvent[] = [];
    const data = fs.readFileSync(filePath, "utf-8");
    for (const line of data.split("\n")) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            events.push(...parseLineToEvents(obj));
        } catch { /* skip malformed */ }
    }
    return events;
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

    const events = readAndParseJSONL(filePath);

    // Extract project name from folder
    const folder = path.basename(path.dirname(filePath));
    const projectName = folderToProject(folder).split("/").pop() ?? folder;

    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    if (format === "json") {
        return NextResponse.json({
            sessionId,
            project: projectName,
            projectPath: folderToProject(folder),
            eventCount: events.length,
            events,
        });
    }

    // Default: markdown download
    const markdown = eventsToMarkdown(events, projectName, sessionId);
    const filename = `${projectName}-${sessionId.slice(0, 8)}.md`;

    return new Response(markdown, {
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-cache",
        },
    });
}
