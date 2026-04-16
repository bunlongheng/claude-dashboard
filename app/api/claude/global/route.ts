import { db } from "@/lib/db";
import { NextResponse } from "next/server";

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

    if (!db.configured) return NextResponse.json({ error: "Database not configured" }, { status: 501 });

    const data = await db.upsert(
        "claude_global_instructions",
        { category, title, instruction, source, confidence: 1.0, updated_at: new Date().toISOString() },
        "category,title"
    );

    if (!data) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return NextResponse.json({ rule: data }, { status: 201 });
}
