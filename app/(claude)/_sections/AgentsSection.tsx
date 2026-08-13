"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Search, X, Shield, ListChecks } from "lucide-react";
import { useMachine } from "./MachineContext";
import AppIcon from "./AppIcon";
import { cliIconFor, CLI_ICON_MAP } from "./cliIcons";
import { SegmentedTabs, timeAgo } from "./shared";

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

const AGENT_CHARS = [
    { id: 1, name: "Snow", role: "Recon", color: "#ffffff", img: "/agents/1.webp" },
    { id: 2, name: "Blaze", role: "Arch", color: "#ff3333", img: "/agents/2.webp" },
    { id: 3, name: "Arrow", role: "QA", color: "#ff66cc", img: "/agents/3.webp" },
    { id: 4, name: "Venus", role: "UI", color: "#ff8800", img: "/agents/4.webp" },
    { id: 5, name: "Zap", role: "Perf", color: "#ffdd00", img: "/agents/5.webp" },
    { id: 6, name: "Frost", role: "Data", color: "#00ffff", img: "/agents/6.webp" },
    { id: 7, name: "Blitz", role: "Code", color: "#0099ff", img: "/agents/7.webp" },
    { id: 8, name: "Earth", role: "Clean", color: "#00ff00", img: "/agents/8.webp" },
    { id: 9, name: "Pulse", role: "Build", color: "#9933ff", img: "/agents/9.webp" },
    { id: 10, name: "Sand", role: "Store", color: "#cc6633", img: "/agents/10.webp" },
    { id: 11, name: "Shadow", role: "Guard", color: "#888888", img: "/agents/11.webp" },
    { id: 12, name: "Rock", role: "Intel", color: "#7a7a7a", img: "/agents/12.webp" },
];

function getAgentChar(agent: AgentInfo) {
    // Match on description + type only (not full prompt - too noisy)
    const desc = (agent.description + " " + agent.subagentType).toLowerCase();
    // 1. Shadow - Security (first - "audit" overlaps with Arrow)
    if (desc.includes("security") || desc.includes("audit repo") || desc.includes("vuln") || desc.includes("ssl") || desc.includes("cipher") || desc.includes("supply chain") || desc.includes("exposure")) return AGENT_CHARS[10];
    // 2. Zap - Performance (before Arrow - "performance fixes" should be Zap not Arrow)
    if (desc.includes("perf") || desc.includes("speed") || desc.includes("lighthouse") || desc.includes("performance") || desc.includes("seo") || desc.includes("best practice") || desc.includes("bottleneck")) return AGENT_CHARS[4];
    // 3. Blaze - Architecture / Planning
    if (desc.includes("plan ") || desc.includes("architect") || desc.includes("schema") || desc.includes("structure") || desc.includes("design system")) return AGENT_CHARS[1];
    // 4. Arrow - QA / Audit (non-security)
    if (desc.includes("test") || desc.includes("qa") || desc.includes("verify") || desc.includes("accessibility") || desc.includes("e2e") || desc.includes("audit ") || desc.includes("compare")) return AGENT_CHARS[2];
    // 5. Venus - UI / Frontend
    if (desc.includes("ui ") || desc.includes("frontend") || desc.includes("css") || desc.includes("color") || desc.includes("style") || desc.includes("responsive") || desc.includes("layout")) return AGENT_CHARS[3];
    // 6. Blitz - Fix / Code
    if (desc.includes("fix ") || desc.includes("lint") || desc.includes("rebuild") || desc.includes("migrate")) return AGENT_CHARS[6];
    // 7. Earth - Cleanup
    if (desc.includes("clean") || desc.includes("refactor") || desc.includes("remove") || desc.includes("dead") || desc.includes("delete") || desc.includes("unused")) return AGENT_CHARS[7];
    // 8. Pulse - Create / Build
    if (desc.includes("build") || desc.includes("deploy") || desc.includes("create") || desc.includes("setup") || desc.includes("seed") || desc.includes("generate") || desc.includes("download") || desc.includes("scrape")) return AGENT_CHARS[8];
    // 9. Sand - Storage / DB
    if (desc.includes("db") || desc.includes("storage") || desc.includes("sqlite") || desc.includes("supabase") || desc.includes("postgres")) return AGENT_CHARS[9];
    // 10. Frost - Analytics / Data
    if (desc.includes("metric") || desc.includes("chart") || desc.includes("stats") || desc.includes("analytics") || desc.includes("monitor") || desc.includes("dashboard")) return AGENT_CHARS[5];
    // 11. Rock - Investigate
    if (desc.includes("gather") || desc.includes("batch") || desc.includes("check ")) return AGENT_CHARS[11];
    // 12. Snow - Commander / Research (catch-all)
    if (desc.includes("explore") || desc.includes("find") || desc.includes("study") || desc.includes("search") || desc.includes("research") || desc.includes("guide") || desc.includes("session") || desc.includes("config") || desc.includes("analyze") || desc.includes("scan") || desc.includes("count") || desc.includes("list")) return AGENT_CHARS[0];
    let h = 0;
    for (const c of agent.id) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    return AGENT_CHARS[Math.abs(h) % AGENT_CHARS.length];
}

