import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { SubagentRun } from "./jev-log";

// Every subagent transcript lives at ~/.claude/projects/<folder>/<session>/subagents/<agent>.jsonl.
// The first line is the prompt (its timestamp is when the agent started) and
// the model only shows up on the first assistant line, which can sit 150 KB in
// behind a long prompt - so the head is read in chunks rather than whole.
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const CHUNK = 64 * 1024;
const MAX_READ = 1024 * 1024;
const cache = new Map<string, { size: number; run: SubagentRun | null }>();

// Model id -> ladder rung, so "claude-sonnet-5" lines up with the forced tier.
function tierOfModel(model: string): string {
    const m = model.toLowerCase();
    for (const t of ["haiku", "sonnet", "opus", "fable"]) if (m.includes(t)) return t;
    return "other";
}

function readRun(fp: string): SubagentRun | null {
    let fd: number;
    try { fd = fs.openSync(fp, "r"); } catch { return null; }
    try {
        let text = "";
        const buf = Buffer.alloc(CHUNK);
        for (let pos = 0; pos < MAX_READ; pos += CHUNK) {
            const n = fs.readSync(fd, buf, 0, CHUNK, pos);
            if (n <= 0) break;
            text += buf.toString("utf8", 0, n);
            const hit = /"message":\{"model":"([^"]+)"/.exec(text); // only assistant turns carry a model
            if (hit) {
                const first = JSON.parse(text.slice(0, text.indexOf("\n"))) as { timestamp?: string };
                return first.timestamp ? { ts: first.timestamp, tier: tierOfModel(hit[1]) } : null;
            }
        }
        return null;
    } catch {
        return null;
    } finally {
        fs.closeSync(fd);
    }
}

export function listSubagentRuns(): SubagentRun[] {
    const out: SubagentRun[] = [];
    let folders: string[];
    try { folders = fs.readdirSync(PROJECTS_DIR); } catch { return out; }
    for (const folder of folders) {
        const dir = path.join(PROJECTS_DIR, folder);
        let sessions: fs.Dirent[];
        try { sessions = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const s of sessions) {
            if (!s.isDirectory()) continue;
            const sub = path.join(dir, s.name, "subagents");
            let files: string[];
            try { files = fs.readdirSync(sub); } catch { continue; }
            for (const f of files) {
                if (!f.endsWith(".jsonl")) continue;
                const fp = path.join(sub, f);
                let size = 0;
                try { size = fs.statSync(fp).size; } catch { continue; }
                const hit = cache.get(fp);
                // The head never changes once the first assistant line is in, so a
                // resolved entry is final; an unresolved one retries as the file grows.
                const run = hit && (hit.run || hit.size === size) ? hit.run : readRun(fp);
                cache.set(fp, { size, run });
                if (run) out.push({ ...run, session: s.name });
            }
        }
    }
    return out;
}
