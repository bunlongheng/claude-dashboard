import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

type CacheEntry = { ids: Set<string>; expires: number };
let cache: CacheEntry | null = null;
const TTL_MS = 5_000;
const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
// Node's child_process inherits a minimal PATH that omits /usr/sbin on macOS;
// invoke lsof by absolute path so the dev server process can find it.
const LSOF_BIN = "/usr/sbin/lsof";

async function cwdsOfClaudeProcesses(): Promise<string[]> {
    try {
        const { stdout: out } = await execFileAsync(LSOF_BIN, ["-c", "claude", "-a", "-d", "cwd", "-Fn"], { encoding: "utf8", timeout: 2000 });
        const cwds: string[] = [];
        for (const line of out.split("\n")) {
            if (line.charCodeAt(0) === 110 && line.length > 1) cwds.push(line.slice(1));
        }
        return cwds;
    } catch {
        return [];
    }
}

function newestJsonlIn(folder: string): string | null {
    try {
        let best: { id: string; mtime: number } | null = null;
        for (const f of fs.readdirSync(folder)) {
            if (!f.endsWith(".jsonl")) continue;
            const mtime = fs.statSync(path.join(folder, f)).mtimeMs;
            if (!best || mtime > best.mtime) best = { id: f.slice(0, -6), mtime };
        }
        return best?.id ?? null;
    } catch {
        return null;
    }
}

export async function getLiveSessionIds(): Promise<Set<string>> {
    const now = Date.now();
    if (cache && cache.expires > now) return cache.ids;

    const ids = new Set<string>();
    for (const cwd of await cwdsOfClaudeProcesses()) {
        const folder = path.join(CLAUDE_DIR, cwd.replace(/\//g, "-"));
        if (!fs.existsSync(folder)) continue;
        const id = newestJsonlIn(folder);
        if (id) ids.add(id);
    }
    cache = { ids, expires: now + TTL_MS };
    return ids;
}
