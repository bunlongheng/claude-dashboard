import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_MD_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md");

function removeFromClaude(title: string) {
    try {
        if (!fs.existsSync(CLAUDE_MD_PATH)) return;
        const content = fs.readFileSync(CLAUDE_MD_PATH, "utf-8");
        // Remove the line containing this rule
        const lines = content.split("\n");
        const filtered = lines.filter(line => !line.includes(`**${title}**:`));
        const updated = filtered.join("\n");
        if (updated !== content) {
            fs.writeFileSync(CLAUDE_MD_PATH, updated, "utf-8");
        }
    } catch { /* don't fail */ }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!db.configured) return NextResponse.json({ error: "Database not configured" }, { status: 501 });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const allowed = ["category", "title", "instruction", "source"];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
        if (key in body) updates[key] = body[key];
    }

    const data = await db.update("claude_global_instructions", id, updates);
    if (!data) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ rule: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!db.configured) return NextResponse.json({ error: "Database not configured" }, { status: 501 });

    // Get the rule title before deleting (to remove from CLAUDE.md)
    const rules = await db.query<{ title: string }>("claude_global_instructions", { select: "title" });
    const rule = rules.find((r: any) => r.id === id);

    const ok = await db.remove("claude_global_instructions", id);
    if (!ok) return NextResponse.json({ error: "Database error" }, { status: 500 });

    // Remove from CLAUDE.md
    if (rule?.title) removeFromClaude(rule.title);

    return new NextResponse(null, { status: 204 });
}
