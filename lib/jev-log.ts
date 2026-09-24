import * as path from "path";
import * as os from "os";
import { readLastBytes } from "./safe-read";

// Reads the Jev router log - one JSON object per user prompt, appended by
// ~/.claude/hooks/jev-router.sh (a UserPromptSubmit hook). The file is
// append-only and grows forever, so only the tail is ever read and any line
// that does not parse (a truncated final write, a partial flush) is dropped.

export const JEV_LOG_PATH = path.join(os.homedir(), ".claude", "logs", "jev.jsonl");
export const JEV_HOOK_PATH = path.join(os.homedir(), ".claude", "hooks", "jev-router.sh");

// Per-call price of the routing model. The router is deliberately cheap - the
// whole point of the ladder is that deciding costs ~nothing next to the model
// it picks - so the number is small on purpose.
export const JEV_COST_PER_CALL = 0.00002;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB tail
const RECENT_LIMIT = 200;
const LIVE_MS = 15 * 60 * 1000;

export const JEV_TIERS = ["haiku", "sonnet", "opus", "fable"] as const;
export type JevTier = (typeof JEV_TIERS)[number];
export type JevStatus = "routed" | "skipped" | "error";
export type JevHealth = "live" | "stale" | "never";

export interface JevRow {
    ts: string;
    session_id?: string;
    project?: string;
    source?: string;
    model?: string;
    http?: string;
    latency_ms?: number;
    prompt?: string;
    status?: string;
    tier?: string;
    conf?: number;
    e2e?: number;
    question?: number;
    input_tokens?: number;
    output_tokens?: number;
    reason?: string;
    body?: string;
}

export interface JevTotals {
    calls: number;
    routed: number;
    skipped: number;
    errors: number;
    routedPct: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
    sessions: number;
    lastCallTs: string | null;
    lastRoutedTs: string | null;
}

export interface JevDay {
    day: string;
    routed: number;
    skipped: number;
    errors: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    tokens: number;
}

export interface JevSession {
    session_id: string;
    project: string;
    messages: number;
    routed: number;
    skipped: number;
    errors: number;
    topTier: string | null;
    firstTs: string;
    lastTs: string;
    avgConf: number | null;
}

export interface JevAggregate {
    totals: JevTotals;
    health: JevHealth;
    daily: JevDay[];
    tiers: Record<JevTier, number>;
    sessions: JevSession[];
    recent: JevRow[];
}

// What /api/claude/jev and the server-side prefetch both hand the page.
export interface JevPayload extends JevAggregate {
    days: number;
    project: string | null;
    projects: string[];
    logPath: string;
    hookPath: string;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

// The hook writes local timestamps with an offset ("2026-09-24T11:50:58-0400"),
// so the first 10 chars are already the day the prompt was typed. Bucketing on
// that string keeps days aligned to the user's clock rather than the server's.
export function dayOf(ts: string): string {
    return ts.slice(0, 10);
}

function isRow(v: unknown): v is JevRow {
    if (typeof v !== "object" || v === null) return false;
    const ts = (v as { ts?: unknown }).ts;
    return typeof ts === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ts);
}

// Parse a raw .jsonl chunk into rows, dropping anything unparsable. Exported so
// the aggregator can be exercised against a fixture string with no fs involved.
export function parseJevLines(chunk: string): JevRow[] {
    const rows: JevRow[] = [];
    for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { continue; }
        if (isRow(parsed)) rows.push(parsed);
    }
    return rows;
}