function formatDuration(ms: number | null): string {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function AgentModal({ agent, onClose }: { agent: AgentInfo; onClose: () => void }) {
    const char = getAgentChar(agent);
    const statusColor = agent.status === "running" ? "#34d399" : agent.status === "failed" ? "#ef4444" : "#3b82f6";
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} />
            <div style={{
                position: "relative", background: "#0c0d12", borderRadius: 24, padding: 0,
                maxWidth: 520, width: "90vw", maxHeight: "85vh", overflow: "hidden",
                border: `1px solid ${char.color}25`, boxShadow: `0 0 80px ${char.color}15`,
            }} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: "absolute", top: 16, right: 16, background: "none", border: "none",
                    color: "rgba(255,255,255,0.55)", cursor: "pointer", zIndex: 2,
                }}><X size={18} /></button>

                {/* Character header */}
                <div style={{
                    background: `linear-gradient(180deg, ${char.color}15 0%, transparent 100%)`,
                    padding: "32px 32px 24px", textAlign: "center",
                }}>
                    <img src={char.img} alt={char.name} width={96} height={96}
                        style={{ borderRadius: 24, objectFit: "cover", border: `3px solid ${char.color}40`, boxShadow: `0 0 40px ${char.color}25`, margin: "0 auto", display: "block" }} />
                    <h3 style={{ fontSize: 24, fontWeight: 900, color: char.color, marginTop: 12, letterSpacing: "0.05em" }}>{char.name}</h3>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{char.role}</p>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                            {agent.status.toUpperCase()}
                        </span>
                    </div>
                </div>

                <div style={{ padding: "0 32px 32px", overflow: "auto", maxHeight: "50vh" }}>
                    {/* Mission brief */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, marginTop: 8 }}>Task</div>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 16 }}>{agent.description || "Agent task"}</p>

                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                        {[
                            { label: "Project", value: agent.project },
                            { label: "Duration", value: formatDuration(agent.durationMs) },
                            { label: "When", value: agent.startedAt ? timeAgo(agent.startedAt) : "-" },
                        ].map(s => (
                            <div key={s.label} style={{ padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.value}</div>
                                <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {agent.prompt && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Orders</div>
                            <pre style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflow: "auto", fontFamily: "'SF Mono', monospace" }}>{agent.prompt}</pre>
                        </div>
                    )}
                    {agent.result && (
                        <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Report</div>
                            <pre style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", fontFamily: "'SF Mono', monospace" }}>{agent.result}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Live agent events from WebSocket
interface LiveEvent {
    type: "agent_start" | "agent_complete";
    toolUseId: string;
    sessionId: string;
    description: string;
    subagentType: string;
    prompt?: string;
    status?: string;
    result?: string;
    durationMs?: number;
    timestamp: string;
}

export default function AgentsSection() {
    const { machine, machines, apiBase } = useMachine();
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "running" | "done" | "failed">("all");
    const [selected, setSelected] = useState<AgentInfo | null>(null);
    const [selectedChar, setSelectedChar] = useState<typeof AGENT_CHARS[0] | null>(null);
    const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
    const [wsConnected, setWsConnected] = useState(false);
    const searchParams = useSearchParams();
    const tabParam = searchParams.get("tab");
    const initialTab = tabParam === "mcp" || tabParam === "cli" ? tabParam : "agents";
    const [logTab, setLogTab] = useState<"agents" | "mcp" | "cli">(initialTab);
    // Sync when the ?tab= param changes (e.g. deep-link from the dashboard).
    useEffect(() => {
        if (tabParam === "mcp" || tabParam === "cli" || tabParam === "agents") setLogTab(tabParam);
    }, [tabParam]);
    const [mcpServers, setMcpServers] = useState<{ name: string; type?: string }[]>([]);

    // The MCP servers + CLI tools this machine has/supports (capability lists,
    // not call activity). MCP from the skills API; CLI is the built-in tool set.
    useEffect(() => {
        fetch(apiBase("/api/claude/skills"))
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setMcpServers((d.mcp || []).map((m: { name: string; type: string }) => ({ name: m.name, type: m.type }))); })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);
    const cliTools = Object.keys(CLI_ICON_MAP);

    // WebSocket for live agent feed
    useEffect(() => {
        const wsUrl = `ws://${window.location.hostname}:7878/ws/agents`;
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout>;

        function connect() {
            try {
                ws = new WebSocket(wsUrl);
            } catch { reconnectTimer = setTimeout(connect, 10000); return; }
            ws.onopen = () => setWsConnected(true);
            ws.onerror = () => {};
            ws.onclose = () => { setWsConnected(false); reconnectTimer = setTimeout(connect, 10000); };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === "agent_start") {
                        setLiveEvents(prev => [msg, ...prev].slice(0, 50));
                        // Add to agents list as running
                        setAgents(prev => [{
                            id: msg.toolUseId,
                            sessionId: msg.sessionId,
                            project: "",
                            subagentType: msg.subagentType,
                            description: msg.description,
                            prompt: msg.prompt || "",
                            status: "running" as const,
                            result: "",
                            startedAt: msg.timestamp,
                            completedAt: null,
                            durationMs: null,
                        }, ...prev]);
                    } else if (msg.type === "agent_complete") {
                        setLiveEvents(prev => [msg, ...prev].slice(0, 50));
                        // Update agent status
                        setAgents(prev => prev.map(a =>
                            a.id === msg.toolUseId
                                ? { ...a, status: msg.status as "done" | "failed", result: msg.result || "", completedAt: msg.timestamp, durationMs: msg.durationMs || null }
                                : a
                        ));
                    }
                } catch {}
            };
        }
        connect();
        return () => { ws?.close(); clearTimeout(reconnectTimer); };
    }, []);

    // Effective request URL. The initial null machine and the local machine both
    // resolve to the same same-origin URL, so this string is stable while the
    // machine context settles — depending on it (not on `machine`/`apiBase`, whose
    // identities change on settle) prevents the intermittent double initial load.
    const selectedMachine = machines.find(m => m.id === machine);
    const machineQ = selectedMachine && !selectedMachine.isLocal ? `&machine=${machine}` : "";
    const agentsUrl = apiBase(`/api/claude/agents?mode=history&limit=20${machineQ}`);
    // Load from API + poll as a backstop (the WebSocket feed is the live source).
    useEffect(() => {
        function fetchAgents() {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            fetch(agentsUrl)
                .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
                .then(d => { setAgents(d.agents ?? []); setLoading(false); })
                .catch(e => { console.error("Agents fetch failed:", e); setLoading(false); });
        }
        fetchAgents();
        const timer = setInterval(fetchAgents, 15000);
        return () => clearInterval(timer);
    }, [agentsUrl]);

    const filtered = useMemo(() => {
        let list = agents;
        if (selectedChar) list = list.filter(a => getAgentChar(a).id === selectedChar.id);
        if (statusFilter !== "all") list = list.filter(a => a.status === statusFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(a => a.description.toLowerCase().includes(q) || a.project.toLowerCase().includes(q) || a.subagentType.toLowerCase().includes(q));
        }
        return list;
    }, [agents, statusFilter, search, selectedChar]);

    // Per-character stats
    const charStats = useMemo(() => {
        const stats = new Map<number, { missions: number; wins: number; fails: number; totalMs: number }>();
        for (const a of agents) {
            const char = getAgentChar(a);
            const s = stats.get(char.id) || { missions: 0, wins: 0, fails: 0, totalMs: 0 };
            s.missions++;
            if (a.status === "done") s.wins++;
            if (a.status === "failed") s.fails++;
            if (a.durationMs) s.totalMs += a.durationMs;
            stats.set(char.id, s);
        }
        return stats;
    }, [agents]);

    // All characters - active ones first sorted by missions, then idle ones
    const activeChars = [...AGENT_CHARS].sort((a, b) => (charStats.get(b.id)?.missions || 0) - (charStats.get(a.id)?.missions || 0));

    const counts = useMemo(() => ({
        all: agents.length,
        running: agents.filter(a => a.status === "running").length,
        done: agents.filter(a => a.status === "done").length,
        failed: agents.filter(a => a.status === "failed").length,
    }), [agents]);

    const runningAgents = useMemo(() => agents.filter(a => a.status === "running"), [agents]);

    // Render the shell (roster, tabs, peers) immediately - the agent log fills
    // in when the (slower) history fetch resolves rather than blocking the page.
    void loading;


    return (
        <div>

            {/* Search + live dot (MCP & CLI moved to their own left-nav pages) */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: wsConnected ? "#34d399" : "#ef4444",
                    boxShadow: wsConnected ? "0 0 8px #34d399" : "none",
                    animation: wsConnected ? "pulse 2s infinite" : "none",
                }} title={wsConnected ? "Live" : "Disconnected"} />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[200px] ml-auto"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1"
                        style={{ outline: "none", border: "none" }} />
                </div>
            </div>

            {/* Character Roster - agents tab only */}
            {logTab === "agents" && <div className="flex flex-wrap gap-2 md:grid md:grid-cols-12 md:gap-1.5" style={{ marginBottom: 16 }}>
                {activeChars.map((char, i) => {
                    const isRunning = agents.some(a => getAgentChar(a).id === char.id && a.status === "running");
                    return (
                        <div key={char.id} onClick={() => setSelectedChar(selectedChar?.id === char.id ? null : char)}
                            className={`cursor-pointer shrink-0 rosterCard${selectedChar?.id === char.id ? " sel" : ""}`}
                            style={{
                            ["--cc" as never]: char.color,
                            animation: `rosterIn 0.5s ease ${i * 0.05}s both`,
                            transition: "transform 0.15s",
                        }}
                            onMouseEnter={e => { if (selectedChar?.id !== char.id) e.currentTarget.style.transform = "translateY(-3px)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                            {/* Avatar */}
                            <div style={{ position: "relative", padding: "8px 8px 0", textAlign: "center" }}>
                                <img src={char.img} alt={char.name} width={48} height={48}
                                    style={{
                                        borderRadius: "50%", objectFit: "cover", margin: "0 auto",
                                        border: `2px solid ${char.color}40`,
                                        boxShadow: isRunning ? `0 0 20px ${char.color}40` : `0 2px 8px rgba(0,0,0,0.3)`,
                                        animation: isRunning ? "charBounce 1s ease infinite" : "none",
                                    }} />
                                {isRunning && <span style={{ position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: "50%", background: "#34d399", border: "2px solid #0c0d12", animation: "pulse 1.5s infinite" }} />}
                            </div>
                            {/* Info */}
                            <div className="hidden md:block" style={{ padding: "4px 6px 6px", textAlign: "center" }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: char.color, letterSpacing: "0.03em" }}>{char.name}</div>
                                <div style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{char.role}</div>
                            </div>
                        </div>
                    );
                })}
            </div>}

            {/* Tab content */}
            {(() => {
                return (
                    <>
                        {logTab === "agents" && (
                            <>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {filtered.map((a, i) => {
                                        const char = getAgentChar(a);
                                        const isRunning = a.status === "running";
                                        const isRecent = a.completedAt && (Date.now() - new Date(a.completedAt).getTime()) < 60000;
                                        const isActive = isRunning || isRecent;
                                        const statusColor = isRunning ? "#34d399" : a.status === "failed" ? "#ef4444" : "rgba(255,255,255,0.15)";
                                        return (
                                            <div key={a.id} onClick={() => setSelected(a)}
                                                className="cursor-pointer"
                                                style={{
                                                    padding: "10px 14px", borderRadius: 12,
                                                    background: isRunning ? `${char.color}10` : isRecent ? `${char.color}06` : "rgba(255,255,255,0.015)",
                                                    border: isRunning ? `1px solid ${char.color}50` : isRecent ? `1px solid ${char.color}25` : "1px solid rgba(255,255,255,0.04)",
                                                    display: "flex", alignItems: "center", gap: 12,
                                                    transition: "all 0.3s",
                                                    animation: isActive ? `recentGlow 2s ease infinite, agentIn 0.3s ease both` : `agentIn 0.3s ease ${i * 0.02}s both`,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = `${char.color}08`; e.currentTarget.style.borderColor = `${char.color}30`; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = isRunning ? `${char.color}10` : isRecent ? `${char.color}06` : "rgba(255,255,255,0.015)"; e.currentTarget.style.borderColor = isRunning ? `${char.color}50` : isRecent ? `${char.color}25` : "rgba(255,255,255,0.04)"; }}>
                                                <div style={{ position: "relative", flexShrink: 0 }}>
                                                    <img src={char.img} alt={char.name} width={32} height={32}
                                                        style={{ borderRadius: 8, objectFit: "cover", border: `1.5px solid ${char.color}${isActive ? "80" : "30"}`, animation: isRunning ? "charBounce 1s ease infinite" : "none" }} />
                                                    {a.status !== "done" && (
                                                        <div style={{
                                                            position: "absolute", bottom: -2, right: -2,
                                                            width: 10, height: 10, borderRadius: "50%",
                                                            background: statusColor, border: "2px solid #0c0d12",
                                                            boxShadow: a.status === "running" ? `0 0 8px ${statusColor}` : "none",
                                                        }} />
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: char.color }}>{char.name}</span>
                                                    <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {a.description || "task"}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{formatDuration(a.durationMs)}</span>
                                                {a.project && (
                                                    <AppIcon project={a.project} size={18} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {filtered.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "48px 0" }}>
                                        <Shield size={32} style={{ color: "rgba(255,255,255,0.08)", margin: "0 auto 12px" }} />
                                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>No agents in the log</p>
                                    </div>
                                )}
                            </>
                        )}

                        {logTab === "mcp" && (
                            <div style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center", padding: "8px 14px", fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                    <span></span><span>server</span><span>transport</span>
                                </div>
                                {mcpServers.length === 0 ? (
                                    <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 11 }}>no MCP servers</div>
                                ) : (
                                    <div style={{ maxHeight: 560, overflowY: "auto" }}>
                                        {mcpServers.map((m) => (
                                            <div key={m.name} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                                <AppIcon project={m.name} size={16} />
                                                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                                                <span style={{ fontSize: 9, fontWeight: 700, color: "#FFCC00", textTransform: "uppercase", letterSpacing: 0.5, padding: "2px 8px", borderRadius: 6, background: "rgba(255,204,0,0.1)" }}>{m.type || "mcp"}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {logTab === "cli" && (
                            <div style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "center", padding: "8px 14px", fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                    <span></span><span>tool</span>
                                </div>
                                <div style={{ maxHeight: 560, overflowY: "auto" }}>
                                    {cliTools.map((name) => {
                                        const ToolIcon = cliIconFor(name);
                                        return (
                                            <div key={name} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                                <ToolIcon size={14} style={{ color: "#22d3ee", opacity: 0.85 }} />
                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.85)" }}>{name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}

            {/* Character Profile Modal */}
            {selectedChar && (() => {
                const s = charStats.get(selectedChar.id) || { missions: 0, wins: 0, fails: 0, totalMs: 0 };
                const xp = s.wins * 100 + s.fails * 20;
                const level = Math.max(1, Math.floor(xp / 200) + 1);
                const charMissions = agents.filter(a => getAgentChar(a).id === selectedChar.id)
                    .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
                const avgMs = s.missions > 0 ? Math.round(s.totalMs / s.missions) : 0;
                const successRate = s.missions > 0 ? Math.round((s.wins / s.missions) * 100) : 0;
                return (
                    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => setSelectedChar(null)}>
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} />
                        <div style={{
                            position: "relative", background: "#0c0d12", borderRadius: 24, padding: 0,
                            maxWidth: 480, width: "90vw", maxHeight: "85vh", overflow: "hidden",
                            border: `1px solid ${selectedChar.color}25`, boxShadow: `0 0 80px ${selectedChar.color}15`,
                        }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => setSelectedChar(null)} style={{
                                position: "absolute", top: 16, right: 16, background: "none", border: "none",
                                color: "rgba(255,255,255,0.55)", cursor: "pointer", zIndex: 2,
                            }}><X size={18} /></button>

                            {/* Header */}
                            <div style={{
                                background: `linear-gradient(180deg, ${selectedChar.color}18 0%, transparent 100%)`,
                                padding: "32px 32px 20px", textAlign: "center",
                            }}>
                                <img src={selectedChar.img} alt={selectedChar.name} width={100} height={100}
                                    style={{ borderRadius: 24, objectFit: "cover", border: `3px solid ${selectedChar.color}40`, boxShadow: `0 0 40px ${selectedChar.color}25`, margin: "0 auto", display: "block" }} />
                                <h3 style={{ fontSize: 28, fontWeight: 900, color: selectedChar.color, marginTop: 12, letterSpacing: "0.05em" }}>{selectedChar.name}</h3>
                                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{selectedChar.role}</p>
                                <div style={{ fontSize: 13, fontWeight: 800, color: selectedChar.color, marginTop: 8, opacity: 0.7 }}>LEVEL {level}</div>
                            </div>

                            {/* Stats */}
                            <div style={{ padding: "0 24px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                                    {[
                                        { label: "Tasks", value: s.missions, color: selectedChar.color },
                                        { label: "Wins", value: s.wins, color: "#34d399" },
                                        { label: "Fails", value: s.fails, color: "#ef4444" },
                                        { label: "Success", value: `${successRate}%`, color: "#3b82f6" },
                                    ].map(st => (
                                        <div key={st.label} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: st.color }}>{st.value}</div>
                                            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{st.label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                                    <div style={{ flex: 1, padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{formatDuration(avgMs)}</div>
                                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Avg Duration</div>
                                    </div>
                                    <div style={{ flex: 1, padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{formatDuration(s.totalMs)}</div>
                                        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total Time</div>
                                    </div>
                                </div>
                            </div>

                            {/* Mission timeline */}
                            <div style={{ padding: "0 24px 24px", maxHeight: 250, overflow: "auto" }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>History</div>
                                {charMissions.map((a, i) => {
                                    const statusColor = a.status === "done" ? "#34d399" : a.status === "failed" ? "#ef4444" : "#f59e0b";
                                    return (
                                        <div key={a.id} style={{
                                            display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                                            borderBottom: i < charMissions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                                        }}>
                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</div>
                                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{a.project}</div>
                                            </div>
                                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>{formatDuration(a.durationMs)}</div>
                                                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{a.startedAt ? timeAgo(a.startedAt) : ""}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {charMissions.length === 0 && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: 16 }}>No tasks yet</p>}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {selected && <AgentModal agent={selected} onClose={() => setSelected(null)} />}

            <style>{`
                @keyframes agentIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes rosterIn {
                    from { opacity: 0; transform: translateY(12px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes charBounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-4px); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                @keyframes livePulse {
                    0%, 100% { border-color: rgba(52,211,153,0.25); }
                    50% { border-color: rgba(52,211,153,0.5); }
                }
                @keyframes recentGlow {
                    0%, 100% { box-shadow: 0 0 0px transparent; }
                    50% { box-shadow: 0 0 12px rgba(255,255,255,0.06); }
                }
                /* Roster: bare circle avatars on mobile, full cards on md+ */
                @media (min-width: 768px) {
                    .rosterCard { border-radius: 12px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--cc) 20%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--cc) 12%, transparent) 0%, rgba(255,255,255,0.02) 100%); }
                    .rosterCard.sel { border: 2px solid color-mix(in srgb, var(--cc) 60%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--cc) 25%, transparent) 0%, rgba(255,255,255,0.04) 100%); }
                }
            `}</style>
        </div>
    );
}
