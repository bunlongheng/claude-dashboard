import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const MAX_BYTES = 50 * 1024; // 50 KB per file

// ─── Pricing (per MTok) ─────────────────────────────────────────────────────
type ModelPrice = { input: number; output: number; cache_read: number; cache_creation: number };
const MODEL_PRICES: Record<string, ModelPrice> = {
    opus:   { input: 15,   output: 75, cache_read: 1.50,  cache_creation: 18.75 },
    sonnet: { input: 3,    output: 15, cache_read: 0.30,  cache_creation: 3.75  },
    haiku:  { input: 0.80, output: 4,  cache_read: 0.08,  cache_creation: 1.00  },
};

function getModelPrice(model?: string): ModelPrice {
    if (!model) return MODEL_PRICES.sonnet;
    const m = model.toLowerCase();
    if (m.includes("opus"))  return MODEL_PRICES.opus;
    if (m.includes("haiku")) return MODEL_PRICES.haiku;
    return MODEL_PRICES.sonnet;
}

function calcCost(input: number, output: number, cacheRead: number, cacheCreate: number, model?: string): number {
    const p = getModelPrice(model);
    return (
        (input       / 1_000_000) * p.input +
        (output      / 1_000_000) * p.output +
        (cacheRead   / 1_000_000) * p.cache_read +
        (cacheCreate / 1_000_000) * p.cache_creation
    );
}

// ─── File reading ────────────────────────────────────────────────────────────
function readLastBytes(filePath: string, maxBytes: number): string {
    let fd = -1;
    try {
        fd = fs.openSync(filePath, "r");
        const stat = fs.fstatSync(fd);
        const size = stat.size;
        const readSize = Math.min(maxBytes, size);
        const offset = Math.max(0, size - readSize);
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, offset);
        return buf.toString("utf-8");
    } catch { return ""; }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

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

function parseSessionFile(filePath: string, project: string): SessionAccum {
    const sessionId = path.basename(filePath, ".jsonl");
    const accum: SessionAccum = {
        session_id: sessionId,
        project,
        model: "unknown",
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        prompt_count: 0,
    };

    const chunk = readLastBytes(filePath, MAX_BYTES);
    if (!chunk) return accum;

    const lines = chunk.split("\n");
    // Drop last line if truncated (file may have been cut mid-line)
    if (lines.length > 1 && !chunk.endsWith("\n")) lines.pop();

    for (const line of lines) {
        if (!line) continue;
        try {
            const d = JSON.parse(line);

            // type: "summary" - contains aggregated usage
            if (d.type === "summary" && d.summary?.usage) {
                const u = d.summary.usage;
                accum.input_tokens += u.input_tokens ?? 0;
                accum.output_tokens += u.output_tokens ?? 0;
                accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
                accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
                accum.prompt_count += 1;
                if (d.summary.model) accum.model = d.summary.model;
                continue;
            }

            // type: "assistant" with message.usage - per-turn usage
            if (d.type === "assistant" && d.message?.usage) {
                const u = d.message.usage;
                accum.input_tokens += u.input_tokens ?? 0;
                accum.output_tokens += u.output_tokens ?? 0;
                accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
                accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
                if (d.message.model) accum.model = d.message.model;
                continue;
            }
        } catch { /* skip malformed line */ }
    }

    return accum;
}

// ─── GET handler ─────────────────────────────────────────────────────────────
export async function GET() {
    if (!fs.existsSync(CLAUDE_DIR)) {
        return NextResponse.json({ sessions: [], byModel: [], byProject: [], totals: null, error: "No .claude/projects directory found" });
    }

    const sessions: SessionAccum[] = [];

    for (const folder of fs.readdirSync(CLAUDE_DIR)) {
        const folderPath = path.join(CLAUDE_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }

        const projectPath = folderToPath(folder);

        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const filePath = path.join(folderPath, file);
            const accum = parseSessionFile(filePath, projectPath);
            // Only include sessions that have any tokens
            if (accum.input_tokens + accum.output_tokens > 0) {
                sessions.push(accum);
            }
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

    return NextResponse.json({
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
    });
}
