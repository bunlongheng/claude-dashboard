import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const MARKETPLACE_DIR = path.join(CLAUDE_DIR, "plugins", "marketplaces", "claude-plugins-official");
const PLUGINS_DIR = path.join(MARKETPLACE_DIR, "plugins");
const STANDALONE_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const STANDALONE_CMDS_DIR = path.join(CLAUDE_DIR, "commands");
const EXTERNAL_DIR = path.join(MARKETPLACE_DIR, "external_plugins");

function safeRead(p: string): string {
    try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}
function safeJson(p: string): any {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}
function dirExists(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function fileExists(p: string): boolean {
    try { return fs.statSync(p).isFile(); } catch { return false; }
}

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type SkillInfo = { name: string; plugin: string; description: string; path: string; source: "builtin" | "external"; content: string };
type CommandInfo = { name: string; plugin: string; description: string; path: string; content: string; source: "builtin" | "external" };
type McpInfo = { name: string; type: string; url?: string; command?: string; path: string };
type HookInfo = { name: string; plugin: string; events: string[]; command?: string; path: string };
type ClaudeMdInfo = { name: string; path: string; content: string; scope: "global" | "project" };

function scanPlugins(): PluginInfo[] {
    const plugins: PluginInfo[] = [];

    // Built-in plugins
    if (dirExists(PLUGINS_DIR)) {
        for (const name of fs.readdirSync(PLUGINS_DIR)) {
            const dir = path.join(PLUGINS_DIR, name);
            if (!dirExists(dir)) continue;
            const manifest = safeJson(path.join(dir, "plugin.json")) ?? safeJson(path.join(dir, "manifest.json"));
            const desc = manifest?.description ?? manifest?.name ?? name;
            const isLsp = name.endsWith("-lsp");
            plugins.push({ name, description: desc, path: dir, type: isLsp ? "lsp" : "builtin" });
        }
    }

    // External plugins
    if (dirExists(EXTERNAL_DIR)) {
        for (const name of fs.readdirSync(EXTERNAL_DIR)) {
            const dir = path.join(EXTERNAL_DIR, name);
            if (!dirExists(dir)) continue;
            const manifest = safeJson(path.join(dir, "plugin.json")) ?? safeJson(path.join(dir, "manifest.json"));
            const desc = manifest?.description ?? name;
            plugins.push({ name, description: desc, path: dir, type: "external" });
        }
    }

    return plugins;
}

function scanSkills(): SkillInfo[] {
    const skills: SkillInfo[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const skillsDir = path.join(base, plugin, "skills");
            if (!dirExists(skillsDir)) continue;
            for (const skill of fs.readdirSync(skillsDir)) {
                const skillDir = path.join(skillsDir, skill);
                if (!dirExists(skillDir)) continue;
                const mdPath = path.join(skillDir, "SKILL.md");
                const rawContent = safeRead(mdPath);
                let stripped = rawContent;
                if (stripped.startsWith("---")) {
                    const end = stripped.indexOf("---", 3);
                    if (end !== -1) stripped = stripped.slice(end + 3);
                }
                const firstLine = stripped.split("\n").find(l => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("name:") && !l.startsWith("description:"))?.trim() ?? skill;
                const source = base === EXTERNAL_DIR ? "external" as const : "builtin" as const;
                skills.push({ name: skill, plugin, description: firstLine.slice(0, 120), path: mdPath, source, content: rawContent });
            }
        }
    }

    // Standalone skills in ~/.claude/skills/
    if (dirExists(STANDALONE_SKILLS_DIR)) {
        for (const skill of fs.readdirSync(STANDALONE_SKILLS_DIR)) {
            const skillDir = path.join(STANDALONE_SKILLS_DIR, skill);
            if (!dirExists(skillDir)) continue;
            const mdPath = path.join(skillDir, "SKILL.md");
            const rawContent = safeRead(mdPath);
            if (!rawContent) continue;
            let stripped = rawContent;
            if (stripped.startsWith("---")) {
                const end = stripped.indexOf("---", 3);
                if (end !== -1) stripped = stripped.slice(end + 3);
            }
            const firstLine = stripped.split("\n").find(l => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("name:") && !l.startsWith("description:"))?.trim() ?? skill;
            skills.push({ name: skill, plugin: "standalone", description: firstLine.slice(0, 120), path: mdPath, source: "external", content: rawContent });
        }
    }

    return skills;
}

