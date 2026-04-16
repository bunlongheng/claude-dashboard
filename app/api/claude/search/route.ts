import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const MARKETPLACE_DIR = path.join(CLAUDE_DIR, "plugins", "marketplaces", "claude-plugins-official");
const PLUGINS_DIR = path.join(MARKETPLACE_DIR, "plugins");
const EXTERNAL_DIR = path.join(MARKETPLACE_DIR, "external_plugins");
const STANDALONE_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");
const STANDALONE_CMDS_DIR = path.join(CLAUDE_DIR, "commands");
const SITES_DIR = path.join(HOME, "Sites");

const LIMIT = 5;

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

type Result = { title: string; description: string; path: string; type: string };

function matches(text: string, q: string): boolean {
    return text.toLowerCase().includes(q);
}

function snippet(content: string, maxLen = 100): string {
    const clean = content.replace(/\s+/g, " ").trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + "..." : clean;
}

function searchSessions(q: string): Result[] {
    const results: Result[] = [];
    if (!dirExists(PROJECTS_DIR)) return results;
    for (const folder of fs.readdirSync(PROJECTS_DIR)) {
        const folderPath = path.join(PROJECTS_DIR, folder);
        if (!dirExists(folderPath)) continue;
        const projectName = folder.replace(/-/g, "/").split("/").pop() ?? folder;
        for (const file of fs.readdirSync(folderPath)) {
            if (!file.endsWith(".jsonl")) continue;
            if (matches(file, q) || matches(projectName, q)) {
                results.push({
                    title: file.replace(".jsonl", ""),
                    description: `Session in ${projectName}`,
                    path: `/sessions`,
                    type: "sessions",
                });
                if (results.length >= LIMIT) return results;
            }
        }
    }
    return results;
}

function searchMemory(q: string): Result[] {
    const results: Result[] = [];
    if (!dirExists(PROJECTS_DIR)) return results;
    for (const folder of fs.readdirSync(PROJECTS_DIR)) {
        const memDir = path.join(PROJECTS_DIR, folder, "memory");
        if (!dirExists(memDir)) continue;
        const projectName = folder.replace(/-/g, "/").split("/").pop() ?? folder;
        for (const file of fs.readdirSync(memDir).filter(f => f.endsWith(".md"))) {
            const content = safeRead(path.join(memDir, file));
            if (matches(file, q) || matches(content, q)) {
                results.push({
                    title: file.replace(".md", ""),
                    description: snippet(content),
                    path: `/brain`,
                    type: "memory",
                });
                if (results.length >= LIMIT) return results;
            }
        }
    }
    return results;
}

function searchClaudeMd(q: string): Result[] {
    const results: Result[] = [];
    // Global CLAUDE.md
    const globalPath = path.join(CLAUDE_DIR, "CLAUDE.md");
    if (fileExists(globalPath)) {
        const content = safeRead(globalPath);
        if (matches("CLAUDE.md", q) || matches(content, q)) {
            results.push({ title: "Global CLAUDE.md", description: snippet(content), path: `/global`, type: "claudemd" });
        }
    }
    // Project CLAUDE.md
    if (dirExists(PROJECTS_DIR)) {
        for (const folder of fs.readdirSync(PROJECTS_DIR)) {
            if (results.length >= LIMIT) break;
            const mdPath = path.join(PROJECTS_DIR, folder, "CLAUDE.md");
            if (!fileExists(mdPath)) continue;
            const content = safeRead(mdPath);
            const projectName = folder.replace(/-/g, "/").split("/").pop() ?? folder;
            if (matches(projectName, q) || matches(content, q)) {
                results.push({ title: `${projectName} CLAUDE.md`, description: snippet(content), path: `/global`, type: "claudemd" });
            }
        }
    }
    return results.slice(0, LIMIT);
}

function searchSkills(q: string): Result[] {
    const results: Result[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const skillsDir = path.join(base, plugin, "skills");
            if (!dirExists(skillsDir)) continue;
            for (const skill of fs.readdirSync(skillsDir)) {
                if (results.length >= LIMIT) return results;
                const mdPath = path.join(skillsDir, skill, "SKILL.md");
                const content = safeRead(mdPath);
                if (matches(skill, q) || matches(content, q)) {
                    results.push({ title: skill, description: snippet(content), path: `/skills`, type: "skills" });
                }
            }
        }
    }
    // Standalone skills
    if (dirExists(STANDALONE_SKILLS_DIR)) {
        for (const skill of fs.readdirSync(STANDALONE_SKILLS_DIR)) {
            if (results.length >= LIMIT) break;
            const mdPath = path.join(STANDALONE_SKILLS_DIR, skill, "SKILL.md");
            const content = safeRead(mdPath);
            if (matches(skill, q) || matches(content, q)) {
                results.push({ title: skill, description: snippet(content), path: `/skills`, type: "skills" });
            }
        }
    }
    return results;
}

