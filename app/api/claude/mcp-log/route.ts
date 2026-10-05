import { NextResponse } from "next/server";
import { PROJECTS_DIR, streamJsonl, diskCache } from "@/lib/jsonl-walk";
import { getModelRates } from "@/lib/pricing";
import { withErrorHandler } from "@/lib/api-handler";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One MCP tool call, reconstructed from a session transcript: the tool_use
// block (what / when / where / by which model), its tool_result (how big, how
// slow, did it fail) and the last human prompt before it (why).
export interface McpCall {
    ts: number;
    server: string;
    tool: string;
    project: string;
    sessionId: string;
    model: string;
    skill: string | null;
    branch: string | null;
    prompt: string;
    input: string;
    result: string;
    resultChars: number;
    resultTokens: number;
    outTokens: number;
    isError: boolean;
    latencyMs: number | null;
    cost: number;
}

export type Verdict = "keep" | "low" | "idle" | "gone" | "flaky" | "connector";

export interface McpToolStat { tool: string; calls: number; errors: number; tokens: number; lastUsed: number }
export interface McpServerStat {
    server: string;
    configured: boolean;
    verdict: Verdict;
    reason: string;
    calls: number;
    errors: number;
    tokens: number;
    cost: number;
    firstUsed: number;
    lastUsed: number;
    sessions: number;
    projects: string[];
    models: Record<string, number>;
    skills: Record<string, number>;
    tools: McpToolStat[];
    series: number[]; // calls per bucket, aligned with McpLogData.buckets.labels, oldest first
}

export type Win = "today" | "7d" | "30d" | "90d";
export interface McpLogData {
    win: Win;
    since: number;
    hours: number;
    buckets: { unit: "hour" | "day" | "month"; labels: string[] };
    totals: { calls: number; errors: number; tokens: number; cost: number; sessions: number; servers: number };
    servers: McpServerStat[];
    recent: McpCall[];
}

const CACHE_TTL_MS = 30_000;
const CC = { headers: { "Cache-Control": "public, max-age=30" } };
const MAX_HOURS = 2160; // 90d
const RECENT_CAP = 500;
const SNIPPET = 200;
// Rough but honest: ~4 chars per token for JSON/English tool output.
const CHARS_PER_TOKEN = 4;
const CMD_RE = /<command-name>\/([\w:-]+)<\/command-name>/;
const ARGS_RE = /<command-args>([^<]*)<\/command-args>/;

const WINS: Win[] = ["today", "7d", "30d", "90d"];
const DAY_MS = 86_400_000;
let cache: { at: number; win: Win; data: McpLogData } | null = null;
const inflight = new Map<Win, Promise<McpLogData>>();

