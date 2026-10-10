import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// A mod is a plugin whose hooks/hooks.json loads TS modules ({"modules": [...]}).
// Installed ones are registered in plugins/installed_plugins.json and switched on
// or off by enabledPlugins in settings.json; ones still being built sit under
// dev-mods/<sessionId>/<name>/ and are in neither file.
export type ModInfo = {
    id: string; name: string; version: string | null; description: string;
    status: "enabled" | "disabled" | "dev"; path: string; installedAt: string | null;
};

const CLAUDE = path.join(os.homedir(), ".claude");

function readJson<T>(file: string): T | null {
    try { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; } catch { return null; }
}

function isMod(dir: string): boolean {
    const hooks = readJson<{ modules?: unknown[] }>(path.join(dir, "hooks", "hooks.json"));
    return Array.isArray(hooks?.modules) && hooks.modules.length > 0;
}

function manifest(dir: string) {
    return readJson<{ name?: string; version?: string; description?: string }>(path.join(dir, ".claude-plugin", "plugin.json"));
}

export function scanMods(): ModInfo[] {
    const mods: ModInfo[] = [];
    const settings = readJson<{ enabledPlugins?: Record<string, boolean>; env?: Record<string, string> }>(path.join(CLAUDE, "settings.json"));
    const enabled = settings?.enabledPlugins ?? {};

    // CLAUDE_CODE_PLUGIN_DIRS loads plugins straight from disk in every session; a
    // marketplace copy of the same plugin is then switched off to avoid a double load.
    const dirs = (settings?.env?.CLAUDE_CODE_PLUGIN_DIRS ?? "").split(":").filter(d => d && isMod(d));
    const dirNames = new Set<string>();
    for (const dir of dirs) {
        const m = manifest(dir);
        const name = m?.name ?? path.basename(dir);
        dirNames.add(name);
        mods.push({
            id: `${name}@dir`, name, version: m?.version ?? null,
            description: m?.description ?? "", status: "enabled", path: dir, installedAt: null,
        });
    }
    type Install = { installPath: string; version?: string; installedAt?: string };
    const installed = readJson<{ plugins?: Record<string, Install[]> }>(path.join(CLAUDE, "plugins", "installed_plugins.json"))?.plugins ?? {};

    for (const [id, installs] of Object.entries(installed)) {
        const inst = installs.find(i => isMod(i.installPath));
        if (!inst) continue;
        const m = manifest(inst.installPath);
        if (dirNames.has(m?.name ?? id.split("@")[0])) continue;
        mods.push({
            id, name: m?.name ?? id.split("@")[0], version: m?.version ?? inst.version ?? null,
            description: m?.description ?? "", status: enabled[id] ? "enabled" : "disabled",
            path: inst.installPath, installedAt: inst.installedAt ?? null,
        });
    }

    const devRoot = path.join(CLAUDE, "dev-mods");
    let sessions: string[] = [];
    try { sessions = fs.readdirSync(devRoot); } catch { /* no dev mods */ }
    for (const session of sessions) {
        let names: string[] = [];
        try { names = fs.readdirSync(path.join(devRoot, session)); } catch { continue; }
        for (const name of names) {
            const dir = path.join(devRoot, session, name);
            if (!isMod(dir)) continue;
            const m = manifest(dir);
            mods.push({
                id: `${name}@dev`, name: m?.name ?? name, version: m?.version ?? null,
                description: m?.description ?? "", status: "dev", path: dir, installedAt: null,
            });
        }
    }
    return mods;
}

// Marketplaces Claude Code knows about, linked to their online catalog.
export function scanMarketplaces(): { name: string; url: string }[] {
    type Src = { source?: { source?: string; repo?: string; url?: string } };
    const known = readJson<Record<string, Src>>(path.join(CLAUDE, "plugins", "known_marketplaces.json")) ?? {};
    return Object.entries(known).flatMap(([name, v]) => {
        const url = v.source?.repo ? `https://github.com/${v.source.repo}` : v.source?.url;
        return url ? [{ name, url }] : [];
    });
}
