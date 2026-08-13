import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { safeRead } from "@/lib/safe-read";
import { requireSameSite } from "@/lib/route-guard";
import { withErrorHandler } from "@/lib/api-handler";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const SITES_DIR = path.join(HOME, "Sites");

function safeJson(p: string): Record<string, unknown> | null {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
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

export const GET = withErrorHandler(async (req: Request) => {
    // Full settings.json / settings.local.json contents are sensitive (they can
    // hold env vars, tokens, permission lists). Only same-site/bearer-authorized
    // callers get the full dump; anyone else is downgraded to the slim shape
    // (key counts only) - never file contents.
    const authorized = requireSameSite(req) === null;
    const slim = !authorized || new URL(req.url).searchParams.get("slim") === "1";
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

    if (slim) {
        return NextResponse.json({
            global: {
                settings: globalSettings ? { _keys: Object.keys(globalSettings).length } : null,
                localSettings: globalLocalSettings ? { _keys: Object.keys(globalLocalSettings).length } : null,
            },
            projects: projectSettings.map(p => ({
                project: p.project,
                path: p.path,
                settings: p.settings ? { _keys: Object.keys(p.settings).length } : null,
                localSettings: p.localSettings ? { _keys: Object.keys(p.localSettings).length } : null,
                instructions: p.instructions ? true : null,
                hasHooks: p.hasHooks,
                hasCommands: p.hasCommands,
            })),
        });
    }

    return NextResponse.json({
        global: { settings: globalSettings, localSettings: globalLocalSettings },
        projects: projectSettings,
    });
}) as (req: Request) => Promise<Response>;
