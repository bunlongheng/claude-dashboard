import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const SITES_DIR = path.join(os.homedir(), "Sites");
const STALE_DAYS = 7;

function dirExists(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function fileExists(p: string): boolean {
    try { return fs.statSync(p).isFile(); } catch { return false; }
}
function folderToName(folder: string): string {
    return folder.replace(/-/g, "/").split("/").pop() ?? folder;
}

export async function GET() {
    if (!dirExists(PROJECTS_DIR)) {
        return NextResponse.json({ projects: [] });
    }

    const now = Date.now();
    const sevenDaysMs = STALE_DAYS * 86_400_000;

    interface ProjectHealth {
        name: string;
        folder: string;
        score: number;
        has: {
            claudeMd: boolean;
            memory: boolean;
            recentSessions: boolean;
            instructions: boolean;
            settings: boolean;
        };
        memoryCount: number;
        sessionCount: number;
        lastActive: string | null;
    }

    const projects: ProjectHealth[] = [];

    for (const folder of fs.readdirSync(PROJECTS_DIR)) {
        const folderPath = path.join(PROJECTS_DIR, folder);
        if (!dirExists(folderPath)) continue;

        const name = folderToName(folder);
        let score = 0;

        // --- Has CLAUDE.md (+20) ---
        // Check in ~/.claude/projects/<folder>/CLAUDE.md OR ~/Sites/<name>/CLAUDE.md
        const hasClaude =
            fileExists(path.join(folderPath, "CLAUDE.md")) ||
            fileExists(path.join(SITES_DIR, name, "CLAUDE.md"));
        if (hasClaude) score += 20;

        // --- Has memory files (+20 base, +5 per file up to 40 total) ---
        const memDir = path.join(folderPath, "memory");
        let memoryCount = 0;
        if (dirExists(memDir)) {
            try {
                memoryCount = fs.readdirSync(memDir).filter(f => f.endsWith(".md")).length;
            } catch { /* ignore */ }
        }
        const hasMemory = memoryCount > 0;
        if (hasMemory) {
            score += Math.min(20 + memoryCount * 5, 40);
        }

        // --- Has recent sessions within 7 days (+20) ---
        let sessionCount = 0;
        let hasRecent = false;
        let lastActive: string | null = null;
        let latestMtime = 0;
        try {
            const sessionFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
            sessionCount = sessionFiles.length;
            for (const sf of sessionFiles) {
                try {
                    const stat = fs.statSync(path.join(folderPath, sf));
                    const mtime = stat.mtime.getTime();
                    if (mtime > latestMtime) latestMtime = mtime;
                    if (now - mtime < sevenDaysMs) hasRecent = true;
                } catch { /* skip */ }
            }
        } catch { /* ignore */ }
        if (latestMtime > 0) lastActive = new Date(latestMtime).toISOString();
        if (hasRecent) score += 20;

        // --- Has .claude/instructions.md (+10) ---
        const hasInstructions =
            fileExists(path.join(SITES_DIR, name, ".claude", "instructions.md"));
        if (hasInstructions) score += 10;

        // --- Has settings (+10) ---
        const hasSettings =
            fileExists(path.join(SITES_DIR, name, ".claude", "settings.json")) ||
            fileExists(path.join(SITES_DIR, name, ".claude", "settings.local.json"));
        if (hasSettings) score += 10;

        // Only include projects that have at least some activity
        if (sessionCount > 0 || memoryCount > 0 || hasClaude) {
            projects.push({
                name,
                folder,
                score,
                has: {
                    claudeMd: hasClaude,
                    memory: hasMemory,
                    recentSessions: hasRecent,
                    instructions: hasInstructions,
                    settings: hasSettings,
                },
                memoryCount,
                sessionCount,
                lastActive,
            });
        }
    }

    // Sort by score descending, then by name
    projects.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return NextResponse.json({ projects });
}