function searchCommands(q: string): Result[] {
    const results: Result[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            const cmdsDir = path.join(base, plugin, "commands");
            if (!dirExists(cmdsDir)) continue;
            for (const file of fs.readdirSync(cmdsDir).filter(f => f.endsWith(".md"))) {
                if (results.length >= LIMIT) return results;
                const name = file.replace(".md", "");
                const content = safeRead(path.join(cmdsDir, file));
                if (matches(name, q) || matches(content, q)) {
                    results.push({ title: `/${name}`, description: snippet(content), path: `/commands`, type: "commands" });
                }
            }
        }
    }
    // Standalone commands
    if (dirExists(STANDALONE_CMDS_DIR)) {
        for (const file of fs.readdirSync(STANDALONE_CMDS_DIR).filter(f => f.endsWith(".md"))) {
            if (results.length >= LIMIT) break;
            const name = file.replace(".md", "");
            const content = safeRead(path.join(STANDALONE_CMDS_DIR, file));
            if (matches(name, q) || matches(content, q)) {
                results.push({ title: `/${name}`, description: snippet(content), path: `/commands`, type: "commands" });
            }
        }
    }
    return results;
}

function searchHooks(q: string): Result[] {
    const results: Result[] = [];
    const dirs = [PLUGINS_DIR, EXTERNAL_DIR];
    for (const base of dirs) {
        if (!dirExists(base)) continue;
        for (const plugin of fs.readdirSync(base)) {
            if (results.length >= LIMIT) return results;
            const hookPath = path.join(base, plugin, "hooks", "hooks.json");
            const raw = safeJson(hookPath);
            if (!raw) continue;
            const hooksObj = raw.hooks ?? raw;
            const events = Object.keys(hooksObj);
            const hookName = raw.description ?? plugin;
            if (matches(hookName, q) || matches(plugin, q) || events.some(e => matches(e, q))) {
                results.push({ title: hookName, description: `Events: ${events.join(", ")}`, path: `/hooks`, type: "hooks" });
            }
        }
    }
    return results;
}

function searchSettings(q: string): Result[] {
    const results: Result[] = [];
    const files = [
        { name: "Global settings.json", fp: path.join(CLAUDE_DIR, "settings.json") },
        { name: "Global settings.local.json", fp: path.join(CLAUDE_DIR, "settings.local.json") },
    ];
    for (const { name, fp } of files) {
        const data = safeJson(fp);
        if (!data) continue;
        const keys = Object.keys(data);
        if (matches(name, q) || keys.some(k => matches(k, q))) {
            const matchedKeys = keys.filter(k => matches(k, q));
            results.push({
                title: name,
                description: matchedKeys.length > 0 ? `Keys: ${matchedKeys.join(", ")}` : `${keys.length} keys`,
                path: `/settings`,
                type: "settings",
            });
        }
        if (results.length >= LIMIT) break;
    }
    // Project settings
    if (dirExists(SITES_DIR)) {
        for (const proj of fs.readdirSync(SITES_DIR)) {
            if (results.length >= LIMIT) break;
            const claudeDir = path.join(SITES_DIR, proj, ".claude");
            if (!dirExists(claudeDir)) continue;
            const settings = safeJson(path.join(claudeDir, "settings.json"));
            if (!settings) continue;
            const keys = Object.keys(settings);
            if (matches(proj, q) || keys.some(k => matches(k, q))) {
                results.push({
                    title: `${proj} settings`,
                    description: `${keys.length} keys`,
                    path: `/settings`,
                    type: "settings",
                });
            }
        }
    }
    return results.slice(0, LIMIT);
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();

    if (!q || q.length < 2) {
        return NextResponse.json({ sessions: [], memory: [], claudemd: [], skills: [], commands: [], hooks: [], settings: [] });
    }

    const [sessions, memory, claudemd, skills, commands, hooks, settings] = await Promise.all([
        Promise.resolve(searchSessions(q)),
        Promise.resolve(searchMemory(q)),
        Promise.resolve(searchClaudeMd(q)),
        Promise.resolve(searchSkills(q)),
        Promise.resolve(searchCommands(q)),
        Promise.resolve(searchHooks(q)),
        Promise.resolve(searchSettings(q)),
    ]);

    return NextResponse.json({ sessions, memory, claudemd, skills, commands, hooks, settings });
}
