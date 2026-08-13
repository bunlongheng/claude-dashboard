import { NextResponse } from "next/server";
import { readLastBytes } from "@/lib/safe-read";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const MAX_BYTES = 100 * 1024; // 100KB tail for older files
// Recent (last 7d) files feed the punchcard. The last-7d turns live at the tail of
// the chronological log, so a bounded tail covers them without parsing multi-MB
// (sometimes 100MB+) session files in full. 4MB ~= tens of thousands of recent turns.
const RECENT_MAX_BYTES = 4 * 1024 * 1024;
const CACHE_TTL_MS = 5_000; // matches the max-age=5 sync window below
const DAY_MS = 86400_000;

// Local-time YYYY-MM-DD (not toISOString which is UTC). Keeps day buckets and the
// per-day hour grid in the same wall-clock frame so "Thursday 8pm" means local 8pm.
function localYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DayBucket {
    day: string;
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    turns: number;
    sessions: number;
}

interface ModelBucket {
    model: string;
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    turns: number;
}

interface Totals {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    turns: number;
}

// Per-file parsed aggregate. Cached and reused until the file's (size, mtime)
// changes, so a 5s poll only re-parses the one or two sessions that grew instead
// of re-reading a 4MB tail of every recent file every tick.
interface FileAgg {
    days: Map<string, Totals>;      // local day -> token/turn totals for this session
    models: Map<string, Totals>;    // model -> totals
    tools: Map<string, number>;     // tool name -> call count
    dayHour: Map<string, number[]>; // local day -> per-local-hour turn counts (ALL days; windowed at merge)
    sessionDays: Set<string>;       // days this session had usage entries (for daily.sessions)
    hasTokens: boolean;             // any turn with input+output > 0 (for totalSessions)
}

const fileCache = new Map<string, { size: number; mtime: number; agg: FileAgg }>();
let responseCache: { at: number; data: unknown } | null = null;


