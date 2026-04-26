import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

interface SessionContext {
    sessionId: string;
    project: string;
    model: string;
    contextUsed: number;
    contextMax: number;
    inputTokens: number;
    cacheRead: number;
    cacheCreate: number;
    outputTokens: number;
    turns: number;
    lastActive: string;
    customTitle: string | null;
}

function getContextMax(model: string): number {
    const m = (model || "").toLowerCase();
    if (m.includes("opus")) return 1_000_000;
    if (m.includes("sonnet")) return 1_000_000;
    if (m.includes("haiku")) return 200_000;
    return 200_000;
}

export async function GET() {
    if (!fs.existsSync(CLAUDE_DIR)) {
        return NextResponse.json({ sessions: [] });
    }

    const currentUser = os.userInfo().username;
    const cutoff = Date.now() - 15 * 60 * 1000; // 15 min = active
    const sessions: SessionContext[] = [];

    for (const folder of fs.readdirSync(CLAUDE_DIR)) {
        const hasUser = folder.includes(`-${currentUser}-`) || folder.endsWith(`-${currentUser}`);
        if (!hasUser) continue;

        const folderPath = path.join(CLAUDE_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }

        const projectName = folder.replace(/-/g, "/").split("/").pop() || folder;

        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const filePath = path.join(folderPath, file);
            const stat = fs.statSync(filePath);

            // Only active sessions
            if (stat.mtime.getTime() < cutoff) continue;

            const sessionId = file.replace(".jsonl", "");

            // Read last 20KB to find latest usage
            let fd = -1;
            let chunk = "";
            try {
                fd = fs.openSync(filePath, "r");
                const size = stat.size;
                const readSize = Math.min(20 * 1024, size);
                const offset = Math.max(0, size - readSize);
                const buf = Buffer.alloc(readSize);
                fs.readSync(fd, buf, 0, readSize, offset);
                chunk = buf.toString("utf-8");
            } catch { continue; }
            finally { if (fd >= 0) try { fs.closeSync(fd); } catch {} }

            let model = "unknown";
            let lastInput = 0;
            let lastCacheRead = 0;
            let lastCacheCreate = 0;
            let lastOutput = 0;
            let lastTimestamp = "";
            let customTitle: string | null = null;
            let turns = 0;

            const lines = chunk.split("\n");
            for (const line of lines) {
                if (!line) continue;
                try {
                    const d = JSON.parse(line);

                    if (d.type === "custom-title" && d.customTitle) {
                        customTitle = d.customTitle;
                    }

                    if (d.type === "assistant" && d.message?.usage) {
                        const u = d.message.usage;
                        lastInput = u.input_tokens ?? 0;
                        lastCacheRead = u.cache_read_input_tokens ?? 0;
                        lastCacheCreate = u.cache_creation_input_tokens ?? 0;
                        lastOutput = u.output_tokens ?? 0;
                        if (d.message.model) model = d.message.model;
                        if (d.timestamp) lastTimestamp = d.timestamp;
                        turns++;
                    }

                    if (d.type === "summary" && d.summary?.model) {
                        model = d.summary.model;
                    }
                } catch {}
            }

            // Context used = cache_read + input (cache_read is the bulk of reused context)
            const contextUsed = lastCacheRead + lastInput + lastCacheCreate;
            if (contextUsed === 0) continue;

            const contextMax = getContextMax(model);

            sessions.push({
                sessionId,
                project: projectName,
                model,
                contextUsed,
                contextMax,
                inputTokens: lastInput,
                cacheRead: lastCacheRead,
                cacheCreate: lastCacheCreate,
                outputTokens: lastOutput,
                turns,
                lastActive: lastTimestamp || stat.mtime.toISOString(),
                customTitle,
            });
        }
    }

    // Sort by context usage descending
    sessions.sort((a, b) => b.contextUsed - a.contextUsed);

    return NextResponse.json({ sessions });
}
