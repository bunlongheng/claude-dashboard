import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { withErrorHandler } from "@/lib/api-handler";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

interface AgentInfo {
    id: string;
    sessionId: string;
    project: string;
    subagentType: string;
    description: string;
    prompt: string;
    status: "running" | "done" | "failed";
    result: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
}

// Minimal shape used from a tool_result content block - only the text field is read.
interface ResultContentBlock {
    text?: string;
}

function folderToProject(folder: string): string {
    const sitesIdx = folder.indexOf("-Sites-");
    if (sitesIdx >= 0) return folder.slice(sitesIdx + 7);
    return folder.replace(/^-/, "").split("-").pop() || folder;
}

function parseAgentsFromSession(filePath: string, sessionId: string, project: string): AgentInfo[] {
    const agents: AgentInfo[] = [];

    let fd = -1;
    try {
        fd = fs.openSync(filePath, "r");
        const size = fs.fstatSync(fd).size;
        const readSize = Math.min(size, 1024 * 1024); // last 1MB is plenty for recent agents
        const buf = Buffer.alloc(readSize);
        // Read from the END of the file so we get the newest agents
        const offset = Math.max(0, size - readSize);
        const bytesRead = fs.readSync(fd, buf, 0, readSize, offset);
        fs.closeSync(fd);
        fd = -1;

        const text = buf.subarray(0, bytesRead).toString("utf-8");
        const lines = text.split("\n");

        // Track agent calls by tool_use id
        const pendingAgents = new Map<string, AgentInfo>();

        for (const line of lines) {
            if (!line.trim()) continue;
            let entry;
            try { entry = JSON.parse(line); } catch { continue; }

            // Find Agent tool_use calls
            if (entry.type === "assistant" && entry.message?.content) {
                for (const block of entry.message.content) {
                    if (block.type === "tool_use" && block.name === "Agent") {
                        const inp = block.input || {};
                        const agent: AgentInfo = {
                            id: block.id || entry.uuid || `${sessionId}-${agents.length}`,
                            sessionId,
                            project,
                            subagentType: inp.subagent_type || inp.model || "general-purpose",
                            description: inp.description || "",
                            prompt: (inp.prompt || "").slice(0, 200),
                            status: "running",
                            result: "",
                            startedAt: entry.timestamp || "",
                            completedAt: null,
                            durationMs: null,
                        };
                        pendingAgents.set(block.id, agent);
                        agents.push(agent);
                    }
                }
            }

            // Find matching tool_result
            if (entry.type === "user" && entry.message?.content) {
                for (const block of entry.message.content) {
                    if (block.type === "tool_result" && block.tool_use_id && pendingAgents.has(block.tool_use_id)) {
                        const agent = pendingAgents.get(block.tool_use_id)!;
                        const resultText = Array.isArray(block.content)
                            ? block.content.map((c: ResultContentBlock) => c.text || "").join("\n")
                            : typeof block.content === "string" ? block.content : "";
                        agent.status = block.is_error ? "failed" : "done";
                        agent.result = resultText.slice(0, 300);
                        agent.completedAt = entry.timestamp || "";
                        if (agent.startedAt && agent.completedAt) {
                            agent.durationMs = new Date(agent.completedAt).getTime() - new Date(agent.startedAt).getTime();
                        }
                        pendingAgents.delete(block.tool_use_id);
                    }
                }
            }
        }
    } catch {
        if (fd >= 0) try { fs.closeSync(fd); } catch {}
    }

    return agents;
}

// Short in-memory cache so the client's frequent polling doesn't re-scan the
// whole projects tree every time. The WebSocket feed delivers live updates;
// this poll is just a backstop, so a few seconds of staleness is fine.
interface AgentsResponseBody {
    agents: AgentInfo[];
    total: number;
    mode: string;
}

const CACHE_TTL_MS = 10_000;
const respCache = new Map<string, { at: number; body: AgentsResponseBody }>();

export const GET = withErrorHandler(async (req: Request) => {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "live"; // "live" or "history"
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const machineParam = searchParams.get("machine") || "";

    const cacheKey = `${mode}:${limit}:${machineParam}`;
    const cached = respCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return NextResponse.json(cached.body);
    }

    const allAgents: AgentInfo[] = [];

    try {
        const folders = fs.readdirSync(CLAUDE_DIR).filter(f => {
            if (!SAFE_ID.test(f.replace(/-/g, ""))) return false;
            try { return fs.statSync(path.join(CLAUDE_DIR, f)).isDirectory(); } catch { return false; }
        });

        // For live mode, scan last 24 hours; history scans last 30 days
        const cutoff = mode === "live" ? Date.now() - 24 * 60 * 60 * 1000 : Date.now() - 30 * 24 * 60 * 60 * 1000;

        for (const folder of folders) {
            const folderPath = path.join(CLAUDE_DIR, folder);
            const project = folderToProject(folder);
            let files: string[];
            try { files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl")); } catch { continue; }

            for (const file of files) {
                const fp = path.join(folderPath, file);
                try {
                    const stat = fs.statSync(fp);
                    if (stat.mtimeMs < cutoff) continue;
                    const sessionId = file.replace(".jsonl", "");
                    const agents = parseAgentsFromSession(fp, sessionId, project);
                    allAgents.push(...agents);
                } catch { continue; }
            }
        }
    } catch {}

    // Sort by most recent first
    allAgents.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));

    const body = {
        agents: allAgents.slice(0, limit),
        total: allAgents.length,
        mode,
    };
    respCache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body);
}) as (req: Request) => Promise<Response>;
