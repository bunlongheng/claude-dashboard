import { NextResponse } from "next/server";
import { PROJECTS_DIR } from "@/lib/jsonl-walk";
import * as fs from "fs";
import * as path from "path";
import { withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageRow = { name: string; count: number; pct: number; lastUsed: number };

interface SkillUsageData {
    hours: number;
    totalSkills: number;
    totalSubagents: number;
    skills: UsageRow[];
    subagents: UsageRow[];
}

// Built-in Claude Code slash commands - not skills, so keep them out of the
// "Skill Usage" panel (they arrive as <command-name> tags just like skills do).
const BUILTIN_COMMANDS = new Set([
    "exit", "quit", "clear", "compact", "config", "model", "resume", "help",
    "usage", "cost", "login", "logout", "doctor", "init", "review", "memory",
    "status", "agents", "vim", "bug", "ide", "permissions", "export", "add-dir",
    "hooks", "mcp", "terminal-setup", "release-notes", "pr-comments",
]);
const CACHE_TTL_MS = 30_000;
const MAX_WINDOW_MS = 720 * 3600_000; // 30d - the largest bounded window (7d/30d tabs)
const CC = { headers: { "Cache-Control": "public, max-age=30" } };
let cache: { at: number; key: string; data: SkillUsageData } | null = null;

// Skill/command invocations are sparse but spread through the ENTIRE session
// file, so a tail read undercounts (a /repo-audit early in a 180MB file is
// missed). We scan each file FULLY, but cache the extracted events keyed by
// mtime+size so an unchanged file is never re-read - only the live session file
// grows. Combined with skipping files untouched in the window, this keeps the
// count exact without re-reading ~900MB every request.
type Ev = { name: string; ts: number; sub: boolean };
const fileCache = new Map<string, { key: string; events: Ev[] }>();
const CMD_RE = /<command-name>\/([\w-]+)<\/command-name>/g;

async function extractEvents(fp: string): Promise<Ev[]> {
    let text: string;
    try { text = await fs.promises.readFile(fp, "utf8"); } catch { return []; }
    const evs: Ev[] = [];
    for (const line of text.split("\n")) {
        // Cheap pre-filter: only command messages and tool_use messages matter.
        if (!line || (!line.includes("command-name>") && !line.includes("tool_use"))) continue;
        let m: { timestamp?: string; message?: { content?: unknown } };
        try { m = JSON.parse(line); } catch { continue; }
        const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
        const content = m.message?.content;
        if (typeof content === "string") {
            CMD_RE.lastIndex = 0;
            let cm: RegExpExecArray | null;
            while ((cm = CMD_RE.exec(content)) !== null) {
                if (!BUILTIN_COMMANDS.has(cm[1])) evs.push({ name: cm[1], ts, sub: false });
            }
        } else if (Array.isArray(content)) {
            for (const c of content as Array<{ type?: string; name?: string; input?: { skill?: string; subagent_type?: string } }>) {
                if (c.type !== "tool_use" || !c.name) continue;
                if (c.name === "Skill") {
                    const skill = c.input?.skill;
                    if (typeof skill === "string" && skill) evs.push({ name: skill, ts, sub: false });
                } else if (c.name === "Agent") {
                    evs.push({ name: c.input?.subagent_type || "general-purpose", ts, sub: true });
                }
            }
        }
    }
    return evs;
}

function rank(counts: Map<string, { count: number; lastUsed: number }>): { rows: UsageRow[]; total: number } {
    const total = [...counts.values()].reduce((s, v) => s + v.count, 0);
    const rows = [...counts.entries()]
        .map(([name, v]) => ({ name, count: v.count, lastUsed: v.lastUsed, pct: total ? (v.count / total) * 100 : 0 }))
        .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
    return { rows, total };
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    // all=1 -> all-time (no window); else bounded to `hours` (7d/30d tabs).
    const allTime = url.searchParams.get("all") === "1";
    const hours = Math.min(Math.max(parseInt(url.searchParams.get("hours") || "168", 10), 1), 720);
    const now = Date.now();
    const winKey = allTime ? "all" : String(hours);
    if (cache && cache.key === winKey && now - cache.at < CACHE_TTL_MS) {
        return NextResponse.json(cache.data, CC);
    }

    const since = allTime ? 0 : now - hours * 3600_000;
    const skillCounts = new Map<string, { count: number; lastUsed: number }>();
    const subagentCounts = new Map<string, { count: number; lastUsed: number }>();

    if (!fs.existsSync(PROJECTS_DIR)) {
        const empty: SkillUsageData = { hours, totalSkills: 0, totalSubagents: 0, skills: [], subagents: [] };
        cache = { at: now, key: winKey, data: empty };
        return NextResponse.json(empty, CC);
    }

    const bump = (map: Map<string, { count: number; lastUsed: number }>, name: string, ts: number) => {
        const e = map.get(name);
        if (e) { e.count++; if (ts > e.lastUsed) e.lastUsed = ts; }
        else map.set(name, { count: 1, lastUsed: ts });
    };

    const oldest = allTime ? 0 : now - MAX_WINDOW_MS;
    for (const projectDir of fs.readdirSync(PROJECTS_DIR)) {
        const dir = path.join(PROJECTS_DIR, projectDir);
        let dstat;
        try { dstat = fs.statSync(dir); } catch { continue; }
        if (!dstat.isDirectory()) continue;
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith(".jsonl")) continue;
            const fp = path.join(dir, file);
            let st;
            try { st = fs.statSync(fp); } catch { continue; }
            // A file untouched in the whole window can only hold events older than
            // any possible `since`, so skip it (and never scan the 800+ old files).
            if (st.mtimeMs < oldest) continue;
            const key = `${st.mtimeMs}:${st.size}`;
            const cached = fileCache.get(fp);
            let events: Ev[];
            if (cached && cached.key === key) {
                events = cached.events;
            } else {
                events = await extractEvents(fp);
                fileCache.set(fp, { key, events });
            }
            for (const e of events) {
                if (e.ts && e.ts < since) continue;
                bump(e.sub ? subagentCounts : skillCounts, e.name, e.ts);
            }
        }
    }

    const skills = rank(skillCounts);
    const subagents = rank(subagentCounts);
    const data: SkillUsageData = {
        hours,
        totalSkills: skills.total,
        totalSubagents: subagents.total,
        skills: skills.rows,
        subagents: subagents.rows,
    };
    cache = { at: now, key: winKey, data };
    return NextResponse.json(data, CC);
}) as (req: Request) => Promise<Response>;
