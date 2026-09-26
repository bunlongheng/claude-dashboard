import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
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

// Streams a .jsonl file line by line (no whole-file string, no event-loop
// stall on a 180 MB session). Only lines passing `keep` are JSON.parsed.
export async function streamJsonl(
    filePath: string,
    keep: (line: string) => boolean,
    onEntry: (parsed: unknown) => void,
): Promise<void> {
    try {
        const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line || !keep(line)) continue;
            try { onEntry(JSON.parse(line)); } catch { /* skip malformed line */ }
        }
    } catch { /* unreadable file */ }
}

// Per-file scan cache keyed by absolute path, mirrored to data/<name>.json so
// a dev-server restart does not re-scan every file. Only the entries passed to
// save() survive, which prunes files that dropped out of the window.
export function diskCache<T>(name: string) {
    const file = path.join(process.cwd(), "data", `${name}.json`);
    return {
        load(): Map<string, T> {
            try { return new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))); } catch { return new Map(); }
        },
        save(entries: Map<string, T>): void {
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, JSON.stringify(Object.fromEntries(entries)));
            } catch { /* best effort */ }
        },
    };
}