function scanCommands(): CommandInfo[] {
    const commands: CommandInfo[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const cmdsDir = path.join(base, plugin, "commands");
            if (!dirExists(cmdsDir)) continue;
            for (const file of fs.readdirSync(cmdsDir)) {
                if (!file.endsWith(".md")) continue;
                const name = file.replace(".md", "");
                const content = safeRead(path.join(cmdsDir, file));
                const firstLine = content.split("\n").find(l => l.trim() && !l.startsWith("#") && !l.startsWith("---"))?.trim() ?? name;
                const source = base === EXTERNAL_DIR ? "external" as const : "builtin" as const;
                commands.push({ name: `/${name}`, plugin, description: firstLine.slice(0, 120), path: path.join(cmdsDir, file), content, source });
            }
        }
    }

    // Standalone commands in ~/.claude/commands/
    if (dirExists(STANDALONE_CMDS_DIR)) {
        for (const file of fs.readdirSync(STANDALONE_CMDS_DIR)) {
            if (!file.endsWith(".md")) continue;
            const name = file.replace(".md", "");
            const fp = path.join(STANDALONE_CMDS_DIR, file);
            const content = safeRead(fp);
            const firstLine = content.split("\n").find(l => l.trim() && !l.startsWith("#") && !l.startsWith("---"))?.trim() ?? name;
            commands.push({ name: `/${name}`, plugin: "standalone", description: firstLine.slice(0, 120), path: fp, content, source: "external" });
        }
    }

    return commands;
}

function scanMcp(): McpInfo[] {
    const servers: McpInfo[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const mcpPath = path.join(base, plugin, ".mcp.json");
            const data = safeJson(mcpPath);
            if (!data) continue;
            // Two formats: { mcpServers: { name: cfg } } or { name: cfg } (external)
            const mcpServers = data.mcpServers ?? data;
            for (const [name, cfg] of Object.entries(mcpServers) as [string, any][]) {
                if (typeof cfg !== "object" || cfg === null) continue;
                servers.push({
                    name,
                    type: cfg.command ? "command" : cfg.type === "sse" ? "sse" : cfg.url ? "http" : "unknown",
                    url: cfg.url,
                    command: cfg.command ? `${cfg.command} ${(cfg.args ?? []).join(" ")}`.trim() : undefined,
                    path: mcpPath,
                });
            }
        }
    }
    return servers;
}

function scanHooks(): HookInfo[] {
    const hooks: HookInfo[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const hookPath = path.join(base, plugin, "hooks", "hooks.json");
            const raw = safeJson(hookPath);
            if (!raw) continue;
            // Format: { hooks: { EventName: [{ hooks: [{ command }] }] } }
            const hooksObj = raw.hooks ?? raw;
            const events: string[] = [];
            const commands: string[] = [];
            for (const [event, handlers] of Object.entries(hooksObj) as [string, any][]) {
                if (!Array.isArray(handlers)) continue;
                events.push(event);
                for (const h of handlers) {
                    const inner = h.hooks ?? [h];
                    for (const ih of inner) {
                        if (ih.command) commands.push(ih.command);
                    }
                }
            }
            if (events.length > 0) {
                hooks.push({
                    name: raw.description ?? plugin,
                    plugin, events,
                    command: commands[0],
                    path: hookPath,
                });
            }
        }
    }
    return hooks;
}

