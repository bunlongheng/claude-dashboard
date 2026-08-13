import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type ClaudeSkill = {
    name: string;
    description: string;
    path: string;
    scope: "user" | "project";
};

function parseSkillMd(filePath: string, dirName: string): { name: string; description: string } | null {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        let name = dirName;
        let description = "";

        // Try YAML frontmatter first (between leading --- markers)
        const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
        if (fmMatch) {
            const block = fmMatch[1];
            const nameLine = block.match(/^name:\s*(.+)$/m);
            const descLine = block.match(/^description:\s*(.+)$/m);
            if (nameLine) name = nameLine[1].trim().replace(/^["']|["']$/g, "");
            if (descLine) description = descLine[1].trim().replace(/^["']|["']$/g, "");
        }

        // Fall back to first heading for description if missing
        if (!description) {
            const lines = raw.split("\n");
            for (const line of lines) {
                const h = line.match(/^#\s+(.+)$/);
                if (h) {
                    description = h[1].trim();
                    break;
                }
            }
        }
        if (!description) description = `Claude skill: ${dirName}`;

        return { name, description };
    } catch {
        return null;
    }
}

function walkScope(root: string, scope: "user" | "project"): ClaudeSkill[] {
    const out: ClaudeSkill[] = [];
    try {
        if (!fs.existsSync(root)) return out;
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const skillDir = path.join(root, entry.name);
            const skillMd = path.join(skillDir, "SKILL.md");
            // If SKILL.md exists parse it for description; otherwise count the bare
            // directory anyway since `/<name>` autocomplete picks it up.
            const parsed = fs.existsSync(skillMd) ? parseSkillMd(skillMd, entry.name) : null;
            out.push({
                name: entry.name,
                description: parsed?.description || `Claude skill: ${entry.name}`,
                path: skillDir,
                scope,
            });
        }
    } catch {
        /* ignore */
    }
    return out;
}

const SKILLS_TTL_MS = 60_000;
let skillsCache: { at: number; userMtime: number; projectMtime: number; data: ClaudeSkill[] } | null = null;

function dirMtime(p: string): number {
    try {
        return fs.statSync(p).mtimeMs;
    } catch {
        return 0;
    }
}

export function listClaudeSkills(): ClaudeSkill[] {
    try {
        const userRoot = path.join(os.homedir(), ".claude", "skills");
        const projectRoot = path.join(process.cwd(), ".claude", "skills");

        const userMtime = dirMtime(userRoot);
        const projectMtime = dirMtime(projectRoot);
        const now = Date.now();
        if (
            skillsCache &&
            now - skillsCache.at < SKILLS_TTL_MS &&
            skillsCache.userMtime === userMtime &&
            skillsCache.projectMtime === projectMtime
        ) {
            return skillsCache.data;
        }

        const userSkills = walkScope(userRoot, "user");
        const projectSkills = walkScope(projectRoot, "project");

        // Project skills override user skills with the same name
        const byName = new Map<string, ClaudeSkill>();
        for (const s of userSkills) byName.set(s.name, s);
        for (const s of projectSkills) byName.set(s.name, s);
        const data = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
        skillsCache = { at: now, userMtime, projectMtime, data };
        return data;
    } catch {
        return [];
    }
}
