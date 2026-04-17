import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_MD_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md");

function appendToClaude(category: string, title: string, instruction: string) {
    try {
        const content = fs.existsSync(CLAUDE_MD_PATH) ? fs.readFileSync(CLAUDE_MD_PATH, "utf-8") : "";

        // Check if rule already exists (by title)
        if (content.includes(`### ${title}`) || content.includes(`- ${title}:`)) return;

        // Find or create the rules section
        const sectionHeader = `## ${category.charAt(0).toUpperCase() + category.slice(1)} Rules`;
        let updated: string;

        if (content.includes(sectionHeader)) {
            // Append under existing section
            const idx = content.indexOf(sectionHeader);
            const nextSection = content.indexOf("\n## ", idx + sectionHeader.length);
            const insertAt = nextSection > -1 ? nextSection : content.length;
            updated = content.slice(0, insertAt).trimEnd() + `\n- **${title}**: ${instruction}\n\n` + content.slice(insertAt);
        } else {
            // Append new section at end
            updated = content.trimEnd() + `\n\n---\n\n${sectionHeader}\n\n- **${title}**: ${instruction}\n`;
        }

        fs.writeFileSync(CLAUDE_MD_PATH, updated, "utf-8");
    } catch { /* don't fail the API if file write fails */ }
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

    if (!title || !instruction) {
        return NextResponse.json({ error: "title and instruction required" }, { status: 400 });
    }

    // 1. Store in database (for dashboard display)
    let dbResult = null;
    if (db.configured) {
        dbResult = await db.upsert(
            "claude_global_instructions",
            { category, title, instruction, source, confidence: 1.0, updated_at: new Date().toISOString() },
            "category,title"
        );
    }

    // 2. Append to ~/.claude/CLAUDE.md (so Claude Code actually reads it)
    appendToClaude(category, title, instruction);

    return NextResponse.json({
        rule: dbResult ?? { category, title, instruction, source },
        injected: true,
    }, { status: 201 });
}
