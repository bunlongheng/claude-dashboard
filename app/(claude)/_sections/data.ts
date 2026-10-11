import * as fs from "fs";
import { streamJsonl, diskCache } from "@/lib/jsonl-walk";
import * as path from "path";
import * as os from "os";
import { getModelRates } from "@/lib/pricing";
import { readJevLog, aggregateJev, JEV_LOG_PATH, JEV_HOOK_PATH, type JevPayload } from "@/lib/jev-log";
import { listSubagentRuns } from "@/lib/subagent-runs";

const TIMEOUT_MS = 4000;

export function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number = TIMEOUT_MS): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
}

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

// ---- Jev router log ----
// Read straight off disk (same process, no HTTP hop) so the /jev page has its
// first paint ready; the client then refetches /api/claude/jev on the toggles.
export async function fetchJev(days = 30): Promise<JevPayload> {
    const rows = readJevLog(days);
    const projects = [...new Set(rows.map(r => r.project).filter((p): p is string => !!p))].sort();
    return {
        ...aggregateJev(rows, Date.now(), listSubagentRuns()),
        days,
        project: null,
        projects,
        logPath: JEV_LOG_PATH,
        hookPath: JEV_HOOK_PATH,
    };
}

export function emptyJev(days = 30): JevPayload {
    return {
        ...aggregateJev([]),
        days,
        project: null,
        projects: [],
        logPath: JEV_LOG_PATH,
        hookPath: JEV_HOOK_PATH,
    };
}
