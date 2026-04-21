import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

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

interface WindowBucket {
    messages: number;
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    cost: number;
}

function emptyBucket(): WindowBucket {
    return { messages: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, cost: 0 };
}

export async function GET() {
    const now = Date.now();
    const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const five_hour = emptyBucket();
    const seven_day = emptyBucket();

    if (!fs.existsSync(CLAUDE_DIR)) {
        return NextResponse.json({ five_hour, seven_day });
    }

    for (const folder of fs.readdirSync(CLAUDE_DIR)) {
        const folderPath = path.join(CLAUDE_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }

        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const filePath = path.join(folderPath, file);
            let content = "";
            try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }

            for (const line of content.split("\n")) {
                if (!line.trim()) continue;
                try {
                    const d = JSON.parse(line);

                    let usage: Record<string, number> | null = null;
                    let model: string | undefined;
                    let tsStr: string | undefined;

                    if (d.type === "assistant" && d.message?.usage) {
                        usage = d.message.usage;
                        model = d.message.model;
                        tsStr = d.timestamp;
                    } else if (d.type === "summary" && d.summary?.usage) {
                        usage = d.summary.usage;
                        model = d.summary.model;
                        tsStr = d.timestamp;
                    }

                    if (!usage || !tsStr) continue;
                    const ts = new Date(tsStr).getTime();
                    if (isNaN(ts) || ts > now) continue;

                    const inp = usage.input_tokens ?? 0;
                    const out = usage.output_tokens ?? 0;
                    const cr  = usage.cache_read_input_tokens ?? 0;
                    const cc  = usage.cache_creation_input_tokens ?? 0;
                    const cost = calcCost(inp, out, cr, cc, model);

                    if (ts >= fiveHoursAgo) {
                        five_hour.messages++;
                        five_hour.input += inp;
                        five_hour.output += out;
                        five_hour.cache_read += cr;
                        five_hour.cache_creation += cc;
                        five_hour.cost += cost;
                    }

                    if (ts >= sevenDaysAgo) {
                        seven_day.messages++;
                        seven_day.input += inp;
                        seven_day.output += out;
                        seven_day.cache_read += cr;
                        seven_day.cache_creation += cc;
                        seven_day.cost += cost;
                    }
                } catch { /* skip */ }
            }
        }
    }

    // Next reset times (5h resets on next 5h boundary, 7d resets next Monday 4pm ET)
    const fiveHourResetMs = Math.ceil(now / (5 * 3600 * 1000)) * (5 * 3600 * 1000);
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
    nextMonday.setUTCHours(20, 0, 0, 0); // 4pm ET = 20:00 UTC
    if (nextMonday.getTime() < now) nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    // ── Merge with usage-status.json (written by capture-usage.sh hook) ─────
    let usageStatus: Record<string, unknown> | null = null;
    try {
        const statusPath = path.join(os.homedir(), ".claude", "usage-status.json");
        if (fs.existsSync(statusPath)) {
            usageStatus = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
        }
    } catch { /* ignore */ }

    const fiveHourStatus = usageStatus?.five_hour as { percent_used: number; resets_at_iso: string } | null | undefined;
    const sevenDayStatus = usageStatus?.seven_day as { percent_used: number; resets_at_iso: string } | null | undefined;

    return NextResponse.json({
        five_hour,
        seven_day,
        resets: {
            five_hour_at: fiveHourStatus?.resets_at_iso ?? new Date(fiveHourResetMs).toISOString(),
            seven_day_at: sevenDayStatus?.resets_at_iso ?? nextMonday.toISOString(),
        },
        quota: {
            five_hour_pct:  fiveHourStatus?.percent_used ?? null,
            seven_day_pct:  sevenDayStatus?.percent_used ?? null,
            updated_at:     (usageStatus?.updated_at as string) ?? null,
        },
    });
}
