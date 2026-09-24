import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import SessionProgressClient from "./SessionProgressClient";
import { readJevLog, aggregateJev, type JevSession } from "@/lib/jev-log";

export const dynamic = "force-dynamic";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

// Dynamically extract project name from folder like "-Users-alice-Sites-myapp" → "myapp"
function folderToProjectName(folder: string): string {
    const parts = folder.replace(/^-/, "").split("-");
    return parts[parts.length - 1] || folder;
}

interface TodoItem {
    id: string;
    subject: string;
    status: string;
    description?: string;
    activeForm?: string;
}

interface SessionMeta {
    sessionId: string;
    projectName: string;
    cwd: string;
    gitBranch: string;
    version: string;
    createdAt: string;
    lastModified: string;
    active: boolean;
    firstMessage: string;
    customTitle: string | null;
    todos: TodoItem[];
    lastUsage: {
        input_tokens: number;
        output_tokens: number;
        cache_read: number;
        cache_creation: number;
        model: string;
    } | null;
    messageCount: number;
}

const loadSessionMeta = cache(function loadSessionMeta(sessionId: string): SessionMeta | null {
    let filePath: string | null = null;
    let projectFolder = "";

    try {
        const folders = fs.readdirSync(CLAUDE_DIR);
        for (const folder of folders) {
            const fp = path.join(CLAUDE_DIR, folder, `${sessionId}.jsonl`);
            if (fs.existsSync(fp)) { filePath = fp; projectFolder = folder; break; }
        }
    } catch { return null; }

    if (!filePath) return null;

    const stat = fs.statSync(filePath);
    const active = (Date.now() - stat.mtime.getTime()) < 10 * 60 * 1000;

    let cwd = "", gitBranch = "", version = "", createdAt = "", firstMessage = "";
    let customTitle: string | null = null;
    let todos: TodoItem[] = [];
    let lastUsage: SessionMeta["lastUsage"] = null;
    let messageCount = 0;

    try {
        const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
        messageCount = lines.length;

        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                if (!createdAt && obj.timestamp) createdAt = obj.timestamp;
                if (obj.type === "custom-title" && obj.customTitle) customTitle = obj.customTitle;
                if (obj.type === "user") {
                    if (!cwd && obj.cwd) cwd = obj.cwd;
                    if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
                    if (!version && obj.version) version = obj.version;
                    if (!firstMessage) {
                        const c = obj.message?.content;
                        const t = typeof c === "string" ? c : Array.isArray(c) ? c.find((x: { type: string }) => x.type === "text")?.text ?? "" : "";
                        if (t.trim()) firstMessage = t.slice(0, 200);
                    }
                    if (Array.isArray(obj.todos) && obj.todos.length > 0) todos = obj.todos;
                }
                const usage = obj.message?.usage;
                if (usage && (usage.input_tokens || usage.output_tokens || usage.cache_read_input_tokens)) {
                    lastUsage = {
                        input_tokens: usage.input_tokens ?? 0,
                        output_tokens: usage.output_tokens ?? 0,
                        cache_read: usage.cache_read_input_tokens ?? 0,
                        cache_creation: usage.cache_creation_input_tokens ?? 0,
                        model: obj.message?.model ?? "",
                    };
                }
            } catch { /* skip */ }
        }
    } catch { /* skip */ }

    return {
        sessionId,
        projectName: folderToProjectName(projectFolder),
        cwd,
        gitBranch,
        version,
        createdAt: createdAt || stat.birthtime.toISOString(),
        lastModified: stat.mtime.toISOString(),
        active,
        firstMessage,
        customTitle,
        todos,
        lastUsage,
        messageCount,
    };
});

// The router hook logs a line per prompt keyed by session id, so a session that
// was routed can show what tier it kept landing on. Sessions with no rows (the
// hook was off, or the log has rolled past them) render nothing.
function loadJevSession(sessionId: string): JevSession | null {
    const { sessions } = aggregateJev(readJevLog(90));
    return sessions.find(s => s.session_id === sessionId) ?? null;
}

const TIER_COLORS: Record<string, string> = {
    haiku: "#22C55E", sonnet: "#4A9EFF", opus: "#A855F7", fable: "#F97316",
};

function JevCard({ jev }: { jev: JevSession }) {
    const tierColor = jev.topTier ? TIER_COLORS[jev.topTier] ?? "#0EA5E9" : "#0EA5E9";
    const stats: { label: string; value: string; color?: string }[] = [
        { label: "Messages", value: String(jev.messages) },
        { label: "Routed", value: String(jev.routed), color: "#22C55E" },
        { label: "Top tier", value: jev.topTier ?? "-", color: tierColor },
        { label: "Avg conf", value: jev.avgConf == null ? "-" : jev.avgConf.toFixed(2) },
    ];
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
            margin: "12px 16px 0", padding: "10px 16px", borderRadius: 12,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderLeft: "3px solid #0EA5E9",
        }}>
            <Link href="/jev" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "#0EA5E9", textDecoration: "none",
            }}>Jev</Link>
            {stats.map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.32)" }}>{s.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.color ?? "#fff", fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                </div>
            ))}
        </div>
    );
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const { sessionId } = await params;
    const meta = loadSessionMeta(sessionId);
    const shortId = sessionId.slice(-3).toUpperCase();
    const title = meta?.customTitle || meta?.firstMessage?.slice(0, 30) || shortId;
    return {
        title: `${title} · Claude Progress`,
        icons: { icon: "/favicon.ico" },
    };
}

export default async function SessionProgressPage({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const { sessionId } = await params;
    const meta = loadSessionMeta(sessionId);
    if (!meta) notFound();

    const jev = loadJevSession(sessionId);

    return (
        <>
            {jev && <JevCard jev={jev} />}
            <SessionProgressClient meta={meta} />
        </>
    );
}
