import { PROJECTS_DIR, streamJsonl, diskCache } from "@/lib/jsonl-walk";
import { getModelRates } from "@/lib/pricing";
import { CLI_TOOLS } from "@/lib/cli-tools";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Shared engine behind /api/claude/mcp-log and /api/claude/cli-log. Both
// rebuild tool calls from the session transcripts, group them, bucket them
// into a calendar window and hand a verdict per group. The wire shape keeps
// the MCP names: `server` is the group (an MCP server, or a built-in tool
// such as Bash) and `tool` is what was called inside it (an MCP tool, or the
// built-in's target: the command binary, the subagent type, the file type).
export type Kind = "mcp" | "cli";

export interface ToolCall {
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

export interface ToolSubStat { tool: string; calls: number; errors: number; tokens: number; lastUsed: number }
export interface ToolGroupStat {
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
    tools: ToolSubStat[];
    series: number[]; // calls per bucket, aligned with ToolLogData.buckets.labels, oldest first
}

export type Win = "today" | "7d" | "30d" | "90d";
export interface ToolLogData {
    kind: Kind;
    win: Win;
    since: number;
    hours: number;
    buckets: { unit: "hour" | "day" | "month"; labels: string[] };
    totals: { calls: number; errors: number; tokens: number; cost: number; sessions: number; servers: number };
    servers: ToolGroupStat[];
    recent: ToolCall[];
}

export const WINS: Win[] = ["today", "7d", "30d", "90d"];
const MAX_HOURS = 2160; // 90d
const RECENT_CAP = 500;
// MCP calls are rare and worth a readable snippet; built-in calls number in
// the tens of thousands per quarter, so their per-file cache keeps less text.
const SNIPPET: Record<Kind, { input: number; result: number; prompt: number }> = {
    mcp: { input: 200, result: 200, prompt: 200 },
    cli: { input: 120, result: 60, prompt: 120 },
};
// Rough but honest: ~4 chars per token for JSON/English tool output.
const CHARS_PER_TOKEN = 4;
const CMD_RE = /<command-name>\/([\w:-]+)<\/command-name>/;
const ARGS_RE = /<command-args>([^<]*)<\/command-args>/;
const DAY_MS = 86_400_000;
const CLI_SET = new Set(CLI_TOOLS);

const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const ym = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}`; };

// Calendar buckets so the sparkline reads like a clock or a calendar: today by
// hour, 7d and 30d by day, 90d by month. All local time.
export function buildBuckets(win: Win, now: number): { since: number; unit: ToolLogData["buckets"]["unit"]; labels: string[]; indexOf: (ts: number) => number } {
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

type FileEntry = { key: string; calls: ToolCall[] };
// Unit fixtures must never overwrite the real data/*.json caches.
const disks: Record<Kind, ReturnType<typeof diskCache<FileEntry>>> | null = process.env.VITEST
    ? null
    : { mcp: diskCache<FileEntry>("mcp-log-cache"), cli: diskCache<FileEntry>("cli-log-cache") };
const fileCaches: Record<Kind, Map<string, FileEntry>> = { mcp: disks?.mcp.load() ?? new Map(), cli: disks?.cli.load() ?? new Map() };
// Live sessions change every request, and the cli cache runs to tens of MB,
// so the disk copy is refreshed at most every 5 minutes; a restart only
// re-parses the files touched since the last write.
const SAVE_EVERY_MS = 300_000;
const lastSave: Record<Kind, number> = { mcp: 0, cli: 0 };

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

function cleanPrompt(raw: string, max: number): string {
    const cmd = CMD_RE.exec(raw);
    if (cmd) {
        const args = ARGS_RE.exec(raw)?.[1]?.trim();
        return `/${cmd[1]}${args ? ` ${args}` : ""}`.slice(0, max);
    }
    const text = raw
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.slice(0, max);
}

function snippet(v: unknown, max: number): string {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
    return s.length > max ? `${s.slice(0, max)}...` : s;
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

// Binaries where the verb matters more than the binary: "git commit" and
// "git push" are different habits, "npm run" and "npm install" too.
const TWO_WORD = new Set(["git", "gh", "npm", "npx", "pnpm", "yarn", "node", "docker", "brew", "python3", "python", "cargo", "launchctl", "vercel"]);
const TARGET_MAX = 40;
// Shell words that never are the command: control flow, cd / source prefixes
// and the wrappers in front of the real binary.
const SKIP_SEG = /^(?:[.:]\s|(?:cd|source|export|nvm|set|unset|eval|done|fi|if|while|for|until|case|esac|function|local|return|exit|true)\b)/;
const WRAPPER_RE = /^(?:(?:sudo|time|exec|nohup|env|command|builtin|caffeinate)\s+(?:-\S*\s+)*)+/;

// Split a shell line on the operators between commands (&&, ||, |, ;, &,
// newline) without breaking inside quotes, so sed 's|a|b|' stays 1 word.
function splitShell(cmd: string): string[] {
    const segs: string[] = [];
    let cur = "";
    let q: string | null = null;
    for (let i = 0; i < cmd.length; i++) {
        const ch = cmd[i];
        if (q) {
            cur += ch;
            if (ch === q) q = null;
            else if (ch === "\\" && q === '"') cur += cmd[++i] ?? "";
            continue;
        }
        if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
        if (ch === "\\" && cmd[i + 1] === "\n") { i++; cur += " "; continue; } // line continuation
        if (ch === "\\") { cur += ch + (cmd[++i] ?? ""); continue; }
        if (ch === "\n" || ch === ";" || ch === "|" || ch === "&") { if (cur.trim()) segs.push(cur.trim()); cur = ""; continue; }
        cur += ch;
    }
    if (cur.trim()) segs.push(cur.trim());
    return segs;
}

// The binary (plus its verb for git / npm style tools) a Bash call ran.
export function firstCommand(cmd: string): string {
    const segs = splitShell(cmd)
        .map(s => s
            .replace(/^[\s({!]+/, "")
            // case patterns: "*) rm -rf x" is rm
            .replace(/^[^\s()]*\)\s*/, "")
            .replace(/^(?:(?:do|then|else|elif)\s+)+/, "")
            // VAR=$(cmd ...) and $(cmd ...): the command is inside the substitution
            .replace(/^(?:\w+="?)?\$\(\s*/, "")
            .replace(/^[\s(]+/, "")
            .replace(/^(?:\w+=(?:"[^"]*"|'[^']*'|[^\s"']*)\s+)+/, "")
            .replace(WRAPPER_RE, "") // sudo -n true, command -v gh, env X=1 cmd
            .trim())
        .filter(s => s && !/^[#[]/.test(s) && !/^[}\\]$/.test(s) && !/^\w+=(?:"[^"]*"|'[^']*'|[^\s"']*)$/.test(s));
    const seg = segs.find(s => !SKIP_SEG.test(s)) ?? segs[0] ?? "";
    const words = seg.split(/\s+/);
    const bin = (words[0] ?? "").replace(/^.*\//, "").replace(/^["']|["']$/g, "");
    if (!bin) return "-";
    const verb = words[1];
    return TWO_WORD.has(bin) && verb && /^[a-z]/i.test(verb) ? `${bin} ${verb}` : bin;
}

// What a built-in tool call was aimed at, so the drill-in answers "Bash did
// what?" rather than just counting Bash.
export function cliTarget(name: string, input: unknown): string {
    const i = (input ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : "");
    const cap = (s: string) => (s.length > TARGET_MAX ? `${s.slice(0, TARGET_MAX)}...` : s);
    switch (name) {
        case "Bash": return cap(firstCommand(str("command")));
        case "Agent": return str("subagent_type") || "general-purpose";
        case "Skill": return `/${str("skill") || "?"}`;
        case "Read": case "Edit": case "MultiEdit": case "Write": case "NotebookEdit": {
            const fp = str("file_path") || str("notebook_path");
            if (!fp) return "-";
            const ext = path.extname(fp);
            return ext ? ext.toLowerCase() : path.basename(fp);
        }
        case "Glob": case "Grep": return cap(str("pattern") || "-");
        case "WebFetch": { try { return new URL(str("url")).hostname; } catch { return "-"; } }
        case "WebSearch": case "ToolSearch": return cap(str("query") || "-");
        default: return "-";
    }
}

type Line = {
    type?: string;
    timestamp?: string;
    cwd?: string;
    sessionId?: string;
    gitBranch?: string;
    attributionSkill?: string;
    message?: { id?: string; role?: string; model?: string; content?: unknown; usage?: { output_tokens?: number } };
};

async function extractCalls(kind: Kind, fp: string, folder: string): Promise<ToolCall[]> {
    const calls: ToolCall[] = [];
    const pending = new Map<string, ToolCall>();
    const max = SNIPPET[kind];
    let lastPrompt = "";
    const wanted = (name: string) => (kind === "mcp" ? name.startsWith("mcp__") : !name.startsWith("mcp__"));
    const keep = (line: string) => {
        if (line.includes('"type":"tool_use"') && (kind === "cli" || line.includes('"name":"mcp__'))) return true;
        if (line.includes('"tool_use_id":"')) {
            for (const id of pending.keys()) if (line.includes(id)) return true;
            return false;
        }
        return line.includes('"type":"user"') && line.includes('"content":"');
    };
    // message id -> the call that carries its output tokens. A message is written
    // once per content block with the same usage object, and early copies hold a
    // streaming placeholder, so the first tool call owns the count and later
    // copies refresh it instead of adding to it.
    const owner = new Map<string, ToolCall>();
    await streamJsonl(fp, keep, (parsed) => {
        const m = parsed as Line;
        const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
        const content = m.message?.content;
        if (m.type === "user" && typeof content === "string") {
            const p = cleanPrompt(content, max.prompt);
            if (p) lastPrompt = p;
            return;
        }
        if (!Array.isArray(content)) return;
        const blocks = content as Array<{ type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean }>;
        if (m.type === "assistant") {
            for (const c of blocks) {
                if (c.type !== "tool_use" || !c.name || !c.id || !wanted(c.name)) continue;
                const project = m.cwd ? path.basename(m.cwd) : folder.replace(/^.*-Sites-/, "");
                const model = m.message?.model ?? "";
                const usageOut = m.message?.usage?.output_tokens ?? 0;
                const msgId = m.message?.id;
                let server: string, tool: string;
                if (kind === "mcp") {
                    const parts = c.name.split("__");
                    server = parts[1] ?? "?"; tool = parts.slice(2).join("__");
                } else {
                    server = c.name; tool = cliTarget(c.name, c.input);
                }
                const call: ToolCall = {
                    ts, server, tool,
                    project, sessionId: m.sessionId ?? path.basename(fp, ".jsonl"), model,
                    skill: m.attributionSkill ?? null, branch: m.gitBranch ?? null,
                    prompt: lastPrompt, input: snippet(c.input, max.input), result: "", resultChars: 0, resultTokens: 0,
                    outTokens: 0, isError: false, latencyMs: null, cost: 0,
                };
                const prev = msgId ? owner.get(msgId) : undefined;
                if (prev) prev.outTokens = usageOut;
                else { call.outTokens = usageOut; if (msgId) owner.set(msgId, call); }
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
            call.result = snippet(text, max.result);
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
    for (const c of calls) c.cost += (c.outTokens / 1_000_000) * getModelRates(c.model).output;
    return calls;
}

function verdictFor(kind: Kind, server: string, configured: boolean, calls: number, errors: number, hours: number): { verdict: Verdict; reason: string } {
    const n = (c: number) => `${c} call${c === 1 ? "" : "s"}`;
    if (kind === "mcp" && server.startsWith("claude_ai_")) return { verdict: "connector", reason: "claude.ai connector - lives on the claude.ai side, not in local config" };
    if (!configured) {
        return kind === "mcp"
            ? { verdict: "gone", reason: `no longer in ~/.claude.json but still had ${n(calls)} in the window - a skill probably still references it` }
            : { verdict: "gone", reason: `not in the built-in list yet, ${n(calls)} in the window - a newer harness tool, add it to lib/cli-tools.ts` };
    }
    if (calls === 0) {
        if (hours < 168) return { verdict: "idle", reason: "no calls in this window - widen to 30d or 90d before judging it" };
        return kind === "mcp"
            ? { verdict: "idle", reason: "registered, 0 calls - its tool schema is still loaded into every session for nothing" }
            : { verdict: "idle", reason: "built in, 0 calls - this workflow never reaches for it" };
    }
    if (calls >= 4 && errors / calls >= 0.25) return { verdict: "flaky", reason: `${errors} of ${calls} calls errored` };
    const perMonth = calls / Math.max(hours / 720, 1 / 30);
    if (perMonth < 5) {
        return kind === "mcp"
            ? { verdict: "low", reason: `about ${Math.round(perMonth * 10) / 10} calls a month - a skill with curl would do the same at 0 RAM` }
            : { verdict: "low", reason: `about ${Math.round(perMonth * 10) / 10} calls a month` };
    }
    return { verdict: "keep", reason: "used regularly" };
}

// Every transcript this machine holds: the session files per project folder
// plus the subagent transcripts nested under <session>/subagents/.
function* transcriptFiles(): Generator<{ fp: string; folder: string }> {
    for (const folder of fs.readdirSync(PROJECTS_DIR)) {
        const dir = path.join(PROJECTS_DIR, folder);
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (e.isFile() && e.name.endsWith(".jsonl")) yield { fp: path.join(dir, e.name), folder };
            if (!e.isDirectory()) continue;
            const sub = path.join(dir, e.name, "subagents");
            let subs: string[];
            try { subs = fs.readdirSync(sub); } catch { continue; }
            for (const f of subs) if (f.endsWith(".jsonl")) yield { fp: path.join(sub, f), folder };
        }
    }
}

export async function computeToolLog(kind: Kind, win: Win, now: number): Promise<ToolLogData> {
    const { since, unit, labels, indexOf } = buildBuckets(win, now);
    const hours = Math.max(1, (now - since) / 3600_000);
    const configured = kind === "mcp" ? configuredServers() : CLI_SET;
    const all: ToolCall[] = [];
    const fileCache = fileCaches[kind];

    if (fs.existsSync(PROJECTS_DIR)) {
        const seen = new Map<string, FileEntry>();
        let dirty = false;
        for (const { fp, folder } of transcriptFiles()) {
            let st;
            try { st = fs.statSync(fp); } catch { continue; }
            // Keep the per-file cache warm for the largest window so a tab
            // switch (7d -> 90d) never re-streams a file already parsed.
            if (st.mtimeMs < now - MAX_HOURS * 3600_000) continue;
            const key = `${st.mtimeMs}:${st.size}`;
            let entry = fileCache.get(fp);
            if (!entry || entry.key !== key) {
                entry = { key, calls: await extractCalls(kind, fp, folder) };
                fileCache.set(fp, entry);
                dirty = true;
            }
            seen.set(fp, entry);
            for (const c of entry.calls) if (c.ts >= since) all.push(c);
        }
        if (dirty && disks && now - lastSave[kind] >= SAVE_EVERY_MS) { disks[kind].save(seen); lastSave[kind] = now; }
    }

    all.sort((a, b) => b.ts - a.ts);
    const byServer = new Map<string, ToolGroupStat & { _sessions: Set<string>; _projects: Set<string>; _tools: Map<string, ToolSubStat> }>();
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

    const servers: ToolGroupStat[] = [...byServer.values()].map(s => {
        const { _sessions, _projects, _tools, ...rest } = s;
        const v = verdictFor(kind, s.server, s.configured, s.calls, s.errors, hours);
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
    return { kind, win, since, hours, buckets: { unit, labels }, totals, servers, recent: all.slice(0, RECENT_CAP) };
}

// 30 s memo + request coalescing per (kind, window) so a page with 2 panels
// and a 5 min refetch never scans twice.
const CACHE_TTL_MS = 30_000;
const memo = new Map<string, { at: number; data: ToolLogData }>();
const inflight = new Map<string, Promise<ToolLogData>>();

export function parseWin(raw: string | null): Win {
    return (WINS as string[]).includes(raw ?? "") ? (raw as Win) : "today";
}

export async function cachedToolLog(kind: Kind, win: Win): Promise<ToolLogData> {
    const key = `${kind}:${win}`;
    const now = Date.now();
    const hit = memo.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) return hit.data;
    let pending = inflight.get(key);
    if (!pending) {
        pending = computeToolLog(kind, win, now).then(data => { memo.set(key, { at: now, data }); return data; })
            .finally(() => inflight.delete(key));
        inflight.set(key, pending);
    }
    return pending;
}
