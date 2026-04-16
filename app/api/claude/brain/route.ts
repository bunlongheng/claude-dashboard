import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SITES_DIR = path.join(os.homedir(), "Sites");

function safeRead(p: string): string {
    try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}
function dirExists(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function fileStat(p: string): { mtime: string; size: number } | null {
    try { const s = fs.statSync(p); return { mtime: s.mtime.toISOString(), size: s.size }; } catch { return null; }
}

// Parse YAML-ish frontmatter from memory files
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
    const meta: Record<string, string> = {};
    let body = content;
    if (content.startsWith("---")) {
        const end = content.indexOf("---", 3);
        if (end !== -1) {
            const fm = content.slice(3, end);
            body = content.slice(end + 3).trim();
            for (const line of fm.split("\n")) {
                const match = line.match(/^(\w+):\s*(.+)/);
                if (match) meta[match[1]] = match[2].trim();
            }
        }
    }
    return { meta, body };
}

export async function GET() {
    // 1. Global CLAUDE.md
    const globalClaude = safeRead(path.join(CLAUDE_DIR, "CLAUDE.md"));

    // 2. All projects — combine claude projects + Sites dirs
    const projectFolders = dirExists(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR) : [];
    const projectNames = projectFolders.map(f => f.replace(/-/g, "/").split("/").pop() ?? f);

    // 3. Per-project data
    interface ClaudeFile {
        name: string;
        category: "memory" | "config" | "rules" | "session" | "other";
        type: string; // memory type or file type
        description: string;
        content: string;
        body: string;
        path: string;
        updatedAt: string | null;
        size: number;
    }

    interface ProjectBrain {
        name: string;
        folder: string;
        files: ClaudeFile[];
        sessionCount: number;
        memoryCount: number;
    }

    const projects: ProjectBrain[] = [];

    for (const folder of projectFolders) {
        const folderPath = path.join(PROJECTS_DIR, folder);
        if (!dirExists(folderPath)) continue;

        const name = folder.replace(/-/g, "/").split("/").pop() ?? folder;
        const files: ClaudeFile[] = [];

        // CLAUDE.md in ~/.claude/projects/<folder>/
        const claudeMdPath = path.join(folderPath, "CLAUDE.md");
        const claudeMdContent = safeRead(claudeMdPath);
        if (claudeMdContent.trim()) {
            const stat = fileStat(claudeMdPath);
            files.push({ name: "CLAUDE.md", category: "rules", type: "claude-md", description: "Project instructions (claude dir)", content: claudeMdContent, body: claudeMdContent, path: claudeMdPath, updatedAt: stat?.mtime ?? null, size: stat?.size ?? 0 });
        }

        // CLAUDE.md in ~/Sites/<name>/
        const projClaudeMdPath = path.join(SITES_DIR, name, "CLAUDE.md");
        const projClaudeMdContent = safeRead(projClaudeMdPath);
        if (projClaudeMdContent.trim()) {
            const stat = fileStat(projClaudeMdPath);
            files.push({ name: "CLAUDE.md", category: "rules", type: "claude-md", description: "Project root instructions", content: projClaudeMdContent, body: projClaudeMdContent, path: projClaudeMdPath, updatedAt: stat?.mtime ?? null, size: stat?.size ?? 0 });
        }

        // Per-project .claude/ directory files
        const dotClaudeDir = path.join(SITES_DIR, name, ".claude");
        if (dirExists(dotClaudeDir)) {
            for (const file of fs.readdirSync(dotClaudeDir)) {
                const fp = path.join(dotClaudeDir, file);
                const stat = fileStat(fp);
                if (!stat) continue;
                if (file === "settings.json" || file === "settings.local.json") {
                    const content = safeRead(fp);
                    files.push({ name: file, category: "config", type: "settings", description: "Project settings", content, body: content, path: fp, updatedAt: stat.mtime, size: stat.size });
                } else if (file === "instructions.md") {
                    const content = safeRead(fp);
                    files.push({ name: file, category: "rules", type: "instructions", description: "Project instructions", content, body: content, path: fp, updatedAt: stat.mtime, size: stat.size });
                } else if (file.endsWith(".md") || file.endsWith(".json")) {
                    const content = safeRead(fp);
                    files.push({ name: file, category: "other", type: file.split(".").pop() ?? "file", description: "", content, body: content, path: fp, updatedAt: stat.mtime, size: stat.size });
                }
            }
            // Hooks
            if (dirExists(path.join(dotClaudeDir, "hooks"))) {
                for (const f of fs.readdirSync(path.join(dotClaudeDir, "hooks"))) {
                    const fp = path.join(dotClaudeDir, "hooks", f);
                    const stat = fileStat(fp);
                    if (stat) files.push({ name: `hooks/${f}`, category: "config", type: "hooks", description: "Project hooks", content: safeRead(fp), body: "", path: fp, updatedAt: stat.mtime, size: stat.size });
                }
            }
            // Commands
            if (dirExists(path.join(dotClaudeDir, "commands"))) {
                for (const f of fs.readdirSync(path.join(dotClaudeDir, "commands"))) {
                    const fp = path.join(dotClaudeDir, "commands", f);
                    const stat = fileStat(fp);
                    if (stat) files.push({ name: `commands/${f}`, category: "config", type: "commands", description: "Project command", content: safeRead(fp), body: "", path: fp, updatedAt: stat.mtime, size: stat.size });
                }
            }
        }

        // Memory files
        const memDir = path.join(folderPath, "memory");
        let memoryCount = 0;
        if (dirExists(memDir)) {
            for (const file of fs.readdirSync(memDir).filter(f => f.endsWith(".md")).sort()) {
                const fp = path.join(memDir, file);
                const content = safeRead(fp);
                if (!content.trim()) continue;
                const { meta, body } = parseFrontmatter(content);
                const stat = fileStat(fp);
                memoryCount++;
                files.push({
                    name: meta.name || file.replace(".md", ""),
                    category: "memory",
                    type: meta.type || "unknown",
                    description: meta.description || "",
                    content, body,
                    path: fp,
                    updatedAt: stat?.mtime ?? null,
                    size: stat?.size ?? 0,
                });
            }
        }

        // Session count
        const sessions = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));

        if (files.length > 0 || sessions.length > 0) {
            projects.push({ name, folder, files, sessionCount: sessions.length, memoryCount });
        }
    }

    // 4. Projects with NO memory (gaps)
    const projectsWithoutMemory = projects.filter(p => p.memoryCount === 0 && p.sessionCount > 0).map(p => p.name);

    // 5. All file category/type counts
    const allFiles = projects.flatMap(p => p.files);
    const categoryCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const f of allFiles) {
        categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
        if (f.category === "memory") typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;
    }

    // 6. Global rules from database (optional — empty if not configured)
    type Rule = { id: string; category: string; title: string; instruction: string; confidence: number; source: string };
    let globalRules: Rule[] = [];
    try {
        globalRules = await db.query<Rule>("claude_global_instructions", {
            select: "id,category,title,instruction,confidence,source",
            orderBy: "category",
        });
    } catch {}

    return NextResponse.json({
        globalClaude,
        projects,
        projectsWithoutMemory,
        categoryCounts,
        typeCounts,
        totalFiles: allFiles.length,
        totalProjects: projects.length,
        globalRules,
    });
}
