import { NextResponse } from "next/server";
import { streamJsonl } from "@/lib/jsonl-walk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

// Files are streamed line by line (no tail cap, so an old date inside a huge
// file still counts) behind a short server-side cache so repeat clicks on the
// same punchcard cell don't re-scan every file.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: unknown }>();


// Local-time YYYY-MM-DD - must match the punchcard's local bucketing so cell counts
// in /api/claude/token-stats/daily and drill totals stay aligned.
function localYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type TurnEntry = {
    ts: string;          // ISO timestamp
    role: string;        // "user" (real prompt) or "assistant" (usage-bearing reply)
    preview: string;     // first ~160 chars of text
    full?: string;       // full text content (text/thinking blocks) for click-to-expand; absent for redacted thinking
    model?: string;
    inTokens?: number;       // new input tokens this turn (uncached)
    outTokens?: number;      // output tokens
    cacheReadTokens?: number;    // tokens read from prompt cache (cheap reuse)
    cacheCreationTokens?: number; // tokens written to cache this turn
};

// Full text body for click-to-expand. Concatenates every text and thinking block.
// Tool_use blocks render as "[Tool] arg" lines so the row stays useful when there is no prose.
// Returns "" for fully-redacted turns (caller treats absent/empty as "no expandable body").
function fullText(message: unknown): string {
    const m = message as { content?: unknown } | undefined;
    const c = m?.content;
    if (typeof c === "string") return c;
    if (!Array.isArray(c)) return "";
    const parts: string[] = [];
    for (const block of c as Array<{ type?: string; text?: string; thinking?: string; signature?: string; name?: string; input?: Record<string, unknown> }>) {
        if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) parts.push(block.text);
        else if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.length > 0) parts.push(`[thinking]\n${block.thinking}`);
        else if (block.type === "tool_use") parts.push(describeToolUse(block));
    }
    return parts.join("\n\n");
}

// Shorten a long absolute path to its last 1-2 meaningful segments (drops home/Sites prefix).
function shortPath(p: string): string {
    if (!p) return "";
    const parts = p.split("/").filter(Boolean);
    if (parts.length <= 2) return p.replace(/^.*?\/?([^/]+\/[^/]+)$/, "$1");
    return parts.slice(-2).join("/");
}

