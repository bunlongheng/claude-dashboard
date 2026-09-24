import * as fs from "fs";
import { readLastBytes } from "@/lib/safe-read";
import * as path from "path";
import * as os from "os";
import { getModelRates } from "@/lib/pricing";
import type { Token } from "./shared";
import { readJevLog, aggregateJev, JEV_LOG_PATH, JEV_HOOK_PATH, type JevPayload } from "@/lib/jev-log";

const TIMEOUT_MS = 4000;

export function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number = TIMEOUT_MS): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
}

// ---- Local .jsonl token scanning ----
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const MAX_BYTES = 50 * 1024;


interface SessionAccum {
    session_id: string;
    project: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    prompt_count: number;
}

function parseSessionFile(filePath: string, project: string): SessionAccum {
    const sessionId = path.basename(filePath, ".jsonl");
    const accum: SessionAccum = {
        session_id: sessionId, project, model: "unknown",
        input_tokens: 0, output_tokens: 0,
        cache_read_tokens: 0, cache_creation_tokens: 0, prompt_count: 0,
    };
    const chunk = readLastBytes(filePath, MAX_BYTES);
    if (!chunk) return accum;
    const lines = chunk.split("\n");
    if (lines.length > 1 && !chunk.endsWith("\n")) lines.pop();
    for (const line of lines) {
        if (!line) continue;
        try {
            const d = JSON.parse(line);
            if (d.type === "summary" && d.summary?.usage) {
                const u = d.summary.usage;
                accum.input_tokens += u.input_tokens ?? 0;
                accum.output_tokens += u.output_tokens ?? 0;
                accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
                accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
                accum.prompt_count += 1;
                if (d.summary.model) accum.model = d.summary.model;
            } else if (d.type === "assistant" && d.message?.usage) {
                const u = d.message.usage;
                accum.input_tokens += u.input_tokens ?? 0;
                accum.output_tokens += u.output_tokens ?? 0;
                accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
                accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
                if (d.message.model) accum.model = d.message.model;
            }
        } catch {}
    }
    return accum;
}

// ---- Precise per-model usage breakdown (full-file scan) ----
// Mirrors the org billing columns: requests, prompt/completion tokens,
// uncached input, cache read, cache write 5m/1h, web search, net/gross USD.
// Pricing comes from the single source of truth in lib/pricing.ts.
export interface UsageRow {
    model: string;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    uncached_input: number;
    cache_read: number;
    cache_write_5m: number;
    cache_write_1h: number;
    web_search: number;
    net_usd: number;
    gross_usd: number;
}

type ModelDelta = { requests: number; inp: number; out: number; cr: number; cw5: number; cw1h: number; web: number };
// Per-file parse cache keyed by mtime: the 1.1 GB scan only re-reads files that changed.
const usageFileCache = new Map<string, { mtimeMs: number; deltas: Map<string, ModelDelta> }>();

interface JsonlUsageCacheCreation {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
}
interface JsonlMessageUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: JsonlUsageCacheCreation;
    server_tool_use?: { web_search_requests?: number };
}
interface JsonlMessage {
    model?: string;
    usage?: JsonlMessageUsage;
}
interface JsonlLine {
    message?: JsonlMessage;
}

function parseUsageFile(filePath: string): Map<string, ModelDelta> {
    const deltas = new Map<string, ModelDelta>();
    let content = "";
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { return deltas; }
    for (const line of content.split("\n")) {
        if (!line) continue;
        let d: JsonlLine | undefined;
        try { d = JSON.parse(line); } catch { continue; }
        const msg = d?.message;
        if (!msg) continue;
        const u = msg.usage;
        if (!u) continue;
        const model = msg.model || "unknown";
        if (model === "<synthetic>") continue;
        let a = deltas.get(model);
        if (!a) { a = { requests: 0, inp: 0, out: 0, cr: 0, cw5: 0, cw1h: 0, web: 0 }; deltas.set(model, a); }
        a.requests += 1;
        a.inp += u.input_tokens ?? 0;
        a.out += u.output_tokens ?? 0;
        a.cr  += u.cache_read_input_tokens ?? 0;
        const cc = u.cache_creation;
        if (cc) {
            a.cw5  += cc.ephemeral_5m_input_tokens ?? 0;
            a.cw1h += cc.ephemeral_1h_input_tokens ?? 0;
        } else {
            a.cw5 += u.cache_creation_input_tokens ?? 0;
        }
        a.web += u.server_tool_use?.web_search_requests ?? 0;
    }
    return deltas;
}

