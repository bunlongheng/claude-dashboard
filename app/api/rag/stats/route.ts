import { NextResponse } from "next/server";
import { getStats } from "@/lib/rag-search";
import { withErrorHandler } from "@/lib/api-handler";
export const dynamic = "force-dynamic";

// getStats runs ~20 SQLite aggregates + 10 live FTS benchmark searches. This route
// is hit on every page load (sidebar nav) and by Overview/RagSection, but the data
// barely moves between ingests. Short in-memory cache keeps navigation cheap.
const STATS_TTL_MS = 10_000;
let statsCache: { at: number; data: unknown } | null = null;

export const GET = withErrorHandler(async () => {
    const now = Date.now();
    if (statsCache && now - statsCache.at < STATS_TTL_MS) {
        return NextResponse.json(statsCache.data, { headers: { "Cache-Control": "public, max-age=10" } });
    }
    const data = getStats();
    statsCache = { at: now, data };
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=10" } });
});