const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const ym = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}`; };

// Calendar buckets so the sparkline reads like a clock or a calendar: today by
// hour, 7d and 30d by day, 90d by month. All local time.
function buildBuckets(win: Win, now: number): { since: number; unit: McpLogData["buckets"]["unit"]; labels: string[]; indexOf: (ts: number) => number } {
    if (win === "today") {
        const since = midnight(now);
        const labels = Array.from({ length: 24 }, (_, h) => h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
        return { since, unit: "hour", labels, indexOf: ts => new Date(ts).getHours() };
    }
    if (win === "90d") {
        const since = midnight(now - 89 * DAY_MS);
        const labels: string[] = []; const idx = new Map<string, number>();
        const d = new Date(since); d.setDate(1);
        while (d.getTime() <= now) { idx.set(ym(d.getTime()), labels.length); labels.push(d.toLocaleString("en-US", { month: "short" })); d.setMonth(d.getMonth() + 1); }
        return { since, unit: "month", labels, indexOf: ts => idx.get(ym(ts)) ?? -1 };
    }
    const n = win === "7d" ? 7 : 30;
    const since = midnight(now - (n - 1) * DAY_MS);
    const labels: string[] = []; const idx = new Map<string, number>();
    for (let i = 0; i < n; i++) {
        const d = new Date(since); d.setDate(d.getDate() + i);
        idx.set(ymd(d.getTime()), i);
        labels.push(n === 7 ? d.toLocaleString("en-US", { weekday: "short" }) : `${d.getMonth() + 1}/${d.getDate()}`);
    }
    return { since, unit: "day", labels, indexOf: ts => idx.get(ymd(ts)) ?? -1 };
}

type FileEntry = { key: string; calls: McpCall[] };
const disk = diskCache<FileEntry>("mcp-log-cache");
const fileCache = disk.load();

// Servers currently registered in ~/.claude.json (global + per-project) and
// ~/.claude/.mcp.json. Anything in the transcripts but not here is a server
// that was removed - or a claude.ai connector (claude_ai_*), which lives on
// the claude.ai side and is never in local config.
function configuredServers(): Set<string> {
    const out = new Set<string>();
    const home = os.homedir();
    const read = (fp: string): Record<string, unknown> | null => {
        try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
    };
    const global = read(path.join(home, ".claude.json"));
    if (global) {
        for (const k of Object.keys((global.mcpServers as object) ?? {})) out.add(k);
        for (const p of Object.values((global.projects as Record<string, { mcpServers?: object }>) ?? {})) {
            for (const k of Object.keys(p?.mcpServers ?? {})) out.add(k);
        }
    }
    const root = read(path.join(home, ".claude", ".mcp.json"));
    if (root) for (const k of Object.keys((root.mcpServers as object) ?? root)) out.add(k);
    return out;
}

function cleanPrompt(raw: string): string {
    const cmd = CMD_RE.exec(raw);
    if (cmd) {
        const args = ARGS_RE.exec(raw)?.[1]?.trim();
        return `/${cmd[1]}${args ? ` ${args}` : ""}`.slice(0, SNIPPET);
    }
    const text = raw
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.slice(0, SNIPPET);
}

function snippet(v: unknown): string {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
    return s.length > SNIPPET ? `${s.slice(0, SNIPPET)}...` : s;
}

function resultText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return (content as Array<{ type?: string; text?: string }>)
            .map(c => (c?.type === "text" && typeof c.text === "string" ? c.text : ""))
            .join("\n");
    }
    return "";
}

type Line = {
    type?: string;
    timestamp?: string;
    cwd?: string;
    sessionId?: string;
    gitBranch?: string;
    attributionSkill?: string;
    message?: { role?: string; model?: string; content?: unknown; usage?: { output_tokens?: number } };
};

async function extractCalls(fp: string, folder: string): Promise<McpCall[]> {
    const calls: McpCall[] = [];
    const pending = new Map<string, McpCall>();
    let lastPrompt = "";
    const keep = (line: string) => {
        if (line.includes('"name":"mcp__')) return true;
        if (line.includes('"tool_use_id":"')) {
            for (const id of pending.keys()) if (line.includes(id)) return true;
            return false;
        }
        return line.includes('"type":"user"') && line.includes('"content":"');
    };
    await streamJsonl(fp, keep, (parsed) => {
        const m = parsed as Line;
        const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
        const content = m.message?.content;
        if (m.type === "user" && typeof content === "string") {
            const p = cleanPrompt(content);
            if (p) lastPrompt = p;
            return;
        }
        if (!Array.isArray(content)) return;
        const blocks = content as Array<{ type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean }>;
        if (m.type === "assistant") {
            for (const c of blocks) {
                if (c.type !== "tool_use" || !c.name?.startsWith("mcp__") || !c.id) continue;
                const parts = c.name.split("__");
                const project = m.cwd ? path.basename(m.cwd) : folder.replace(/^.*-Sites-/, "");
                const model = m.message?.model ?? "";
                const outTokens = m.message?.usage?.output_tokens ?? 0;
                const call: McpCall = {
                    ts, server: parts[1] ?? "?", tool: parts.slice(2).join("__"),
                    project, sessionId: m.sessionId ?? path.basename(fp, ".jsonl"), model,
                    skill: m.attributionSkill ?? null, branch: m.gitBranch ?? null,
                    prompt: lastPrompt, input: snippet(c.input), result: "", resultChars: 0, resultTokens: 0,
                    outTokens, isError: false, latencyMs: null,
                    cost: (outTokens / 1_000_000) * getModelRates(model).output,
                };
                pending.set(c.id, call);
                calls.push(call);
            }
            return;
        }
        for (const c of blocks) {
            if (c.type !== "tool_result" || !c.tool_use_id) continue;
            const call = pending.get(c.tool_use_id);
            if (!call) continue;
            pending.delete(c.tool_use_id);
            const text = resultText(c.content);
            call.result = snippet(text);
            call.resultChars = text.length;
            call.resultTokens = Math.round(text.length / CHARS_PER_TOKEN);
            call.isError = Boolean(c.is_error);
            call.latencyMs = ts && call.ts ? Math.max(0, ts - call.ts) : null;
            // The result is re-read as input on the very next turn; that is the
            // cost the call itself adds (its stay in context after that is paid
            // at cache-read rates and is not attributed here).
            call.cost += (call.resultTokens / 1_000_000) * getModelRates(call.model).input;
        }
    });
    return calls;
}

function verdictFor(server: string, configured: boolean, calls: number, errors: number, hours: number): { verdict: Verdict; reason: string } {
    if (server.startsWith("claude_ai_")) return { verdict: "connector", reason: "claude.ai connector - lives on the claude.ai side, not in local config" };
    if (!configured) return { verdict: "gone", reason: `no longer in ~/.claude.json but still had ${calls} call${calls === 1 ? "" : "s"} in the window - a skill probably still references it` };
    if (calls === 0) return { verdict: "idle", reason: hours < 168 ? "no calls in this window - widen to 30d or 90d before judging it" : "registered, 0 calls - its tool schema is still loaded into every session for nothing" };
    if (calls >= 4 && errors / calls >= 0.25) return { verdict: "flaky", reason: `${errors} of ${calls} calls errored` };
    const perMonth = calls / Math.max(hours / 720, 1 / 30);
    if (perMonth < 5) return { verdict: "low", reason: `about ${Math.round(perMonth * 10) / 10} calls a month - a skill with curl would do the same at 0 RAM` };
    return { verdict: "keep", reason: "used regularly" };
}

export async function computeMcpLog(win: Win, now: number): Promise<McpLogData> {
    const { since, unit, labels, indexOf } = buildBuckets(win, now);
    const hours = Math.max(1, (now - since) / 3600_000);
    const configured = configuredServers();
    const all: McpCall[] = [];

    if (fs.existsSync(PROJECTS_DIR)) {
        const seen = new Map<string, FileEntry>();
        let dirty = false;
        for (const folder of fs.readdirSync(PROJECTS_DIR)) {
            const dir = path.join(PROJECTS_DIR, folder);
            let dstat;
            try { dstat = fs.statSync(dir); } catch { continue; }
            if (!dstat.isDirectory()) continue;
            for (const file of fs.readdirSync(dir)) {
                if (!file.endsWith(".jsonl")) continue;
                const fp = path.join(dir, file);
                let st;
                try { st = fs.statSync(fp); } catch { continue; }
                // Keep the per-file cache warm for the largest window so a tab
                // switch (7d -> 90d) never re-streams a file already parsed.
                if (st.mtimeMs < now - MAX_HOURS * 3600_000) continue;
                const key = `${st.mtimeMs}:${st.size}`;
                let entry = fileCache.get(fp);
                if (!entry || entry.key !== key) {
                    entry = { key, calls: await extractCalls(fp, folder) };
                    fileCache.set(fp, entry);
                    dirty = true;
                }
                seen.set(fp, entry);
                for (const c of entry.calls) if (c.ts >= since) all.push(c);
            }
        }
        if (dirty) disk.save(seen);
    }

    all.sort((a, b) => b.ts - a.ts);
    const byServer = new Map<string, McpServerStat & { _sessions: Set<string>; _projects: Set<string>; _tools: Map<string, McpToolStat> }>();
    const getServer = (name: string) => {
        let s = byServer.get(name);
        if (!s) {
            s = {
                server: name, configured: configured.has(name), verdict: "idle", reason: "",
                calls: 0, errors: 0, tokens: 0, cost: 0, firstUsed: 0, lastUsed: 0, sessions: 0, projects: [],
                models: {}, skills: {}, tools: [], series: new Array(labels.length).fill(0),
                _sessions: new Set(), _projects: new Set(), _tools: new Map(),
            };
            byServer.set(name, s);
        }
        return s;
    };
    for (const name of configured) getServer(name);
    const allSessions = new Set<string>();
    for (const c of all) {
        const s = getServer(c.server);
        s.calls++;
        if (c.isError) s.errors++;
        s.tokens += c.resultTokens;
        s.cost += c.cost;
        if (!s.firstUsed || c.ts < s.firstUsed) s.firstUsed = c.ts;
        if (c.ts > s.lastUsed) s.lastUsed = c.ts;
        s._sessions.add(c.sessionId);
        s._projects.add(c.project);
        allSessions.add(c.sessionId);
        s.models[c.model] = (s.models[c.model] ?? 0) + 1;
        if (c.skill) s.skills[c.skill] = (s.skills[c.skill] ?? 0) + 1;
        const b = indexOf(c.ts);
        if (b >= 0 && b < s.series.length) s.series[b]++;
        const t = s._tools.get(c.tool) ?? { tool: c.tool, calls: 0, errors: 0, tokens: 0, lastUsed: 0 };
        t.calls++;
        if (c.isError) t.errors++;
        t.tokens += c.resultTokens;
        if (c.ts > t.lastUsed) t.lastUsed = c.ts;
        s._tools.set(c.tool, t);
    }

    const servers: McpServerStat[] = [...byServer.values()].map(s => {
        const { _sessions, _projects, _tools, ...rest } = s;
        const v = verdictFor(s.server, s.configured, s.calls, s.errors, hours);
        return {
            ...rest, ...v,
            sessions: _sessions.size,
            projects: [..._projects].sort(),
            tools: [..._tools.values()].sort((a, b) => b.calls - a.calls),
        };
    }).sort((a, b) => b.calls - a.calls || a.server.localeCompare(b.server));

    const totals = {
        calls: all.length,
        errors: all.filter(c => c.isError).length,
        tokens: all.reduce((n, c) => n + c.resultTokens, 0),
        cost: all.reduce((n, c) => n + c.cost, 0),
        sessions: allSessions.size,
        servers: servers.filter(s => s.calls > 0).length,
    };
    return { win, since, hours, buckets: { unit, labels }, totals, servers, recent: all.slice(0, RECENT_CAP) };
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const raw = url.searchParams.get("win") ?? "today";
    const win: Win = (WINS as string[]).includes(raw) ? (raw as Win) : "today";
    const now = Date.now();
    if (cache && cache.win === win && now - cache.at < CACHE_TTL_MS) {
        return NextResponse.json(cache.data, CC);
    }
    let pending = inflight.get(win);
    if (!pending) {
        pending = computeMcpLog(win, now).then(data => { cache = { at: now, win, data }; return data; })
            .finally(() => inflight.delete(win));
        inflight.set(win, pending);
    }
    return NextResponse.json(await pending, CC);
}) as (req: Request) => Promise<Response>;
