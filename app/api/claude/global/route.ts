import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const GLOBAL_CLAUDE_MD = path.join(CLAUDE_DIR, "CLAUDE.md");
const SITES_DIR = path.join(os.homedir(), "Sites");

function getClaudeMdPath(project?: string): string {
    if (!project || project === "global") return GLOBAL_CLAUDE_MD;

    // Try project-level CLAUDE.md first
    const projectDir = path.join(SITES_DIR, project);
    if (fs.existsSync(projectDir)) {
        return path.join(projectDir, "CLAUDE.md");
    }

    // Fallback to global
    return GLOBAL_CLAUDE_MD;
}

function appendRule(filePath: string, category: string, title: string, instruction: string) {
    try {
        const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";

        // Check if rule already exists
        if (content.includes(`**${title}**:`) || content.includes(`### ${title}`)) return;

        const sectionHeader = `## ${category.charAt(0).toUpperCase() + category.slice(1)} Rules`;
        let updated: string;

        if (content.includes(sectionHeader)) {
            const idx = content.indexOf(sectionHeader);
            const nextSection = content.indexOf("\n## ", idx + sectionHeader.length);
            const insertAt = nextSection > -1 ? nextSection : content.length;
            updated = content.slice(0, insertAt).trimEnd() + `\n- **${title}**: ${instruction}\n\n` + content.slice(insertAt);
        } else {
            updated = content.trimEnd() + `\n\n---\n\n${sectionHeader}\n\n- **${title}**: ${instruction}\n`;
        }

        fs.writeFileSync(filePath, updated, "utf-8");
    } catch { /* don't fail the API */ }
}

export async function POST(req: Request) {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const category   = String(body.category   ?? "general").trim();
    const title      = String(body.title      ?? "").trim();
    const instruction = String(body.instruction ?? "").trim();
    const source     = String(body.source     ?? "manual").trim();
    const project    = String(body.project    ?? "global").trim();

    if (!title || !instruction) {
        return NextResponse.json({ error: "title and instruction required" }, { status: 400 });
    }

    // 1. Store in database (with project scope)
    let dbResult = null;
    if (db.configured) {
        dbResult = await db.upsert(
            "claude_global_instructions",
            { category, title, instruction, source, project, confidence: 1.0, updated_at: new Date().toISOString() },
            "category,title"
        );
    }

    // 2. Append to the correct CLAUDE.md
    const claudeMdPath = getClaudeMdPath(project);
    appendRule(claudeMdPath, category, title, instruction);

    return NextResponse.json({
        rule: dbResult ?? { category, title, instruction, source, project },
        injected: true,
        file: claudeMdPath,
    }, { status: 201 });
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const project = url.searchParams.get("project");

    if (!db.configured) return NextResponse.json([]);

    const rules = await db.query("claude_global_instructions", {
        select: "id,category,title,instruction,source,project,confidence,created_at,updated_at",
        orderBy: "category",
    });

    // Filter by project if specified
    if (project) {
        const filtered = (rules as any[]).filter(r =>
            r.project === project || r.project === "global" || !r.project
        );
        return NextResponse.json(filtered);
    }

    return NextResponse.json(rules);
}
