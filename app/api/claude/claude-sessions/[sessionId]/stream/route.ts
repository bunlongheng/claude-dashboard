import { NextRequest } from "next/server";
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

interface ParsedEvent { event: string; data: Record<string, unknown> }

function parseJSONLLine(obj: Record<string, unknown>): ParsedEvent[] {
    const ts = (obj.timestamp as string) ?? new Date().toISOString();
    const events: ParsedEvent[] = [];

    if (obj.type === "user") {
        const todos = obj.todos as unknown[];
        if (Array.isArray(todos) && todos.length > 0) {
            events.push({ event: "todos", data: { todos, timestamp: ts } });
        }
        const content = (obj.message as { content?: unknown })?.content;
        if (Array.isArray(content)) {
            // Extract user text
            const textBlock = content.find((c: { type: string }) => c.type === "text") as { text?: string } | undefined;
            if (textBlock?.text?.trim()) {
                events.push({ event: "user_msg", data: { text: textBlock.text.slice(0, 2000), timestamp: ts } });
            }
            // Extract tool results (code output, file contents, etc.)
            for (const block of content) {
                const b = block as { type: string; content?: string; is_error?: boolean; tool_use_id?: string };
                if (b.type === "tool_result" && b.content) {
                    events.push({
                        event: "tool_result",
                        data: { content: b.content, is_error: b.is_error ?? false, tool_use_id: b.tool_use_id ?? "", timestamp: ts },
                    });
                }
            }
        } else if (typeof content === "string" && content.trim()) {
            events.push({ event: "user_msg", data: { text: content.slice(0, 2000), timestamp: ts } });
        }
        return events;
    }

    if (obj.type === "assistant") {
        const msg = obj.message as { content?: unknown[]; usage?: Record<string, number>; model?: string } | undefined;
        if (!msg) return events;

        // Emit all content blocks
        if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
                const b = block as { type: string; thinking?: string; text?: string; name?: string; input?: Record<string, unknown> };
                if (b.type === "thinking" && b.thinking) {
                    events.push({ event: "thinking", data: { text: b.thinking, timestamp: ts } });
                }
                if (b.type === "text" && b.text) {
                    events.push({ event: "text", data: { text: b.text, timestamp: ts } });
                }
                if (b.type === "tool_use" && b.name) {
                    const inp = b.input ?? {};
                    let summary = "";
                    switch (b.name) {
                        case "Bash":   summary = String(inp.command ?? "").slice(0, 200); break;
                        case "Read":   summary = String(inp.file_path ?? "").split("/").slice(-3).join("/"); break;
                        case "Edit":   summary = String(inp.file_path ?? "").split("/").slice(-3).join("/"); break;
                        case "Write":  summary = String(inp.file_path ?? "").split("/").slice(-3).join("/"); break;
                        case "Grep":   summary = `"${String(inp.pattern ?? "").slice(0, 80)}" in ${String(inp.path ?? "").split("/").slice(-2).join("/")}`; break;
                        case "Glob":   summary = String(inp.pattern ?? "").slice(0, 100); break;
                        case "Agent":  summary = String(inp.description ?? inp.prompt ?? "").slice(0, 200); break;
                        default:       summary = JSON.stringify(inp).slice(0, 200);
                    }
                    events.push({ event: "tool", data: { name: b.name, summary, timestamp: ts } });
                }
            }
        }

        // Emit usage alongside content (not instead of)
        if (msg.usage) {
            events.push({
                event: "usage",
                data: {
                    input_tokens: msg.usage.input_tokens ?? 0,
                    output_tokens: msg.usage.output_tokens ?? 0,
                    cache_read: msg.usage.cache_read_input_tokens ?? 0,
                    cache_creation: msg.usage.cache_creation_input_tokens ?? 0,
                    model: msg.model ?? "",
                    timestamp: ts,
                }
            });
        }
    }

    // summary lines (from Claude's internal usage tracking)
    if (obj.type === "summary") {
        const summary = obj.summary as { usage?: Record<string, number>; model?: string } | undefined;
        if (summary?.usage) {
            events.push({
                event: "usage",
                data: {
                    input_tokens: summary.usage.input_tokens ?? 0,
                    output_tokens: summary.usage.output_tokens ?? 0,
                    cache_read: summary.usage.cache_read_input_tokens ?? 0,
                    cache_creation: summary.usage.cache_creation_input_tokens ?? 0,
                    model: summary.model ?? "",
                    timestamp: ts,
                }
            });
        }
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
        return new Response("Session not found", { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            let offset = 0;
            let partial = "";

            function send(event: string, data: unknown) {
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                } catch { /* client disconnected */ }
            }

            function flush() {
                try {
                    const stat = fs.statSync(filePath!);
                    const size = stat.size;
                    if (size <= offset) return;

                    const fd = fs.openSync(filePath!, "r");
                    const buf = Buffer.alloc(size - offset);
                    fs.readSync(fd, buf, 0, size - offset, offset);
                    fs.closeSync(fd);

                    offset = size;
                    partial += buf.toString("utf-8");

                    const lines = partial.split("\n");
                    partial = lines.pop() ?? "";

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const obj = JSON.parse(line) as Record<string, unknown>;
                            for (const parsed of parseJSONLLine(obj)) {
                                send(parsed.event, parsed.data);
                            }
                        } catch { /* skip malformed */ }
                    }
                } catch { /* file gone */ }
            }

            // Read all existing content first (catch-up), then keep polling
            flush();
            send("ready", { sessionId, filePath: filePath!.split("/").slice(-3).join("/") });

            const interval = setInterval(flush, 1000);

            req.signal.addEventListener("abort", () => {
                clearInterval(interval);
                try { controller.close(); } catch { /* ignore */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
