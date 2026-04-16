import { NextResponse } from "next/server";

const DB_PATH = process.env.MACHINES_DB_PATH || "";
const LOCAL_PORT = parseInt(process.env.LOCAL_APPS_PORT || "9876", 10);
const LOCAL_MACHINE_ID = process.env.LOCAL_MACHINE_ID || require("os").hostname().split(".")[0];

function getMachineUrl(machineId: string): string | null {
    if (machineId === LOCAL_MACHINE_ID) return `http://localhost:${LOCAL_PORT}`;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (!DB_PATH) return null;
        const Database = require("better-sqlite3");
        const db = new Database(DB_PATH, { readonly: true });
        const row = db.prepare("SELECT ip, port FROM machines WHERE id = ?").get(machineId) as { ip: string; port: number } | undefined;
        db.close();
        return row ? `http://${row.ip}:${row.port}` : null;
    } catch {
        return null;
    }
}

// POST: copy a skill from one machine to another
// Body: { from: machineId, to: machineId, plugin: string, skill: string }
export async function POST(req: Request) {
    const { from, to, plugin, skill } = await req.json();

    if (!from || !to || !plugin || !skill) {
        return NextResponse.json({ error: "missing from, to, plugin, or skill" }, { status: 400 });
    }
    if (from === to) {
        return NextResponse.json({ error: "source and target are the same machine" }, { status: 400 });
    }

    const fromUrl = getMachineUrl(from);
    const toUrl = getMachineUrl(to);
    if (!fromUrl) return NextResponse.json({ error: `machine ${from} not found` }, { status: 404 });
    if (!toUrl) return NextResponse.json({ error: `machine ${to} not found` }, { status: 404 });

    // 1. Check if skill already exists on target
    try {
        const checkRes = await fetch(`${toUrl}/api/claude/skill/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (checkRes.ok) {
            return NextResponse.json({ error: `Skill "${skill}" already exists on target machine` }, { status: 409 });
        }
    } catch {
        // 404 = doesn't exist, which is what we want
    }

    // 2. Read skill from source
    let skillData: { files: Record<string, string> };
    try {
        const res = await fetch(`${fromUrl}/api/claude/skill/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return NextResponse.json({ error: "skill not found on source machine" }, { status: 404 });
        skillData = await res.json();
    } catch {
        return NextResponse.json({ error: "could not reach source machine" }, { status: 502 });
    }

    // 3. Write skill to target
    try {
        const res = await fetch(`${toUrl}/api/claude/skill/${encodeURIComponent(plugin)}/${encodeURIComponent(skill)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: skillData.files }),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json({ error: err.error ?? "write failed on target" }, { status: 502 });
        }
        return NextResponse.json({ ok: true, skill, from, to });
    } catch {
        return NextResponse.json({ error: "could not reach target machine" }, { status: 502 });
    }
}
