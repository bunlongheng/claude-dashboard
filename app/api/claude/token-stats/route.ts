import { NextResponse } from "next/server";
import { walkProjectJsonl, PROJECTS_DIR } from "@/lib/jsonl-walk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getModelRates } from "@/lib/pricing";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024; // 50 KB per file
const CACHE_TTL_MS = 30_000;
const CC = { headers: { "Cache-Control": "public, max-age=30" } };

interface TokenCompatEntry {
    session_id: string;
    project: string;
    model: string;
    machine: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    prompt_count: number;
}

interface AggBucket {
    total: number;
    cost: number;
    count: number;
    input: number;
    output: number;
}

interface TokenStatsPayload {
    tokens: TokenCompatEntry[];
    totals: {
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_creation_tokens: number;
        total_tokens: number;
        total_cost: number;
        session_count: number;
    };
    byModel: ({ model: string } & AggBucket)[];
    byProject: ({ project: string } & AggBucket)[];
}

let cache: { at: number; data: TokenStatsPayload } | null = null;

// ─── Pricing (rates live in lib/pricing.ts - single source of truth) ─────────
function calcCost(input: number, output: number, cacheRead: number, cacheCreate: number, model?: string): number {
    const p = getModelRates(model);
    return (
        (input       / 1_000_000) * p.input +
        (output      / 1_000_000) * p.output +
        (cacheRead   / 1_000_000) * p.cache_read +
        (cacheCreate / 1_000_000) * p.cache_write_5m
    );
}

// ─── File reading ────────────────────────────────────────────────────────────

function folderToPath(folder: string): string {
    return folder.replace(/-/g, "/");
}

// ─── Accumulator ─────────────────────────────────────────────────────────────
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

// Applies one parsed .jsonl line's usage onto a session's running accumulator.
function applyLine(d: { type?: string; summary?: { usage?: Record<string, number>; model?: string }; message?: { usage?: Record<string, number>; model?: string } }, accum: SessionAccum): void {
    // type: "summary" - contains aggregated usage
    if (d.type === "summary" && d.summary?.usage) {
        const u = d.summary.usage;
        accum.input_tokens += u.input_tokens ?? 0;
        accum.output_tokens += u.output_tokens ?? 0;
        accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
        accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
        accum.prompt_count += 1;
        if (d.summary.model) accum.model = d.summary.model;
        return;
    }

    // type: "assistant" with message.usage - per-turn usage
    if (d.type === "assistant" && d.message?.usage) {
        const u = d.message.usage;
        accum.input_tokens += u.input_tokens ?? 0;
        accum.output_tokens += u.output_tokens ?? 0;
        accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
        accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
        if (d.message.model) accum.model = d.message.model;
    }
}

// ─── GET handler ─────────────────────────────────────────────────────────────
export const GET = withErrorHandler(async () => {
    if (!fs.existsSync(PROJECTS_DIR)) {
        return NextResponse.json({ sessions: [], byModel: [], byProject: [], totals: null, error: "No .claude/projects directory found" });
    }

    const now = Date.now();
    if (cache && now - cache.at < CACHE_TTL_MS) {
        return NextResponse.json(cache.data, CC);
    }

    // Per-file accumulators, keyed by filePath (one session per file).
    const accums = new Map<string, SessionAccum>();
    walkProjectJsonl({ maxBytes: MAX_BYTES }, (parsed, ctx) => {
        let accum = accums.get(ctx.filePath);
        if (!accum) {
            accum = {
                session_id: path.basename(ctx.fileName, ".jsonl"),
                project: folderToPath(ctx.folder),
                model: "unknown",
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                prompt_count: 0,
            };
            accums.set(ctx.filePath, accum);
        }
        applyLine(parsed as Parameters<typeof applyLine>[0], accum);
    });

    const sessions: SessionAccum[] = [];
    for (const accum of accums.values()) {
        // Only include sessions that have any tokens
        if (accum.input_tokens + accum.output_tokens > 0) {
            sessions.push(accum);
        }
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreate = 0, totalCost = 0;
    for (const s of sessions) {
        totalInput += s.input_tokens;
        totalOutput += s.output_tokens;
        totalCacheRead += s.cache_read_tokens;
        totalCacheCreate += s.cache_creation_tokens;
        totalCost += calcCost(s.input_tokens, s.output_tokens, s.cache_read_tokens, s.cache_creation_tokens, s.model);
    }

    // ── Per-model breakdown ──────────────────────────────────────────────────
    const modelMap = new Map<string, { total: number; cost: number; count: number; input: number; output: number }>();
    for (const s of sessions) {
        const key = s.model || "unknown";
        const entry = modelMap.get(key) ?? { total: 0, cost: 0, count: 0, input: 0, output: 0 };
        entry.total += s.input_tokens + s.output_tokens;
        entry.input += s.input_tokens;
        entry.output += s.output_tokens;
        entry.cost += calcCost(s.input_tokens, s.output_tokens, s.cache_read_tokens, s.cache_creation_tokens, s.model);
        entry.count += 1;
        modelMap.set(key, entry);
    }
    const byModel = [...modelMap.entries()]
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.total - a.total);

    // ── Per-project breakdown ────────────────────────────────────────────────
    const projMap = new Map<string, { total: number; cost: number; count: number; input: number; output: number }>();
    for (const s of sessions) {
        const key = s.project.split("/").pop() ?? "unknown";
        const entry = projMap.get(key) ?? { total: 0, cost: 0, count: 0, input: 0, output: 0 };
        entry.total += s.input_tokens + s.output_tokens;
        entry.input += s.input_tokens;
        entry.output += s.output_tokens;
        entry.cost += calcCost(s.input_tokens, s.output_tokens, s.cache_read_tokens, s.cache_creation_tokens, s.model);
        entry.count += 1;
        projMap.set(key, entry);
    }
    const byProject = [...projMap.entries()]
        .map(([project, v]) => ({ project, ...v }))
        .sort((a, b) => b.total - a.total);

    // ── Token[] compatible format (for TokensSection) ────────────────────────
    const hostname = os.hostname().split(".")[0];
    const tokensCompat = sessions.map(s => ({
        session_id: s.session_id,
        project: s.project,
        model: s.model,
        machine: hostname,
        input_tokens: s.input_tokens,
        output_tokens: s.output_tokens,
        cache_read_tokens: s.cache_read_tokens,
        cache_creation_tokens: s.cache_creation_tokens,
        prompt_count: s.prompt_count,
    }));

    const payload = {
        // TokensSection-compatible array
        tokens: tokensCompat,
        // Pre-aggregated summaries
        totals: {
            input_tokens: totalInput,
            output_tokens: totalOutput,
            cache_read_tokens: totalCacheRead,
            cache_creation_tokens: totalCacheCreate,
            total_tokens: totalInput + totalOutput + totalCacheRead + totalCacheCreate,
            total_cost: Math.round(totalCost * 100) / 100,
            session_count: sessions.length,
        },
        byModel,
        byProject,
    };
    cache = { at: now, data: payload };
    return NextResponse.json(payload, CC);
}) as (req?: Request) => Promise<Response>;