export function readJevLog(days = 30): JevRow[] {
    const chunk = readLastBytes(JEV_LOG_PATH, MAX_BYTES);
    if (!chunk) return [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = parseJevLines(chunk).filter(r => {
        const t = Date.parse(r.ts);
        return Number.isFinite(t) && t >= cutoff;
    });
    rows.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    return rows;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return Math.round(sorted[Math.max(0, idx)]);
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function statusOf(row: JevRow): JevStatus {
    if (row.status === "routed") return "routed";
    if (row.status === "error") return "error";
    return "skipped";
}

function latencyOf(row: JevRow): number | null {
    return typeof row.latency_ms === "number" && Number.isFinite(row.latency_ms) ? row.latency_ms : null;
}

// Pure: takes rows, returns everything the page needs. No fs, no Date.now()
// beyond the health clock, so a fixture array fully determines the output.
export function aggregateJev(rows: JevRow[], now: number = Date.now()): JevAggregate {
    const sorted = [...rows].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

    let routed = 0, skipped = 0, errors = 0, inputTokens = 0, outputTokens = 0;
    const latencies: number[] = [];
    const tiers: Record<JevTier, number> = { haiku: 0, sonnet: 0, opus: 0, fable: 0 };
    const dayMap = new Map<string, { routed: number; skipped: number; errors: number; lat: number[]; tokens: number }>();
    const sessionMap = new Map<string, JevSession & { tierCounts: Map<string, number>; confs: number[] }>();
    let lastRoutedTs: string | null = null;

    for (const row of sorted) {
        const status = statusOf(row);
        if (status === "routed") { routed++; lastRoutedTs = row.ts; }
        else if (status === "error") errors++;
        else skipped++;

        const lat = latencyOf(row);
        if (lat !== null) latencies.push(lat);

        const tokensIn = row.input_tokens ?? 0;
        const tokensOut = row.output_tokens ?? 0;
        inputTokens += tokensIn;
        outputTokens += tokensOut;

        if (status === "routed" && row.tier && (JEV_TIERS as readonly string[]).includes(row.tier)) {
            tiers[row.tier as JevTier]++;
        }

        // ── per day ──
        const day = dayOf(row.ts);
        let d = dayMap.get(day);
        if (!d) { d = { routed: 0, skipped: 0, errors: 0, lat: [], tokens: 0 }; dayMap.set(day, d); }
        if (status === "routed") d.routed++; else if (status === "error") d.errors++; else d.skipped++;
        if (lat !== null) d.lat.push(lat);
        d.tokens += tokensIn + tokensOut;

        // ── per session ──
        const sid = row.session_id || "unknown";
        let s = sessionMap.get(sid);
        if (!s) {
            s = {
                session_id: sid, project: row.project || "unknown",
                messages: 0, routed: 0, skipped: 0, errors: 0,
                topTier: null, firstTs: row.ts, lastTs: row.ts, avgConf: null,
                tierCounts: new Map(), confs: [],
            };
            sessionMap.set(sid, s);
        }
        s.messages++;
        if (status === "routed") s.routed++; else if (status === "error") s.errors++; else s.skipped++;
        if (row.project) s.project = row.project;
        s.lastTs = row.ts;
        if (status === "routed" && row.tier) s.tierCounts.set(row.tier, (s.tierCounts.get(row.tier) ?? 0) + 1);
        if (typeof row.conf === "number" && Number.isFinite(row.conf)) s.confs.push(row.conf);
    }

    const latSorted = [...latencies].sort((a, b) => a - b);
    const calls = sorted.length;

    const totals: JevTotals = {
        calls,
        routed,
        skipped,
        errors,
        routedPct: calls > 0 ? Math.round((routed / calls) * 1000) / 10 : 0,
        avgLatencyMs: mean(latencies),
        p95LatencyMs: percentile(latSorted, 95),
        inputTokens,
        outputTokens,
        estCostUsd: calls * JEV_COST_PER_CALL,
        sessions: sessionMap.size,
        lastCallTs: calls > 0 ? sorted[calls - 1].ts : null,
        lastRoutedTs,
    };

    // "never" until the router actually answers once. After that the only
    // question is how recently - anything past the 15 min live window reads as
    // stale, whether it is an hour old or a month.
    let health: JevHealth = "never";
    if (lastRoutedTs) {
        health = now - Date.parse(lastRoutedTs) < LIVE_MS ? "live" : "stale";
    }

    const daily: JevDay[] = [...dayMap.entries()]
        .map(([day, d]) => ({
            day,
            routed: d.routed,
            skipped: d.skipped,
            errors: d.errors,
            avgLatencyMs: mean(d.lat),
            p95LatencyMs: percentile([...d.lat].sort((a, b) => a - b), 95),
            tokens: d.tokens,
        }))
        .sort((a, b) => a.day.localeCompare(b.day));

    const sessions: JevSession[] = [...sessionMap.values()]
        .map(s => {
            let topTier: string | null = null;
            let best = 0;
            for (const [tier, count] of s.tierCounts) {
                if (count > best) { best = count; topTier = tier; }
            }
            return {
                session_id: s.session_id, project: s.project, messages: s.messages,
                routed: s.routed, skipped: s.skipped, errors: s.errors,
                topTier, firstTs: s.firstTs, lastTs: s.lastTs,
                avgConf: s.confs.length > 0
                    ? Math.round((s.confs.reduce((x, y) => x + y, 0) / s.confs.length) * 100) / 100
                    : null,
            };
        })
        .sort((a, b) => Date.parse(b.lastTs) - Date.parse(a.lastTs));

    const recent = sorted.slice(-RECENT_LIMIT).reverse();

    return { totals, health, daily, tiers, sessions, recent };
}
