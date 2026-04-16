import { db } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HISTORY_LIMIT = 500;
const TIMEOUT_MS = 4000;

export function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
    ]);
}

export function readHistory(): { entries: any[]; total: number } {
    try {
        const p = path.join(os.homedir(), ".claude", "history.jsonl");
        const raw = fs.readFileSync(p, "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        const entries = lines
            .slice(-HISTORY_LIMIT)
            .reverse()
            .map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
        return { entries, total: lines.length };
    } catch {
        return { entries: [], total: 0 };
    }
}

export async function fetchHistory(): Promise<{ entries: any[]; total: number }> {
    const local = readHistory();
    if (local.total > 0) return local;
    try {
        const data = await db.query("claude_history", {
            select: "session_id,display,timestamp,project",
            orderBy: "timestamp",
            ascending: false,
            limit: 2000,
        });
        const entries = data.map((r: any) => ({
            display: r.display,
            timestamp: r.timestamp,
            project: r.project,
            sessionId: r.session_id,
        }));
        return { entries, total: entries.length };
    } catch {
        return { entries: [], total: 0 };
    }
}

export async function fetchNotes(): Promise<any[]> {
    try {
        return await db.query("notes", {
            select: "id, title, content, folder_name, folder_color, created_at, updated_at",
            orderBy: "created_at",
            ascending: false,
            limit: 50,
        });
    } catch {
        return [];
    }
}

// ─── Local .jsonl token scanning (mirrors /api/claude/token-stats) ──────────
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const MAX_BYTES = 50 * 1024; // 50 KB tail per file

function readLastBytes(filePath: string, maxBytes: number): string {
    let fd = -1;
    try {
        fd = fs.openSync(filePath, "r");
        const stat = fs.fstatSync(fd);
        const size = stat.size;
        const readSize = Math.min(maxBytes, size);
        const offset = Math.max(0, size - readSize);
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, offset);
        return buf.toString("utf-8");
    } catch { return ""; }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

interface SessionAccum {
    session_id: string;
    project: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    prompt_count: number;
}

function parseSessionFile(filePath: string, project: string): SessionAccum {
    const sessionId = path.basename(filePath, ".jsonl");
    const accum: SessionAccum = {
        session_id: sessionId, project, model: "unknown",
        input_tokens: 0, output_tokens: 0,
        cache_read_tokens: 0, cache_creation_tokens: 0, prompt_count: 0,
    };
    const chunk = readLastBytes(filePath, MAX_BYTES);
    if (!chunk) return accum;
    const lines = chunk.split("\n");
    if (lines.length > 1 && !chunk.endsWith("\n")) lines.pop();
    for (const line of lines) {
        if (!line) continue;
        try {
            const d = JSON.parse(line);
            if (d.type === "summary" && d.summary?.usage) {
                const u = d.summary.usage;
                accum.input_tokens += u.input_tokens ?? 0;
                accum.output_tokens += u.output_tokens ?? 0;
                accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
                accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
                accum.prompt_count += 1;
                if (d.summary.model) accum.model = d.summary.model;
            } else if (d.type === "assistant" && d.message?.usage) {
                const u = d.message.usage;
                accum.input_tokens += u.input_tokens ?? 0;
                accum.output_tokens += u.output_tokens ?? 0;
                accum.cache_read_tokens += u.cache_read_input_tokens ?? 0;
                accum.cache_creation_tokens += u.cache_creation_input_tokens ?? 0;
                if (d.message.model) accum.model = d.message.model;
            }
        } catch { /* skip malformed */ }
    }
    return accum;
}

function readLocalTokens(): any[] {
    if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
    const hostname = os.hostname().split(".")[0];
    const results: any[] = [];
    for (const folder of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
        const folderPath = path.join(CLAUDE_PROJECTS_DIR, folder);
        try { if (!fs.statSync(folderPath).isDirectory()) continue; } catch { continue; }
        const project = folder.replace(/-/g, "/");
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"))) {
            const accum = parseSessionFile(path.join(folderPath, file), project);
            if (accum.input_tokens + accum.output_tokens > 0) {
                results.push({ ...accum, machine: hostname });
            }
        }
    }
    return results;
}

export async function fetchTokens(): Promise<any[]> {
    // Read local .jsonl files directly
    return readLocalTokens();
}

export async function fetchGlobalInstructions(): Promise<any[]> {
    try {
        return await db.query("claude_global_instructions", {
            select: "id, category, title, instruction, source, confidence, last_used_at, violations_count, created_at, updated_at",
            orderBy: "category",
        });
    } catch {
        return [];
    }
}
