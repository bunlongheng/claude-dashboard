import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");

/** Known Claude Code default values for settings keys */
const KNOWN_DEFAULTS: Record<string, unknown> = {
    // Claude Code ships with an empty settings.json by default.
    // Any key present in the user's file is a customization.
};

function safeJson(p: string): Record<string, unknown> | null {
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
        return null;
    }
}

function flattenObject(
    obj: Record<string, unknown>,
    prefix = "",
): { key: string; value: unknown }[] {
    const result: { key: string; value: unknown }[] = [];
    for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            result.push(...flattenObject(v as Record<string, unknown>, fullKey));
        } else {
            result.push({ key: fullKey, value: v });
        }
    }
    return result;
}

export async function GET() {
    const settingsPath = path.join(CLAUDE_DIR, "settings.json");
    const localSettingsPath = path.join(CLAUDE_DIR, "settings.local.json");

    const settings = safeJson(settingsPath);
    const localSettings = safeJson(localSettingsPath);

    const customized: { key: string; value: unknown; default: unknown; source: string }[] = [];

    if (settings) {
        for (const { key, value } of flattenObject(settings)) {
            customized.push({
                key,
                value,
                default: KNOWN_DEFAULTS[key] ?? null,
                source: "settings.json",
            });
        }
    }

    if (localSettings) {
        for (const { key, value } of flattenObject(localSettings)) {
            customized.push({
                key,
                value,
                default: KNOWN_DEFAULTS[key] ?? null,
                source: "settings.local.json",
            });
        }
    }

    return NextResponse.json({
        customized,
        total: customized.length,
        files: {
            settings: settings ? settingsPath : null,
            localSettings: localSettings ? localSettingsPath : null,
        },
    });
}
