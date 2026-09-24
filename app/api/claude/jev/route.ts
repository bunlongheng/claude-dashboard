import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { readJevLog, aggregateJev, JEV_LOG_PATH, JEV_HOOK_PATH, type JevAggregate } from "@/lib/jev-log";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
const CC = { headers: { "Cache-Control": "public, max-age=30" } };

interface JevPayload extends JevAggregate {
    days: number;
    project: string | null;
    projects: string[];
    logPath: string;
    hookPath: string;
}

// Cached per (days, project) pair - the day toggle and the project filter each
// re-fetch, and re-reading a 5 MB tail on every toggle click is wasteful.
const cache = new Map<string, { at: number; data: JevPayload }>();

function clampDays(raw: string | null): number {
    const n = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(n)) return 30;
    return Math.min(365, Math.max(1, n));
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const days = clampDays(url.searchParams.get("days"));
    const project = url.searchParams.get("project") || null;
    const key = `${days}:${project ?? "*"}`;

    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
        return NextResponse.json(hit.data, CC);
    }

    // A missing log file is the normal state before the hook has ever fired, so
    // readJevLog returns [] and the aggregate comes back as the "never" shape.
    // That is a 200 with empty data, never a 500.
    const rows = readJevLog(days);
    const filtered = project ? rows.filter(r => r.project === project) : rows;
    // Built from the unfiltered rows so the picker keeps listing every project
    // once one of them is selected.
    const projects = [...new Set(rows.map(r => r.project).filter((p): p is string => !!p))].sort();

    const data: JevPayload = {
        ...aggregateJev(filtered, now),
        days,
        project,
        projects,
        logPath: JEV_LOG_PATH,
        hookPath: JEV_HOOK_PATH,
    };
    cache.set(key, { at: now, data });
    return NextResponse.json(data, CC);
});
