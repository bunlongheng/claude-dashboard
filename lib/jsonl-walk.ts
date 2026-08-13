import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readLastBytes } from "@/lib/safe-read";

// Shared home of every ~/.claude/projects/<folder>/<session>.jsonl walk.
export const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

export interface JsonlWalkOptions {
    // Skip files whose mtime predates this (ms epoch). Omit/0 to walk every file.
    sinceMs?: number;
    // Tail size read per file via readLastBytes.
    maxBytes: number;
}

export interface JsonlEntryCtx {
    folder: string;   // raw project dir name, e.g. "-Users-alice-Sites-myapp"
    filePath: string;
    fileName: string; // e.g. "abc123.jsonl"
    mtimeMs: number;
}

// Walks every *.jsonl file under PROJECTS_DIR, JSON.parsing each line and
// calling onEntry(parsed, ctx) for the ones that parse. Blank lines are
// skipped up front; malformed/partial lines (e.g. a tail-read that starts or
// ends mid-line) fault JSON.parse and are silently skipped via try/catch -
// same tolerance the routes already relied on.
export function walkProjectJsonl(
    opts: JsonlWalkOptions,
    onEntry: (parsed: unknown, ctx: JsonlEntryCtx) => void,
): void {
    const sinceMs = opts.sinceMs ?? 0;
    if (!fs.existsSync(PROJECTS_DIR)) return;

    for (const folder of fs.readdirSync(PROJECTS_DIR)) {
        const dir = path.join(PROJECTS_DIR, folder);
        let dirStat;
        try { dirStat = fs.statSync(dir); } catch { continue; }
        if (!dirStat.isDirectory()) continue;

        for (const fileName of fs.readdirSync(dir)) {
            if (!fileName.endsWith(".jsonl")) continue;
            const filePath = path.join(dir, fileName);
            let fileStat;
            try { fileStat = fs.statSync(filePath); } catch { continue; }
            if (fileStat.mtimeMs < sinceMs) continue;

            try {
                const lines = readLastBytes(filePath, opts.maxBytes).split("\n");
                const ctx: JsonlEntryCtx = { folder, filePath, fileName, mtimeMs: fileStat.mtimeMs };
                for (const line of lines) {
                    if (!line) continue;
                    try {
                        onEntry(JSON.parse(line), ctx);
                    } catch { /* skip malformed/partial line */ }
                }
            } catch { /* skip unreadable file */ }
        }
    }
}
