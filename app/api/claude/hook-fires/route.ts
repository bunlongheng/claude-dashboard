import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hooks are the one extension class that leaves a usage trail: every hook that
// logs writes 1 JSON line per fire. Counting the lines inside the window gives
// the Extensions hero card a real "used in this range" number instead of an
// inventory count. A hook with no log simply contributes 0.
const LOGS = path.join(os.homedir(), ".claude", "logs");
const SOURCES = [
    { file: "jev.jsonl", hook: "UserPromptSubmit" },
    { file: "heavy-gate.jsonl", hook: "PreToolUse" },
];
const CACHE_TTL_MS = 30_000;
const CC = { headers: { "Cache-Control": "public, max-age=30" } };
let cache: { at: number; hours: number; today: boolean; data: unknown } | null = null;

// Rows are appended in time order, so walk from the end and stop at the first
// one older than the window instead of parsing the whole file.
function countSince(file: string, since: number): number {
    let text: string;
    try { text = fs.readFileSync(path.join(LOGS, file), "utf8"); } catch { return 0; }
    const lines = text.split("\n");
    let n = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        let ts: number;
        try { ts = Date.parse((JSON.parse(line) as { ts?: string }).ts ?? ""); } catch { continue; }
        if (!ts) continue;
        if (ts < since) break;
        n++;
    }
    return n;
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const now = Date.now();
    // today=1 -> since local midnight, like skill-usage; else a rolling window in hours.
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const today = url.searchParams.get("today") === "1";
    const hours = today ? Math.max(1, Math.ceil((now - midnight.getTime()) / 3600_000)) : Math.min(Math.max(parseInt(url.searchParams.get("hours") || "24", 10) || 24, 1), 8760);
    if (cache && cache.hours === hours && cache.today === today && now - cache.at < CACHE_TTL_MS) return NextResponse.json(cache.data, CC);
    const since = today ? midnight.getTime() : now - hours * 3600_000;
    const hooks = SOURCES.map(s => ({ hook: s.hook, source: s.file, fires: countSince(s.file, since) }));
    const data = { hours, fires: hooks.reduce((sum, h) => sum + h.fires, 0), hooks };
    cache = { at: now, hours, today, data };
    return NextResponse.json(data, CC);
}) as (req: Request) => Promise<Response>;
