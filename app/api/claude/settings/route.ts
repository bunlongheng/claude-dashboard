import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const SITES_DIR = path.join(HOME, "Sites");

function safeJson(p: string): Record<string, unknown> | null {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}
function safeRead(p: string): string {
    try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}
function dirExists(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

interface ProjectSettings {
    project: string;
    path: string;
    settings: Record<string, unknown> | null;
    localSettings: Record<string, unknown> | null;
    instructions: string | null;
    hasHooks: boolean;
    hasCommands: boolean;
}

export async function GET() {
    // Global settings
    const globalSettings = safeJson(path.join(CLAUDE_DIR, "settings.json"));
    const globalLocalSettings = safeJson(path.join(CLAUDE_DIR, "settings.local.json"));

    // Per-project settings - scan ~/Sites/*/.claude/
    const projectSettings: ProjectSettings[] = [];

    if (dirExists(SITES_DIR)) {
        for (const name of fs.readdirSync(SITES_DIR)) {
            const claudeDir = path.join(SITES_DIR, name, ".claude");
            if (!dirExists(claudeDir)) continue;

            const settings = safeJson(path.join(claudeDir, "settings.json"));
            const localSettings = safeJson(path.join(claudeDir, "settings.local.json"));
            const instructions = safeRead(path.join(claudeDir, "instructions.md")) || null;
            const hasHooks = dirExists(path.join(claudeDir, "hooks"));
            const hasCommands = dirExists(path.join(claudeDir, "commands"));

            if (settings || localSettings || instructions) {
                projectSettings.push({
                    project: name,
                    path: claudeDir,
                    settings,
                    localSettings,
                    instructions,
                    hasHooks,
                    hasCommands,
                });
            }
        }
    }

    return NextResponse.json({
        global: { settings: globalSettings, localSettings: globalLocalSettings },
        projects: projectSettings,
    });
}