function scanClaudeMd(): ClaudeMdInfo[] {
    const files: ClaudeMdInfo[] = [];

    // Global CLAUDE.md
    const globalMd = path.join(CLAUDE_DIR, "CLAUDE.md");
    if (fileExists(globalMd)) {
        files.push({ name: "Global CLAUDE.md", path: globalMd, content: safeRead(globalMd), scope: "global" });
    }

    // Project CLAUDE.md files - scan common project dirs
    const projectDirs = path.join(CLAUDE_DIR, "projects");
    if (dirExists(projectDirs)) {
        for (const folder of fs.readdirSync(projectDirs)) {
            const projMd = path.join(projectDirs, folder, "CLAUDE.md");
            if (fileExists(projMd)) {
                const projectPath = folder.replace(/-/g, "/");
                files.push({ name: `Project: ${projectPath}`, path: projMd, content: safeRead(projMd), scope: "project" });
            }
        }
    }

    // Also check cwd for CLAUDE.md
    const cwdMd = path.join(process.cwd(), "CLAUDE.md");
    if (fileExists(cwdMd)) {
        const already = files.some(f => f.path === cwdMd);
        if (!already) {
            files.push({ name: "This Project CLAUDE.md", path: cwdMd, content: safeRead(cwdMd), scope: "project" });
        }
    }

    return files;
}

function scanSettings(): { settings: any; localSettings: any } {
    return {
        settings: safeJson(path.join(CLAUDE_DIR, "settings.json")),
        localSettings: safeJson(path.join(CLAUDE_DIR, "settings.local.json")),
    };
}

export async function PUT(req: Request) {
    const { filePath, content } = await req.json();
    if (!filePath || typeof filePath !== "string" || typeof content !== "string") {
        return NextResponse.json({ error: "missing filePath or content" }, { status: 400 });
    }
    // Safety: only allow writing inside ~/.claude/ or project CLAUDE.md files
    const resolved = path.resolve(filePath);
    const isClaude = resolved.startsWith(CLAUDE_DIR + path.sep);
    const isClaudeMd = resolved.endsWith("CLAUDE.md");
    const isCommandMd = resolved.endsWith(".md") && resolved.includes("/commands/");
    const isHooksJson = resolved.endsWith("hooks.json") && resolved.includes("/hooks/");
    if (!isClaude && !isClaudeMd) {
        return NextResponse.json({ error: "forbidden - outside ~/.claude/" }, { status: 403 });
    }
    if (!isClaudeMd && !isCommandMd && !isHooksJson) {
        return NextResponse.json({ error: "forbidden - only CLAUDE.md, command .md, or hooks.json" }, { status: 403 });
    }
    try {
        fs.writeFileSync(resolved, content, "utf-8");
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Remote machine lookup (optional - only works if MACHINES_DB_PATH is set)
const DB_PATH = process.env.MACHINES_DB_PATH || "";

function getRemoteMachine(machineId: string): { ip: string; port: number } | null {
    if (!DB_PATH) return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require("better-sqlite3");
        const db = new Database(DB_PATH, { readonly: true });
        const row = db.prepare("SELECT ip, port FROM machines WHERE id = ?").get(machineId) as { ip: string; port: number } | undefined;
        db.close();
        return row ?? null;
    } catch {
        return null;
    }
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const machine = url.searchParams.get("machine");

    // If requesting a remote machine, proxy to its local-apps server
    const localMachineId = process.env.LOCAL_MACHINE_ID || require("os").hostname().split(".")[0];
    if (machine && machine !== localMachineId) {
        const remote = getRemoteMachine(machine);
        if (!remote) return NextResponse.json({ error: "machine not found" }, { status: 404 });
        try {
            const res = await fetch(`http://${remote.ip}:${remote.port}/api/claude/config`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return NextResponse.json({ error: "remote fetch failed" }, { status: 502 });
            const data = await res.json();
            return NextResponse.json(data);
        } catch {
            return NextResponse.json({ error: "remote unreachable" }, { status: 502 });
        }
    }

    // Local (M4)
    const plugins = scanPlugins();
    const skills = scanSkills();
    const commands = scanCommands();
    const mcp = scanMcp();
    const hooks = scanHooks();
    const claudeMd = scanClaudeMd();
    const { settings, localSettings } = scanSettings();

    return NextResponse.json({
        plugins,
        skills,
        commands,
        mcp,
        hooks,
        claudeMd,
        settings,
        localSettings,
        summary: {
            plugins: plugins.length,
            skills: skills.length,
            commands: commands.length,
            mcp: mcp.length,
            hooks: hooks.length,
            claudeMd: claudeMd.length,
        },
    });
}