export async function fetchUsageBreakdown(): Promise<UsageRow[]> {
    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
    const agg = new Map<string, ModelDelta>();
    const jsonlFiles: string[] = [];
    const walk = (dir: string) => {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name.endsWith(".jsonl")) jsonlFiles.push(full);
        }
    };
    walk(CLAUDE_PROJECTS_DIR);
    for (const filePath of jsonlFiles) {
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(filePath).mtimeMs; } catch { continue; }
        let entry = usageFileCache.get(filePath);
        if (!entry || entry.mtimeMs !== mtimeMs) {
            entry = { mtimeMs, deltas: parseUsageFile(filePath) };
            usageFileCache.set(filePath, entry);
        }
        for (const [model, d] of entry.deltas) {
            let a = agg.get(model);
            if (!a) { a = { requests: 0, inp: 0, out: 0, cr: 0, cw5: 0, cw1h: 0, web: 0 }; agg.set(model, a); }
            a.requests += d.requests; a.inp += d.inp; a.out += d.out; a.cr += d.cr;
            a.cw5 += d.cw5; a.cw1h += d.cw1h; a.web += d.web;
        }
    }
    const rows: UsageRow[] = [];
    for (const [model, a] of agg) {
        const p = getModelRates(model);
        const net = (a.inp * p.input + a.out * p.output + a.cw5 * p.cache_write_5m + a.cw1h * p.cache_write_1h + a.cr * p.cache_read) / 1e6;
        const gross = ((a.inp + a.cr + a.cw5 + a.cw1h) * p.input + a.out * p.output) / 1e6;
        rows.push({
            model,
            requests: a.requests,
            prompt_tokens: a.inp + a.cr + a.cw5 + a.cw1h,
            completion_tokens: a.out,
            uncached_input: a.inp,
            cache_read: a.cr,
            cache_write_5m: a.cw5,
            cache_write_1h: a.cw1h,
            web_search: a.web,
            net_usd: net,
            gross_usd: gross,
        });
    }
    rows.sort((x, y) => y.net_usd - x.net_usd);
    return rows;
}

export async function fetchTokens(): Promise<Token[]> {
    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
    const hostname = os.hostname().split(".")[0];
    const results: Token[] = [];
    for (const folder of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
        const folderPath = path.join(CLAUDE_PROJECTS_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }
        const project = folder.replace(/-/g, "/");
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const accum = parseSessionFile(path.join(folderPath, file), project);
            if (accum.input_tokens + accum.output_tokens > 0) {
                results.push({ ...accum, machine: hostname });
            }
        }
    }
    return results;
}

// ---- Jev router log ----
// Read straight off disk (same process, no HTTP hop) so the /jev page has its
// first paint ready; the client then refetches /api/claude/jev on the toggles.
export async function fetchJev(days = 30): Promise<JevPayload> {
    const rows = readJevLog(days);
    const projects = [...new Set(rows.map(r => r.project).filter((p): p is string => !!p))].sort();
    return {
        ...aggregateJev(rows),
        days,
        project: null,
        projects,
        logPath: JEV_LOG_PATH,
        hookPath: JEV_HOOK_PATH,
    };
}

export function emptyJev(days = 30): JevPayload {
    return {
        ...aggregateJev([]),
        days,
        project: null,
        projects: [],
        logPath: JEV_LOG_PATH,
        hookPath: JEV_HOOK_PATH,
    };
}
