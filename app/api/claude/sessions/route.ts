import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { isRealRepo } from "@/lib/project-utils";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const STALE_DAYS = 7;

function folderToPath(folder: string): string {
    // "-Users-alice-Sites-myapp" → "/Users/alice/Sites/myapp"
    return folder.replace(/-/g, "/");
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Read only the first N bytes of a file - avoids loading multi-MB files into RAM
function readFirstBytes(filePath: string, maxBytes = 12_288): string {
    let fd = -1;
    try {
        fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(maxBytes);
        const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
        return buf.subarray(0, bytesRead).toString("utf-8");
    } catch { return ""; }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch {} }
}

// Single-pass over first ~12 KB: extract title, first message, created timestamp
function parseSessionFast(filePath: string): {
    customTitle: string | null;
    firstMessage: string;
    createdAt: string;
} {
    let customTitle: string | null = null;
    let firstMessage = "";
    let createdAt = "";
    try {
        const chunk = readFirstBytes(filePath, 12_288);
        // Drop the last (potentially truncated) line
        const lines = chunk.split("\n").filter(Boolean);
        if (lines.length > 1) lines.pop();
        for (const line of lines) {
            try {
                const d = JSON.parse(line);
                if (!createdAt && d.timestamp) createdAt = d.timestamp;
                if (d.type === "custom-title" && d.customTitle) customTitle = d.customTitle;
                if (!firstMessage && d.type === "user") {
                    const c = d.message?.content;
                    const text = typeof c === "string" ? c
                        : Array.isArray(c) ? (c.find((x: { type: string }) => x.type === "text")?.text ?? "") : "";
                    if (text.trim()) firstMessage = text.slice(0, 120);
                }
                if (createdAt && firstMessage) break; // got everything we need
            } catch { /* skip malformed line */ }
        }
    } catch { /* skip unreadable file */ }
    if (!createdAt) {
        try { createdAt = fs.statSync(filePath).birthtime.toISOString(); } catch { createdAt = new Date().toISOString(); }
    }
    return { customTitle, firstMessage, createdAt };
}

export async function DELETE(req: Request) {
    const { filePath } = await req.json();
    if (!filePath || typeof filePath !== "string") {
        return NextResponse.json({ error: "missing filePath" }, { status: 400 });
    }
    // Safety: must be inside ~/.claude/projects/
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(CLAUDE_DIR + path.sep)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!resolved.endsWith(".jsonl")) {
        return NextResponse.json({ error: "only .jsonl files can be deleted" }, { status: 400 });
    }
    if (!fs.existsSync(resolved)) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    fs.unlinkSync(resolved);
    return NextResponse.json({ ok: true });
}

// Remote machines (optional - only if MACHINES_DB_PATH is set)
const DB_PATH = process.env.MACHINES_DB_PATH || "";

interface RemoteMachine { id: string; hostname: string; ip: string; port: number }

function getRemoteMachines(): RemoteMachine[] {
    if (!DB_PATH) return [];
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require("better-sqlite3");
        const db = new Database(DB_PATH, { readonly: true });
        const rows = db.prepare("SELECT id, hostname, ip, port FROM machines").all() as RemoteMachine[];
        db.close();
        return rows;
    } catch {
        return [];
    }
}

async function fetchRemoteSessions(machine: RemoteMachine): Promise<{ machine: string; projects: ProjectData[] }> {
    try {
        const res = await fetch(`http://${machine.ip}:${machine.port}/api/claude/sessions`, {
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return { machine: machine.id, projects: [] };
        const data = await res.json();
        // Add machine tag + sizeLabel to each session
        const projects = (data.projects ?? []).map((p: ProjectData) => ({
            ...p,
            machine: machine.id,
            sessions: p.sessions.map((s: SessionData) => ({
                ...s,
                machine: machine.id,
                sizeLabel: s.sizeLabel || formatBytes(s.sizeBytes || 0),
                lines: s.lines ?? 0,
            })),
        }));
        return { machine: machine.id, projects };
    } catch {
        return { machine: machine.id, projects: [] };
    }
}

interface SessionData {
    id: string; filePath: string; sizeBytes: number; sizeLabel?: string;
    lines?: number; customTitle: string | null; title: string;
    createdAt: string; updatedAt: string; stale: boolean; machine?: string;
}
interface ProjectData {
    project: string; path: string; sessions: SessionData[]; machine?: string;
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const machineFilter = url.searchParams.get("machine");

    const localMachineId = process.env.LOCAL_MACHINE_ID || require("os").hostname().split(".")[0];
    // Local sessions
    const localProjects: ProjectData[] = [];
    if (!machineFilter || machineFilter === localMachineId) {
        if (fs.existsSync(CLAUDE_DIR)) {
            for (const folder of fs.readdirSync(CLAUDE_DIR)) {
                const folderPath = path.join(CLAUDE_DIR, folder);
                try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }
                if (!isRealRepo(folder)) continue;

                const sessions: SessionData[] = [];
                for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
                    const filePath = path.join(folderPath, file);
                    const stat = fs.statSync(filePath);
                    const parsed = parseSessionFast(filePath);
                    sessions.push({
                        id: file.replace(".jsonl", ""),
                        filePath,
                        sizeBytes: stat.size,
                        sizeLabel: formatBytes(stat.size),
                        lines: 0,
                        customTitle: parsed.customTitle,
                        title: parsed.firstMessage,
                        createdAt: parsed.createdAt,
                        updatedAt: stat.mtime.toISOString(),
                        stale: (Date.now() - stat.mtime.getTime()) / 86400000 > STALE_DAYS,
                        machine: localMachineId,
                    });
                }
                sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                if (sessions.length > 0) {
                    localProjects.push({ project: folder, path: folderToPath(folder), sessions, machine: localMachineId });
                }
            }
        }
    }

    // Remote sessions (other machines from local.db)
    const remoteMachines = getRemoteMachines();
    const remoteResults = await Promise.all(
        remoteMachines
            .filter(m => !machineFilter || machineFilter === m.id)
            .map(m => fetchRemoteSessions(m))
    );

    // Merge all projects
    const allProjects = [...localProjects, ...remoteResults.flatMap(r => r.projects)];
    allProjects.sort((a, b) =>
        new Date(b.sessions[0]?.updatedAt ?? 0).getTime() -
        new Date(a.sessions[0]?.updatedAt ?? 0).getTime()
    );

    return NextResponse.json({ projects: allProjects });
}
