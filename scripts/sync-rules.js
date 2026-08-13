#!/usr/bin/env node
// Sync rules from ~/.claude/projects memory files into SQLite
// and generate per-project CLAUDE.md files with injected rules.
//
// Usage:
//   node scripts/sync-rules.js                  # Sync all projects
//   node scripts/sync-rules.js stickies         # Sync one project
//   node scripts/sync-rules.js --pull stickies  # Pull rules from DB into CLAUDE.md

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(os.homedir(), ".claude", "dashboard.db");
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const SITES_DIR = path.join(os.homedir(), "Sites");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure project column exists
try { db.exec('ALTER TABLE claude_global_instructions ADD COLUMN project TEXT DEFAULT "global"'); } catch {}

const insertRule = db.prepare(`
    INSERT OR REPLACE INTO claude_global_instructions
    (id, category, title, instruction, source, project, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1.0, datetime('now'))
`);

function parseFrontmatter(content) {
    const meta = {};
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

function folderToProject(folder) {
    const parts = folder.replace(/^-/, "").split("-");
    return parts[parts.length - 1] || folder;
}

// ── PUSH: Read memory files -> store in DB ──
function pushProject(projectName) {
    const folders = fs.readdirSync(PROJECTS_DIR).filter(f => {
        const name = folderToProject(f);
        return projectName ? name === projectName : true;
    });

    let total = 0;
    for (const folder of folders) {
        const project = folderToProject(folder);
        const memDir = path.join(PROJECTS_DIR, folder, "memory");
        if (!fs.existsSync(memDir)) continue;

        const files = fs.readdirSync(memDir).filter(f => f.endsWith(".md") && f !== "MEMORY.md");
        for (const file of files) {
            const content = fs.readFileSync(path.join(memDir, file), "utf-8");
            const { meta, body } = parseFrontmatter(content);

            const id = `${project}-${file.replace(".md", "")}`;
            const category = meta.type || "general";
            const title = meta.name || file.replace(".md", "");
            const instruction = body || content;
            const source = "memory";

            insertRule.run(id, category, title, instruction, source, project);
            total++;
        }
        console.log(`  ${project}: ${files.length} rules stored`);
    }
    console.log(`\nTotal: ${total} rules pushed to DB`);
}

// ── PULL: Read from DB -> write to CLAUDE.md ──
function pullProject(projectName) {
    const rules = db.prepare(
        "SELECT category, title, instruction FROM claude_global_instructions WHERE project = ? ORDER BY category, title"
    ).all(projectName);

    if (rules.length === 0) {
        console.log(`  No rules found for project: ${projectName}`);
        return;
    }

    // Global rules go to ~/.claude/CLAUDE.md, project rules go to ~/Sites/<project>/CLAUDE.md
    const claudeMdPath = projectName === "global"
        ? path.join(os.homedir(), ".claude", "CLAUDE.md")
        : path.join(SITES_DIR, projectName, "CLAUDE.md");

    const projectDir = path.dirname(claudeMdPath);
    if (!fs.existsSync(projectDir)) {
        console.log(`  Directory not found: ${projectDir}`);
        return;
    }

    // Read existing CLAUDE.md or start fresh
    let existing = "";
    if (fs.existsSync(claudeMdPath)) {
        existing = fs.readFileSync(claudeMdPath, "utf-8");
    }

    // Check if rules section already exists
    const MARKER_START = "<!-- AUTO-RULES START -->";
    const MARKER_END = "<!-- AUTO-RULES END -->";

    // Build rules section
    const grouped = {};
    for (const r of rules) {
        const cat = r.category || "general";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(r);
    }

    let rulesSection = `${MARKER_START}\n\n## Auto-Injected Rules\n\n`;
    rulesSection += `> ${rules.length} rules synced from Claude Dashboard\n\n`;

    for (const [cat, items] of Object.entries(grouped)) {
        rulesSection += `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n\n`;
        for (const r of items) {
            const short = r.instruction.split("\n")[0].slice(0, 200);
            rulesSection += `- **${r.title}**: ${short}\n`;
        }
        rulesSection += "\n";
    }
    rulesSection += MARKER_END;

    // Replace or append
    let updated;
    if (existing.includes(MARKER_START)) {
        const start = existing.indexOf(MARKER_START);
        const end = existing.indexOf(MARKER_END) + MARKER_END.length;
        updated = existing.slice(0, start) + rulesSection + existing.slice(end);
    } else if (existing) {
        updated = existing.trimEnd() + "\n\n---\n\n" + rulesSection + "\n";
    } else {
        updated = `# ${projectName.charAt(0).toUpperCase() + projectName.slice(1)} - Project Rules\n\n${rulesSection}\n`;
    }

    fs.writeFileSync(claudeMdPath, updated, "utf-8");
    console.log(`  ${projectName}: ${rules.length} rules written to ${claudeMdPath}`);
}

// ── Main ──
const args = process.argv.slice(2);
const isPull = args.includes("--pull");
const projectArg = args.filter(a => !a.startsWith("--"))[0];

if (isPull) {
    console.log(`\n=== PULL: DB -> CLAUDE.md ===\n`);
    if (projectArg) {
        pullProject(projectArg);
    } else {
        // Pull all projects that have rules
        const projects = db.prepare("SELECT DISTINCT project FROM claude_global_instructions WHERE project != 'global'").all();
        for (const p of projects) {
            pullProject(p.project);
        }
    }
} else {
    console.log(`\n=== PUSH: Memory files -> DB ===\n`);
    pushProject(projectArg);

    if (projectArg) {
        console.log(`\n=== PULL: DB -> CLAUDE.md ===\n`);
        pullProject(projectArg);
    }
}

db.close();
console.log("\nDone.");
