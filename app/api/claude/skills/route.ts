import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { safeRead } from "@/lib/safe-read";
import { openMachinesDb, localMachineId as sharedLocalMachineId } from "@/lib/machines-db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireSameSite } from "@/lib/route-guard";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const MARKETPLACE_DIR = path.join(CLAUDE_DIR, "plugins", "marketplaces", "claude-plugins-official");
const PLUGINS_DIR = path.join(MARKETPLACE_DIR, "plugins");
const STANDALONE_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const STANDALONE_CMDS_DIR = path.join(CLAUDE_DIR, "commands");
const EXTERNAL_DIR = path.join(MARKETPLACE_DIR, "external_plugins");

// Local-scan response cache, keyed by slim flag. ~/.claude config rarely changes,
// but this route is fetched by 6 sections (Overview, Commands, Global, Mcp, Skills),
// each re-scanning + serializing ~1 MB. Short TTL keeps navigation snappy.
const SCAN_TTL_MS = 15_000;
const scanCache = new Map<string, { at: number; data: unknown }>();

function safeStatBirthtime(p: string): string | null {
    try { return fs.statSync(p).birthtime.toISOString(); } catch { return null; }
}
function safeJson<T = unknown>(p: string): T | null {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T; } catch { return null; }
}
function dirExists(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function fileExists(p: string): boolean {
    try { return fs.statSync(p).isFile(); } catch { return false; }
}

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type SkillInfo = { name: string; plugin: string; description: string; path: string; source: "builtin" | "external"; content: string; createdAt?: string | null };
type CommandInfo = { name: string; plugin: string; description: string; path: string; content: string; source: "builtin" | "external" };
type McpInfo = { name: string; type: string; url?: string; command?: string; path: string; createdAt?: string | null; source?: "user" | "plugin" };
type HookInfo = { name: string; plugin: string; events: string[]; command?: string; path: string };
type ClaudeMdInfo = { name: string; path: string; content: string; scope: "global" | "project" };

interface PluginManifest {
    name?: string;
    description?: string;
}

function scanPlugins(): PluginInfo[] {
    const plugins: PluginInfo[] = [];

    // Built-in plugins
    if (dirExists(PLUGINS_DIR)) {
        for (const name of fs.readdirSync(PLUGINS_DIR)) {
            const dir = path.join(PLUGINS_DIR, name);
            if (!dirExists(dir)) continue;
            const manifest = safeJson<PluginManifest>(path.join(dir, "plugin.json")) ?? safeJson<PluginManifest>(path.join(dir, "manifest.json"));
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
            const manifest = safeJson<PluginManifest>(path.join(dir, "plugin.json")) ?? safeJson<PluginManifest>(path.join(dir, "manifest.json"));
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
                const createdAt = safeStatBirthtime(mdPath);
                skills.push({ name: skill, plugin, description: firstLine.slice(0, 120), path: mdPath, source, content: rawContent, createdAt });
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
            const createdAt = safeStatBirthtime(mdPath);
            skills.push({ name: skill, plugin: "standalone", description: firstLine.slice(0, 120), path: mdPath, source: "external", content: rawContent, createdAt });
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

interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    type?: string;
}
type McpServerMap = Record<string, McpServerConfig>;
interface ClaudeGlobalConfig {
    mcpServers?: McpServerMap;
    projects?: Record<string, { mcpServers?: McpServerMap }>;
}

// .mcp.json files may either wrap servers under "mcpServers" or list them flat
// at the root - accept both without assuming which one a given file uses.
function toMcpServerMap(data: unknown): McpServerMap {
    if (data && typeof data === "object") {
        const obj = data as { mcpServers?: unknown };
        if (obj.mcpServers && typeof obj.mcpServers === "object") {
            return obj.mcpServers as McpServerMap;
        }
        return data as McpServerMap;
    }
    return {};
}

function scanMcp(): McpInfo[] {
    const servers: McpInfo[] = [];
    const seen = new Set<string>();
    const addServer = (name: string, cfg: McpServerConfig, src: string, source: "user" | "plugin") => {
        if (typeof cfg !== "object" || cfg === null || seen.has(name)) return;
        seen.add(name);
        // "Created" = birthtime of the server's backing script (the path-like arg
        // ending in .ts/.js/.mjs/.py). Best available signal of when it was added.
        const scriptArg = (cfg.args ?? []).find((a) => typeof a === "string" && /\.(ts|js|mjs|py)$/.test(a));
        const createdAt = scriptArg ? safeStatBirthtime(scriptArg) : null;
        servers.push({
            name,
            type: cfg.command ? "command" : cfg.type === "sse" ? "sse" : cfg.url ? "http" : "unknown",
            url: cfg.url,
            command: cfg.command ? `${cfg.command} ${(cfg.args ?? []).join(" ")}`.trim() : undefined,
            path: src,
            createdAt,
            source,
        });
    };

    // 1. Root .mcp.json (user's personal MCP servers)
    const rootMcpPath = path.join(CLAUDE_DIR, ".mcp.json");
    const rootData = safeJson(rootMcpPath);
    if (rootData) {
        const mcpServers = toMcpServerMap(rootData);
        for (const [name, cfg] of Object.entries(mcpServers)) addServer(name, cfg, rootMcpPath, "user");
    }

    // 2. Global ~/.claude.json - top-level mcpServers + per-project mcpServers
    const globalPath = path.join(HOME, ".claude.json");
    const globalData = safeJson<ClaudeGlobalConfig>(globalPath);
    if (globalData) {
        for (const [name, cfg] of Object.entries(globalData.mcpServers ?? {})) addServer(name, cfg, globalPath, "user");
        for (const pd of Object.values(globalData.projects ?? {})) {
            for (const [name, cfg] of Object.entries(pd?.mcpServers ?? {})) addServer(name, cfg, globalPath, "user");
        }
    }

    // 3. Plugin .mcp.json files (shipped with installed plugins)
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const mcpPath = path.join(base, plugin, ".mcp.json");
            const data = safeJson(mcpPath);
            if (!data) continue;
            const mcpServers = toMcpServerMap(data);
            for (const [name, cfg] of Object.entries(mcpServers)) addServer(name, cfg, mcpPath, "plugin");
        }
    }
    return servers;
}

interface HookCommandEntry {
    command?: string;
}
interface HookHandlerGroup extends HookCommandEntry {
    hooks?: HookCommandEntry[];
}

function scanHooks(): HookInfo[] {
    const hooks: HookInfo[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const hookPath = path.join(base, plugin, "hooks", "hooks.json");
            const raw = safeJson(hookPath);
            if (!raw || typeof raw !== "object") continue;
            const rawRecord = raw as Record<string, unknown>;
            // Format: { hooks: { EventName: [{ hooks: [{ command }] }] } }
            const hooksObj = (rawRecord.hooks && typeof rawRecord.hooks === "object")
                ? (rawRecord.hooks as Record<string, HookHandlerGroup[]>)
                : (rawRecord as Record<string, HookHandlerGroup[]>);
            const description = typeof rawRecord.description === "string" ? rawRecord.description : undefined;
            const events: string[] = [];
            const commands: string[] = [];
            for (const [event, handlers] of Object.entries(hooksObj)) {
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
                    name: description ?? plugin,
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

function scanSettings(): { settings: unknown; localSettings: unknown } {
    return {
        settings: safeJson(path.join(CLAUDE_DIR, "settings.json")),
        localSettings: safeJson(path.join(CLAUDE_DIR, "settings.local.json")),
    };
}

export const PUT = withErrorHandler(async (req: Request) => {
    const denied = requireSameSite(req);
    if (denied) return denied;
    const { filePath, content } = await req.json();
    if (!filePath || typeof filePath !== "string" || typeof content !== "string") {
        return NextResponse.json({ error: "missing filePath or content" }, { status: 400 });
    }
    // Safety: only allow writing inside ~/.claude/ or project CLAUDE.md files
    const resolved = path.resolve(filePath);
    const isClaude = resolved.startsWith(CLAUDE_DIR + path.sep);
    // Project CLAUDE.md: only the one GET lists (this repo's cwd), never any path on disk
    const isClaudeMd = resolved.endsWith("CLAUDE.md") && (isClaude || resolved === path.join(process.cwd(), "CLAUDE.md"));
    const isCommandMd = resolved.endsWith(".md") && resolved.includes("/commands/");
    const isHooksJson = resolved.endsWith("hooks.json") && resolved.includes("/hooks/");
    if (!isClaude && !isClaudeMd) {
        return NextResponse.json({ error: "forbidden - outside ~/.claude/" }, { status: 403 });
    }
    if (!isClaudeMd && !isCommandMd && !isHooksJson) {
        return NextResponse.json({ error: "forbidden - only CLAUDE.md, command .md, or hooks.json" }, { status: 403 });
    }
    try {
        if (fs.lstatSync(resolved).isSymbolicLink()) {
            return NextResponse.json({ error: "forbidden - symlink target" }, { status: 403 });
        }
    } catch { /* new file */ }
    try {
        fs.writeFileSync(resolved, content, "utf-8");
        scanCache.clear(); // edited config must show on the next GET, not after TTL
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
});

function getRemoteMachine(machineId: string): { ip: string; port: number } | null {
    const db = openMachinesDb();
    if (!db) return null;
    try {
        const row = db.prepare("SELECT ip, port FROM machines WHERE id = ?").get(machineId) as { ip: string; port: number } | undefined;
        return row ?? null;
    } catch {
        return null;
    } finally {
        db.close();
    }
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const machine = url.searchParams.get("machine");

    // If requesting a remote machine, proxy to the peer dashboard's own skills
    // route (same peer model as sessions and /api/proxy), forwarding slim/path.
    const localMachineId = sharedLocalMachineId();
    if (machine && machine !== localMachineId) {
        const remote = getRemoteMachine(machine);
        if (!remote) return NextResponse.json({ error: "machine not found" }, { status: 404 });
        const remoteUrl = new URL(`http://${remote.ip}:${remote.port}/api/claude/skills`);
        url.searchParams.forEach((v, k) => { if (k !== "machine") remoteUrl.searchParams.set(k, v); });
        try {
            const res = await fetch(remoteUrl, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return NextResponse.json({ error: "remote fetch failed" }, { status: 502 });
            const data = await res.json();
            return NextResponse.json(data);
        } catch {
            return NextResponse.json({ error: "remote unreachable" }, { status: 502 });
        }
    }

    // Single-file content fetch: ?path=/abs/path/to/SKILL.md returns { content }.
    // Used by SkillModal to lazy-load the markdown stripped by slim=1.
    const reqPath = url.searchParams.get("path");
    if (reqPath) {
        const resolved = path.resolve(reqPath);
        const inClaude = resolved.startsWith(CLAUDE_DIR + path.sep);
        if (!inClaude || !resolved.endsWith(".md")) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }
        if (!fs.existsSync(resolved)) {
            return NextResponse.json({ error: "not found", content: "" }, { status: 404 });
        }
        try {
            const content = fs.readFileSync(resolved, "utf-8");
            return NextResponse.json({ content });
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : String(e), content: "" }, { status: 500 });
        }
    }

    // Local (M4)
    const slim = url.searchParams.get("slim") === "1";

    const cacheKey = slim ? "slim" : "full";
    const nowMs = Date.now();
    const hit = scanCache.get(cacheKey);
    if (hit && nowMs - hit.at < SCAN_TTL_MS) {
        return NextResponse.json(hit.data, { headers: { "Cache-Control": "public, max-age=15" } });
    }

    const plugins = scanPlugins();
    const skills = scanSkills();
    const commands = scanCommands();
    const mcp = scanMcp();
    const hooks = scanHooks();
    const claudeMd = scanClaudeMd();
    const { settings, localSettings } = scanSettings();

    // Total individual settings = every leaf value across settings.json + settings.local.json
    // (e.g. each permission rule, each hook, each flag), not just top-level keys.
    const countLeaves = (o: unknown): number => {
        if (Array.isArray(o)) return o.reduce((n: number, v) => n + countLeaves(v), 0);
        if (o && typeof o === "object") return Object.values(o as Record<string, unknown>).reduce((n: number, v) => n + countLeaves(v), 0);
        return 1;
    };
    const settingsCount = (settings ? countLeaves(settings) : 0) + (localSettings ? countLeaves(localSettings) : 0);

    // Slim mode: strip content to reduce payload (~600KB -> ~30KB)
    const strip = <T extends object>(items: T[]) =>
        items.map((item) => {
            const { content, ...rest } = item as T & { content?: unknown };
            void content;
            return rest;
        });

    const payload = {
        plugins: slim ? strip(plugins) : plugins,
        skills: slim ? strip(skills) : skills,
        commands: slim ? strip(commands) : commands,
        mcp,
        hooks,
        claudeMd: slim ? strip(claudeMd) : claudeMd,
        settings: slim ? undefined : settings,
        localSettings: slim ? undefined : localSettings,
        summary: {
            plugins: plugins.length,
            skills: skills.length,
            commands: commands.length,
            mcp: mcp.length,
            hooks: hooks.length,
            claudeMd: claudeMd.length,
            settings: settingsCount,
        },
    };
    scanCache.set(cacheKey, { at: nowMs, data: payload });
    return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=15" } });
}) as (req: Request) => Promise<Response>;