function emptyTotals(): Totals {
    return { input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
}

// Parse one session file into its own aggregate. dayHour is stored for ALL days
// (no time window) so the 7d punchcard window can be re-applied cheaply at merge
// time without re-reading the file as the window slides.
function parseFile(filePath: string, isRecent: boolean): FileAgg {
    const agg: FileAgg = { days: new Map(), models: new Map(), tools: new Map(), dayHour: new Map(), sessionDays: new Set(), hasTokens: false };
    const content = readLastBytes(filePath, isRecent ? RECENT_MAX_BYTES : MAX_BYTES);
    if (!content) return agg;

    const lines = content.split("\n");
    // Drop first line if we started mid-line (offset > 0)
    if (lines.length > 1) lines.shift();

    for (const line of lines) {
        if (!line) continue;
        try {
            const d = JSON.parse(line);
            const ts = d.timestamp as string | undefined;
            const tsDate = ts ? new Date(ts) : null;
            const day = tsDate && !isNaN(tsDate.getTime()) ? localYMD(tsDate) : null;

            // Tool calls
            if (d.type === "assistant" && d.message?.content) {
                for (const block of d.message.content) {
                    if (block.type === "tool_use" && block.name) {
                        agg.tools.set(block.name, (agg.tools.get(block.name) ?? 0) + 1);
                    }
                }
            }

            // Usage
            let usage: Record<string, number> | null = null;
            let model: string | undefined;
            if (d.type === "summary" && d.summary?.usage) {
                usage = d.summary.usage;
                model = d.summary.model;
            } else if (d.type === "assistant" && d.message?.usage) {
                usage = d.message.usage;
                model = d.message.model;
            }

            if (usage && day) {
                const input = usage.input_tokens ?? 0;
                const output = usage.output_tokens ?? 0;
                const cacheRead = usage.cache_read_input_tokens ?? 0;
                const cacheCreate = usage.cache_creation_input_tokens ?? 0;
                if (input + output > 0) agg.hasTokens = true;

                const bucket = agg.days.get(day) ?? emptyTotals();
                bucket.input += input;
                bucket.output += output;
                bucket.cache_read += cacheRead;
                bucket.cache_creation += cacheCreate;
                bucket.turns += 1;
                agg.days.set(day, bucket);

                agg.sessionDays.add(day);

                const modelKey = model ?? "unknown";
                const mb = agg.models.get(modelKey) ?? emptyTotals();
                mb.input += input;
                mb.output += output;
                mb.cache_read += cacheRead;
                mb.cache_creation += cacheCreate;
                mb.turns += 1;
                agg.models.set(modelKey, mb);

                const hr = tsDate!.getHours(); // local hour-of-day (matches local `day`)
                if (hr >= 0 && hr < 24) {
                    let arr = agg.dayHour.get(day);
                    if (!arr) { arr = new Array(24).fill(0); agg.dayHour.set(day, arr); }
                    arr[hr] += 1;
                }
            }
        } catch { /* skip malformed line */ }
    }
    return agg;
}

export const GET = withErrorHandler(async () => {
    if (!fs.existsSync(CLAUDE_DIR)) {
        return NextResponse.json({ daily: [], byModel: [], tools: [], totalTurns: 0, totalSessions: 0, byDayHour: {} }, {
            headers: { "Cache-Control": "public, max-age=30" },
        });
    }

    const now = Date.now();
    if (responseCache && now - responseCache.at < CACHE_TTL_MS) {
        return NextResponse.json(responseCache.data, { headers: { "Cache-Control": "public, max-age=5" } });
    }

    const recentCutoff = now - 7 * DAY_MS;
    const cutoffDay = localYMD(new Date(recentCutoff)); // day-granularity window for the punchcard grid
    const currentUser = os.userInfo().username;
    const seen = new Set<string>();

    // Refresh the per-file cache: only (re)parse files whose size/mtime changed.
    for (const folder of fs.readdirSync(CLAUDE_DIR)) {
        const hasUser = folder.includes(`-${currentUser}-`) || folder.endsWith(`-${currentUser}`);
        if (!hasUser) continue;

        const folderPath = path.join(CLAUDE_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }

        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const filePath = path.join(folderPath, file);
            seen.add(filePath);
            let size = 0, mtime = 0;
            try { const st = fs.statSync(filePath); size = st.size; mtime = st.mtimeMs; } catch { continue; }
            const cached = fileCache.get(filePath);
            if (!cached || cached.size !== size || cached.mtime !== mtime) {
                fileCache.set(filePath, { size, mtime, agg: parseFile(filePath, mtime >= recentCutoff) });
            }
        }
    }
    // Drop cache entries for files that no longer exist.
    for (const key of [...fileCache.keys()]) if (!seen.has(key)) fileCache.delete(key);

    // Merge all cached per-file aggregates.
    const dailyMap = new Map<string, DayBucket>();
    const modelMap = new Map<string, ModelBucket>();
    const toolMap = new Map<string, number>();
    const dayHourMap = new Map<string, number[]>();
    let totalTurns = 0;
    let totalSessions = 0;

    for (const { agg } of fileCache.values()) {
        for (const [day, b] of agg.days) {
            const bucket = dailyMap.get(day) ?? { day, input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0, sessions: 0 };
            bucket.input += b.input;
            bucket.output += b.output;
            bucket.cache_read += b.cache_read;
            bucket.cache_creation += b.cache_creation;
            bucket.turns += b.turns;
            dailyMap.set(day, bucket);
            totalTurns += b.turns;
        }
        for (const [model, m] of agg.models) {
            const mb = modelMap.get(model) ?? { model, input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
            mb.input += m.input;
            mb.output += m.output;
            mb.cache_read += m.cache_read;
            mb.cache_creation += m.cache_creation;
            mb.turns += m.turns;
            modelMap.set(model, mb);
        }
        for (const [tool, c] of agg.tools) toolMap.set(tool, (toolMap.get(tool) ?? 0) + c);

        if (agg.hasTokens) totalSessions += 1;
        for (const day of agg.sessionDays) {
            const bucket = dailyMap.get(day);
            if (bucket) bucket.sessions += 1;
        }

        for (const [day, arr] of agg.dayHour) {
            if (day < cutoffDay) continue; // keep only the last ~7 local days in the grid
            let out = dayHourMap.get(day);
            if (!out) { out = new Array(24).fill(0); dayHourMap.set(day, out); }
            for (let h = 0; h < 24; h++) out[h] += arr[h];
        }
    }

    const daily = [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    const byModel = [...modelMap.values()].sort((a, b) => (b.input + b.output) - (a.input + a.output));
    const tools = [...toolMap.entries()]
        .map(([tool, calls]) => ({ tool, calls }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 15);

    const byDayHour = Object.fromEntries(dayHourMap); // { "2026-05-28": number[24], ... }
    const payload = { daily, byModel, tools, totalTurns, totalSessions, byDayHour };
    responseCache = { at: now, data: payload };
    return NextResponse.json(payload, {
        // Short cache so the punchcard stays in sync with /api/claude/turns-by-hour (which is no-store).
        headers: { "Cache-Control": "public, max-age=5" },
    });
}) as (req?: Request) => Promise<Response>;
