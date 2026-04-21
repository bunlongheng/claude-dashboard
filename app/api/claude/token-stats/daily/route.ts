import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

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

interface ToolBucket {
    tool: string;
    calls: number;
}

function readFullFile(filePath: string): string {
    try {
        return fs.readFileSync(filePath, "utf-8");
    } catch {
        return "";
    }
}

export async function GET() {
    if (!fs.existsSync(CLAUDE_DIR)) {
        return NextResponse.json({ daily: [], byModel: [], tools: [] });
    }

    const dailyMap = new Map<string, DayBucket>();
    const modelMap = new Map<string, ModelBucket>();
    const toolMap = new Map<string, number>();
    const sessionDays = new Map<string, Set<string>>(); // session -> set of days
    let totalTurns = 0;
    let totalSessions = 0;

    const currentUser = os.userInfo().username;

    for (const folder of fs.readdirSync(CLAUDE_DIR)) {
        // Only scan current user's folders
        const hasUser = folder.includes(`-${currentUser}-`) || folder.endsWith(`-${currentUser}`);
        if (!hasUser) continue;

        const folderPath = path.join(CLAUDE_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }

        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const filePath = path.join(folderPath, file);
            const sessionId = file.replace(".jsonl", "");
            const content = readFullFile(filePath);
            if (!content) continue;

            let sessionHasTokens = false;

            for (const line of content.split("\n")) {
                if (!line) continue;
                try {
                    const d = JSON.parse(line);
                    const ts = d.timestamp as string | undefined;
                    const day = ts ? ts.slice(0, 10) : null;

                    // Extract tool calls from assistant messages
                    if (d.type === "assistant" && d.message?.content) {
                        for (const block of d.message.content) {
                            if (block.type === "tool_use" && block.name) {
                                toolMap.set(block.name, (toolMap.get(block.name) ?? 0) + 1);
                            }
                        }
                    }

                    // Extract usage from summary or assistant
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

                        if (input + output > 0) sessionHasTokens = true;

                        // Daily bucket
                        const bucket = dailyMap.get(day) ?? { day, input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0, sessions: 0 };
                        bucket.input += input;
                        bucket.output += output;
                        bucket.cache_read += cacheRead;
                        bucket.cache_creation += cacheCreate;
                        bucket.turns += 1;
                        dailyMap.set(day, bucket);

                        // Track session-day for session count
                        if (!sessionDays.has(sessionId)) sessionDays.set(sessionId, new Set());
                        sessionDays.get(sessionId)!.add(day);

                        // Model bucket
                        const modelKey = model ?? "unknown";
                        const mb = modelMap.get(modelKey) ?? { model: modelKey, input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
                        mb.input += input;
                        mb.output += output;
                        mb.cache_read += cacheRead;
                        mb.cache_creation += cacheCreate;
                        mb.turns += 1;
                        modelMap.set(modelKey, mb);

                        totalTurns += 1;
                    }
                } catch { /* skip malformed line */ }
            }

            if (sessionHasTokens) totalSessions += 1;
        }
    }

    // Add session counts to daily buckets
    for (const [, days] of sessionDays) {
        for (const day of days) {
            const bucket = dailyMap.get(day);
            if (bucket) bucket.sessions += 1;
        }
    }

    const daily = [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    const byModel = [...modelMap.values()].sort((a, b) => (b.input + b.output) - (a.input + a.output));
    const tools = [...toolMap.entries()]
        .map(([tool, calls]) => ({ tool, calls }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 15);

    return NextResponse.json({
        daily,
        byModel,
        tools,
        totalTurns,
        totalSessions,
    });
}