// Pull the most useful arg out of a tool_use block so the row reads like
// `[Edit] lib/rag-search.ts` instead of just `[tool: Edit]`.
function describeToolUse(block: { name?: string; input?: Record<string, unknown> }): string {
    const name = block.name ?? "?";
    const input = (block.input ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
    let arg = "";
    switch (name) {
        case "Edit":
        case "Write":
        case "Read":
        case "NotebookEdit":
            arg = shortPath(str("file_path"));
            break;
        case "Bash":
            arg = str("description") || str("command").slice(0, 70);
            break;
        case "Grep":
        case "Glob":
            arg = str("pattern");
            break;
        case "Agent":
        case "Task":
            arg = str("description");
            break;
        case "WebFetch": {
            const url = str("url");
            try { arg = url ? new URL(url).hostname : ""; } catch { arg = url.slice(0, 60); }
            break;
        }
        case "WebSearch":
            arg = str("query");
            break;
        case "Skill":
            arg = str("skill") + (str("args") ? ` ${str("args").slice(0, 60)}` : "");
            break;
        case "TodoWrite": {
            const todos = input.todos as unknown[] | undefined;
            arg = Array.isArray(todos) ? `${todos.length} item${todos.length === 1 ? "" : "s"}` : "";
            break;
        }
        default: {
            // Generic best-effort: first string-typed input value, truncated.
            const firstStr = Object.values(input).find(v => typeof v === "string" && v.length > 0) as string | undefined;
            arg = firstStr ? firstStr.slice(0, 70) : "";
        }
    }
    return arg ? `[${name}] ${arg.replace(/\s+/g, " ").trim()}` : `[${name}]`;
}

// Pull a short text preview off the message content (string or content-block array).
// Falls back to tool_use name+arg, then extended-thinking text, so turns with only thinking
// or tool calls still get a useful preview instead of "no text content".
function previewText(message: unknown): string {
    const m = message as { content?: unknown } | undefined;
    const c = m?.content;
    if (typeof c === "string") return c.slice(0, 160).replace(/\s+/g, " ").trim();
    if (Array.isArray(c)) {
        const blocks = c as Array<{ type?: string; text?: string; thinking?: string; signature?: string; name?: string; input?: Record<string, unknown> }>;
        const text = blocks.find(x => x.type === "text" && typeof x.text === "string" && x.text.trim().length > 0)?.text;
        if (text) return text.slice(0, 160).replace(/\s+/g, " ").trim();
        const tools = blocks.filter(x => x.type === "tool_use");
        if (tools.length === 1) return describeToolUse(tools[0]).slice(0, 160);
        if (tools.length > 1) return tools.map(describeToolUse).join(" · ").slice(0, 160);
        const thinking = blocks.find(x => x.type === "thinking" && typeof x.thinking === "string" && x.thinking.trim().length > 0)?.thinking;
        if (thinking) return `[thinking] ${thinking.slice(0, 140).replace(/\s+/g, " ").trim()}`;
        // Redacted thinking: empty `thinking` string + `signature` (encrypted committed reasoning).
        if (blocks.some(x => x.type === "thinking" && typeof x.signature === "string")) return "[thinking - redacted]";
    }
    return "";
}

// A "real" user prompt: type=user with actual text content (not just tool_result blocks).
function isUserPrompt(line: { type?: string; message?: { role?: string; content?: unknown } }): boolean {
    if (line.type !== "user" && line.message?.role !== "user") return false;
    const c = line.message?.content;
    if (typeof c === "string") return c.trim().length > 0;
    if (Array.isArray(c)) {
        return (c as Array<{ type?: string; text?: string }>).some(b => b?.type === "text" && typeof b.text === "string" && b.text.trim().length > 0);
    }
    return false;
}

// Drill-down endpoint: given a date (UTC YYYY-MM-DD) and a local hour (0-23),
// returns which sessions had turns in that exact hour bucket, the count, AND each turn's details.
// Matches the counting rule of /api/claude/tokens so the totals line up with the Activity card.
export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || "";
    const hourStr = url.searchParams.get("hour") || "";
    const hour = parseInt(hourStr, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(hour) || hour < 0 || hour > 23) {
        return NextResponse.json(
            { error: "missing or invalid date / hour", sessionTurns: {}, sessionPrompts: {}, sessionEntries: {}, totalTurns: 0, totalPrompts: 0, totalSessions: 0 },
            { status: 400 },
        );
    }

    const cacheKey = `${date}:${hour}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return NextResponse.json(hit.data, { headers: { "Cache-Control": "no-store" } });
    }

    const sessionTurns: Record<string, number> = {};
    const sessionPrompts: Record<string, number> = {};
    const sessionEntries: Record<string, TurnEntry[]> = {};
    let totalTurns = 0;
    let totalPrompts = 0;

    if (!fs.existsSync(CLAUDE_DIR)) {
        return NextResponse.json({ sessionTurns, sessionPrompts, sessionEntries, totalTurns, totalPrompts, totalSessions: 0, date, hour });
    }

    // Local midnight of the target date, same local-day bucketing as /api/claude/tokens.
    const [ty, tm, td] = date.split("-").map(Number);
    const targetDateStart = new Date(ty, tm - 1, td).getTime();

    // Same walk and counting rule as /api/claude/tokens so a drilled cell
    // matches the Activity card: every project folder, main transcripts plus
    // their subagents (<session>/subagents/**.jsonl, counted under the parent
    // session), and 1 turn per assistant message id across every file - a
    // streamed message is written several times and the copy with the most
    // output is the finished one.
    const seen = new Map<string, { session: string; entry: TurnEntry; out: number; order: number }>();
    const prompts: { session: string; entry: TurnEntry; order: number }[] = [];
    let anon = 0;
    let order = 0; // file encounter order, breaks timestamp ties (a prompt and its reply can share a second)
    const visit = async (filePath: string, session: string) => {
        let stat: fs.Stats;
        try { stat = fs.statSync(filePath); } catch { return; }
        if (stat.mtime.getTime() < targetDateStart) return;
        await streamJsonl(filePath, line => line.includes('"usage"') || line.includes('"type":"user"'), (parsed) => {
            const d = parsed as { type?: string; timestamp?: unknown; message?: { id?: unknown; role?: string; model?: string; usage?: Record<string, number> } };
            const ts = d.timestamp;
            if (!ts || typeof ts !== "string") return;
            const tsDate = new Date(ts);
            if (isNaN(tsDate.getTime())) return;
            if (localYMD(tsDate) !== date) return;
            if (tsDate.getHours() !== hour) return;
            const usage = d.message?.usage;
            if (d.type === "assistant" && usage) {
                const full = fullText(d.message);
                const entry: TurnEntry = {
                    ts,
                    role: d.message?.role ?? "assistant",
                    preview: previewText(d.message),
                    full: full || undefined,
                    model: d.message?.model,
                    inTokens: usage.input_tokens ?? 0,
                    outTokens: usage.output_tokens ?? 0,
                    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
                    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
                };
                const id = typeof d.message?.id === "string" ? d.message.id : `${ts}:${anon++}`;
                const cur = seen.get(id);
                if (!cur || (entry.outTokens ?? 0) > cur.out) seen.set(id, { session, entry, out: entry.outTokens ?? 0, order: cur?.order ?? order++ });
            } else if (isUserPrompt(d)) {
                const full = fullText(d.message);
                prompts.push({ session, entry: { ts, role: "user", preview: previewText(d.message), full: full || undefined }, order: order++ });
            }
        });
    };
    const walk = async (dir: string, session: string) => {
        let names: fs.Dirent[] = [];
        try { names = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return; }
        for (const n of names) {
            const fp = path.join(dir, n.name);
            if (n.isDirectory()) await walk(fp, session || n.name);
            else if (n.name.endsWith(".jsonl")) await visit(fp, session || n.name.slice(0, -6));
        }
    };
    for (const folder of fs.readdirSync(CLAUDE_DIR)) await walk(path.join(CLAUDE_DIR, folder), "");

    const ordered: Record<string, { entry: TurnEntry; order: number }[]> = {};
    for (const { session, entry, order: o } of seen.values()) {
        (ordered[session] ??= []).push({ entry, order: o });
        sessionTurns[session] = (sessionTurns[session] ?? 0) + 1;
        totalTurns++;
    }
    for (const { session, entry, order: o } of prompts) {
        (ordered[session] ??= []).push({ entry, order: o });
        sessionPrompts[session] = (sessionPrompts[session] ?? 0) + 1;
        totalPrompts++;
    }
    for (const [session, list] of Object.entries(ordered)) {
        sessionEntries[session] = list.sort((x, y) => x.entry.ts.localeCompare(y.entry.ts) || x.order - y.order).map(x => x.entry);
    }

    const totalSessions = new Set([...Object.keys(sessionTurns), ...Object.keys(sessionPrompts)]).size;
    const data = { sessionTurns, sessionPrompts, sessionEntries, totalTurns, totalPrompts, totalSessions, date, hour };
    cache.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}) as (req: Request) => Promise<Response>;
