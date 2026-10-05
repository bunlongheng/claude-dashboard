import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { PROJECTS_DIR, streamJsonl, diskCache } from "@/lib/jsonl-walk";
import { getModelRates } from "@/lib/pricing";

// Trustworthy token accounting, built from the full transcripts. Verified
// against `ccusage daily/weekly/monthly --json` (Claude rows): every day matches
// exactly. The rules that make it match:
//  - every assistant line is deduped by message.id ACROSS files, keeping the
//    copy with the most output tokens: Claude Code writes the same message
//    several times (one per content block, early copies are streaming
//    placeholders), subagent transcripts start with a copy of the parent's
//    launch message, and a forked/resumed session copies its history into a
//    new session file
//  - every .jsonl under a project folder is read, however deep
//    (<session>/subagents/agent-*.jsonl, .../subagents/workflows/wf_*/agent-*.jsonl),
//    subagent files are attributed to their parent session, tagged role "agent"
//  - cache writes fall back to the ephemeral 5m + 1h buckets when the flat
//    cache_creation_input_tokens field is 0 (1h-cache turns report it that way)
//  - "today" means since local midnight, not a rolling 24h
//  - whole files are streamed, never a 50 KB tail

export type Since = "today" | "7d" | "30d" | "all";
export type Role = "main" | "agent";
export interface Tok { input: number; output: number; cacheRead: number; cacheCreate: number; turns: number }
export interface WhoRow extends Tok { model: string; role: Role; cost: number; share: number }
export interface ProjectRow extends Tok { project: string; cost: number; sessions: number }
export interface SessionRow extends Tok { sessionId: string; project: string; branch: string; title: string; firstTs: number; lastTs: number; active: boolean; models: string[]; agents: number; agentOutput: number; cost: number }
export interface DayRow extends Tok { day: string; sessions: number; cost: number }
export interface PeriodRow extends Tok { period: string; sessions: number; cost: number }
export interface TokensData {
    since: Since;
    from: number;
    generatedAt: number;
    totals: Tok & { cost: number; sessions: number; agents: number; mainOutput: number; agentOutput: number };
    who: WhoRow[];
    projects: ProjectRow[];
    sessions: SessionRow[];
    daily: DayRow[];
    weekly: PeriodRow[];  // period = the Monday the week starts on
    monthly: PeriodRow[]; // period = YYYY-MM
    scannedFiles: number;
}

interface FileEntry {
    key: string;
    sessionId: string;
    role: Role;
    project: string;
    branch: string;
    title: string;
    firstTs: number;
    lastTs: number;
    msgs: Record<string, MsgRec>; // message id -> [local day, model, input, output, cacheRead, cacheCreate]
}
type MsgRec = [string, string, number, number, number, number];

const DAY_MS = 86_400_000;
const ACTIVE_MS = 5 * 60_000;
const TTL_MS = 30_000;
const TITLE_MAX = 90;
const SINCES: Since[] = ["today", "7d", "30d", "all"];

const disk = diskCache<FileEntry>("tokens-cache");
const fileCache = disk.load();
const memo = new Map<Since, { at: number; data: TokensData }>();
const inflight = new Map<Since, Promise<TokensData>>();

