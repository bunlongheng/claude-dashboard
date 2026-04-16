import { db } from "@/lib/db";
import { NextResponse } from "next/server";

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

    const ok = await db.remove("claude_global_instructions", id);
    if (!ok) return NextResponse.json({ error: "Database error" }, { status: 500 });
    return new NextResponse(null, { status: 204 });
}