const zero = (): Tok => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0, turns: 0 });
const add = (a: Tok, b: Tok) => { a.input += b.input; a.output += b.output; a.cacheRead += b.cacheRead; a.cacheCreate += b.cacheCreate; a.turns += b.turns; };
const costOf = (model: string, t: Tok) => {
    const r = getModelRates(model);
    return (t.input * r.input + t.output * r.output + t.cacheRead * r.cache_read + t.cacheCreate * r.cache_write_5m) / 1_000_000;
};
function ymd(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Local calendar day -> the Monday that starts its week, as YYYY-MM-DD.
function weekOf(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return ymd(dt.getTime());
}
function midnight(ms: number): number { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function windowStart(since: Since, now: number): number {
    if (since === "today") return midnight(now);
    if (since === "7d") return midnight(now - 6 * DAY_MS);
    if (since === "30d") return midnight(now - 29 * DAY_MS);
    return 0;
}
function cleanTitle(raw: string): string {
    const cmd = /<command-name>\/?([^<]+)<\/command-name>/.exec(raw);
    if (cmd) {
        const args = /<command-args>([^<]*)<\/command-args>/.exec(raw)?.[1]?.trim();
        return `/${cmd[1].trim()}${args ? ` ${args}` : ""}`.slice(0, TITLE_MAX);
    }
    return raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

type Line = {
    type?: string; timestamp?: string; sessionId?: string; agentId?: string; isSidechain?: boolean; cwd?: string; gitBranch?: string;
    message?: { id?: string; model?: string; role?: string; content?: unknown; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } } };
};

async function parseFile(fp: string, fallbackSession: string, roleHint: Role, key: string): Promise<FileEntry> {
    const e: FileEntry = { key, sessionId: fallbackSession, role: roleHint, project: "", branch: "", title: "", firstTs: 0, lastTs: 0, msgs: {} };
    let needTitle = true;
    let anon = 0;
    await streamJsonl(fp, line => line.includes('"usage"') || (needTitle && line.includes('"type":"user"')), (parsed) => {
        const d = parsed as Line;
        if (d.sessionId) e.sessionId = d.sessionId;
        if (d.agentId || d.isSidechain) e.role = "agent";
        if (!e.project && d.cwd) e.project = path.basename(d.cwd);
        if (!e.branch && d.gitBranch) e.branch = d.gitBranch;
        if (needTitle && d.type === "user" && typeof d.message?.content === "string") {
            const t = cleanTitle(d.message.content);
            if (t) { e.title = t; needTitle = false; }
        }
        const u = d.message?.usage;
        if (d.type !== "assistant" || !u) return;
        const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
        if (!Number.isFinite(ts)) return;
        const cacheCreate = Math.max(u.cache_creation_input_tokens ?? 0, (u.cache_creation?.ephemeral_5m_input_tokens ?? 0) + (u.cache_creation?.ephemeral_1h_input_tokens ?? 0));
        const rec: MsgRec = [ymd(ts), d.message?.model ?? "unknown", u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, cacheCreate];
        const id = d.message?.id ?? `${ts}:${anon++}`;
        const cur = e.msgs[id];
        if (!cur || rec[3] >= cur[3]) e.msgs[id] = rec;
        if (!e.firstTs || ts < e.firstTs) e.firstTs = ts;
        if (ts > e.lastTs) e.lastTs = ts;
    });
    return e;
}
// Copies of one message share input/cache counts; only output grows as the
// stream completes, so the copy with the most output is the final one. Ties
// (a forked session's copied history) stay with the file seen first.
const better = (a: MsgRec, b: MsgRec | undefined) => !b || a[3] > b[3];
const toTok = (r: MsgRec): Tok => ({ input: r[2], output: r[3], cacheRead: r[4], cacheCreate: r[5], turns: 1 });

// Every transcript touched since `from`: main sessions plus their subagents.
async function scan(from: number): Promise<{ entries: FileEntry[]; scanned: number }> {
    const entries: FileEntry[] = [];
    let scanned = 0;
    const visit = async (fp: string, fallbackSession: string, roleHint: Role) => {
        let st: fs.Stats;
        try { st = fs.statSync(fp); } catch { return; }
        if (st.mtimeMs < from) return;
        const key = `${st.mtimeMs}:${st.size}`;
        let entry = fileCache.get(fp);
        if (!entry || entry.key !== key || !entry.msgs) {
            entry = await parseFile(fp, fallbackSession, roleHint, key);
            fileCache.set(fp, entry);
            scanned++;
        }
        if (entry.lastTs) entries.push(entry);
    };
    // <project>/<session>.jsonl is a main transcript; anything deeper
    // (<session>/subagents/**.jsonl) belongs to that session as an agent.
    const walk = async (dir: string, session: string) => {
        let names: fs.Dirent[] = [];
        try { names = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return; }
        for (const n of names) {
            const fp = path.join(dir, n.name);
            if (n.isDirectory()) await walk(fp, session || n.name);
            else if (n.name.endsWith(".jsonl")) await visit(fp, session || n.name.slice(0, -6), (session || n.name.startsWith("agent-")) ? "agent" : "main");
        }
    };
    let folders: string[] = [];
    try { folders = fs.readdirSync(PROJECTS_DIR); } catch { return { entries, scanned }; }
    for (const folder of folders) await walk(path.join(PROJECTS_DIR, folder), "");
    if (scanned) disk.save(fileCache);
    return { entries, scanned };
}

export async function computeTokens(since: Since, now = Date.now()): Promise<TokensData> {
    const from = windowStart(since, now);
    const fromDay = from ? ymd(from) : "";
    const { entries, scanned } = await scan(from);

    const who = new Map<string, WhoRow>();
    const projects = new Map<string, ProjectRow & { ids: Set<string> }>();
    const sessions = new Map<string, SessionRow & { modelSet: Set<string> }>();
    const daily = new Map<string, DayRow & { ids: Set<string> }>();
    const totals: TokensData["totals"] = { ...zero(), cost: 0, sessions: 0, agents: 0, mainOutput: 0, agentOutput: 0 };

    // Global dedupe: one owner per message id across every file, then the
    // owner's records grouped by local day and model.
    const owner = new Map<string, { e: FileEntry; rec: MsgRec }>();
    for (const e of entries) for (const [id, rec] of Object.entries(e.msgs)) { if (better(rec, owner.get(id)?.rec)) owner.set(id, { e, rec }); }
    const daysOf = new Map<FileEntry, Record<string, Record<string, Tok>>>();
    for (const { e, rec } of owner.values()) {
        const days = daysOf.get(e) ?? {};
        add((days[rec[0]] ??= {})[rec[1]] ??= zero(), toTok(rec));
        daysOf.set(e, days);
    }

    for (const e of entries) {
        let used = false;
        for (const [day, byModel] of Object.entries(daysOf.get(e) ?? {})) {
            if (day < fromDay) continue;
            for (const [model, tok] of Object.entries(byModel)) {
                used = true;
                const cost = costOf(model, tok);
                add(totals, tok); totals.cost += cost;
                if (e.role === "agent") totals.agentOutput += tok.output; else totals.mainOutput += tok.output;

                const wk = `${model}|${e.role}`;
                const w = who.get(wk) ?? { ...zero(), model, role: e.role, cost: 0, share: 0 };
                add(w, tok); w.cost += cost; who.set(wk, w);

                const pk = e.project || "unknown";
                const p = projects.get(pk) ?? { ...zero(), project: pk, cost: 0, sessions: 0, ids: new Set() };
                add(p, tok); p.cost += cost; p.ids.add(e.sessionId); projects.set(pk, p);

                const s = sessions.get(e.sessionId) ?? { ...zero(), sessionId: e.sessionId, project: pk, branch: e.branch, title: "", firstTs: e.firstTs, lastTs: e.lastTs, active: false, models: [], agents: 0, agentOutput: 0, cost: 0, modelSet: new Set() };
                add(s, tok); s.cost += cost; s.modelSet.add(model);
                if (e.role === "agent") s.agentOutput += tok.output;
                sessions.set(e.sessionId, s);

                const dr = daily.get(day) ?? { ...zero(), day, sessions: 0, cost: 0, ids: new Set() };
                add(dr, tok); dr.cost += cost; dr.ids.add(e.sessionId); daily.set(day, dr);
            }
        }
        if (!used) continue;
        const s = sessions.get(e.sessionId)!;
        if (e.role === "agent") { s.agents++; totals.agents++; }
        else { s.title = e.title; s.project = e.project || s.project; s.branch = e.branch; s.firstTs = e.firstTs; }
        if (e.lastTs > s.lastTs) s.lastTs = e.lastTs;
        if (e.firstTs && (!s.firstTs || e.firstTs < s.firstTs)) s.firstTs = e.firstTs;
    }

    const sessionRows = [...sessions.values()].map(({ modelSet, ...s }) => ({ ...s, models: [...modelSet].sort(), active: s.lastTs > now - ACTIVE_MS, title: s.title || "(subagent transcript only)" }))
        .sort((a, b) => b.lastTs - a.lastTs);
    totals.sessions = sessionRows.length;
    const whoRows = [...who.values()].map(w => ({ ...w, share: totals.output ? w.output / totals.output : 0 })).sort((a, b) => b.output - a.output);
    const projectRows = [...projects.values()].map(({ ids, ...p }) => ({ ...p, sessions: ids.size })).sort((a, b) => b.output - a.output);
    const dailyRows = [...daily.values()].map(({ ids, ...d }) => ({ ...d, sessions: ids.size })).sort((a, b) => a.day.localeCompare(b.day));
    // Weeks and months are sums of the same deduped days, so the 3 views always agree.
    const roll = (keyOf: (day: string) => string): PeriodRow[] => {
        const m = new Map<string, PeriodRow & { ids: Set<string> }>();
        for (const d of daily.values()) {
            const k = keyOf(d.day);
            const r = m.get(k) ?? { ...zero(), period: k, sessions: 0, cost: 0, ids: new Set() };
            add(r, d); r.cost += d.cost; for (const id of d.ids) r.ids.add(id); m.set(k, r);
        }
        return [...m.values()].map(({ ids, ...r }) => ({ ...r, sessions: ids.size })).sort((a, b) => a.period.localeCompare(b.period));
    };

    return { since, from, generatedAt: now, totals, who: whoRows, projects: projectRows, sessions: sessionRows, daily: dailyRows, weekly: roll(weekOf), monthly: roll(day => day.slice(0, 7)), scannedFiles: scanned };
}

export const GET = withErrorHandler(async (req: Request) => {
    const raw = new URL(req.url).searchParams.get("since") ?? "today";
    const since: Since = (SINCES as string[]).includes(raw) ? (raw as Since) : "today";
    const hit = memo.get(since);
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.data);
    let p = inflight.get(since);
    if (!p) {
        p = computeTokens(since).finally(() => inflight.delete(since));
        inflight.set(since, p);
    }
    const data = await p;
    memo.set(since, { at: Date.now(), data });
    return NextResponse.json(data);
});
