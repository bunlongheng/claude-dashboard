"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMachine } from "./MachineContext";
import { AgentModal } from "./agents/AgentModal";
import { RosterGrid } from "./agents/RosterGrid";
import { AgentLogList } from "./agents/AgentLogList";
import { McpList } from "./agents/McpList";
import { CliList } from "./agents/CliList";
import { CharacterProfileModal } from "./agents/CharacterProfileModal";
import { AGENT_CHARS, getAgentChar } from "./agents/lib";
import type { AgentInfo, AgentChar, LiveEvent } from "./agents/types";

export default function AgentsSection() {
    const { machine, machines, apiBase } = useMachine();
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "running" | "done" | "failed">("all");
    const [selected, setSelected] = useState<AgentInfo | null>(null);
    const [selectedChar, setSelectedChar] = useState<AgentChar | null>(null);
    const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
    const [wsConnected, setWsConnected] = useState(false);
    const searchParams = useSearchParams();
    const tabParam = searchParams.get("tab");
    const initialTab = tabParam === "mcp" || tabParam === "cli" ? tabParam : "agents";
    const [logTab, setLogTab] = useState<"agents" | "mcp" | "cli">(initialTab);
    // Sync when the ?tab= param changes (e.g. deep-link from the dashboard).
    // Adjusted during render rather than in an effect (React's "adjusting state
    // when a prop changes" pattern) - avoids the extra cascading render an
    // effect-based sync would cause.
    const [prevTabParam, setPrevTabParam] = useState(tabParam);
    if (tabParam !== prevTabParam) {
        setPrevTabParam(tabParam);
        if (tabParam === "mcp" || tabParam === "cli" || tabParam === "agents") setLogTab(tabParam);
    }

    // The MCP servers this machine has (capability list, not call activity) -
    // from the skills API, fetched once per machine.
    const skillsUrl = apiBase("/api/claude/skills");
    const { data: skillsData } = useQuery({
        queryKey: ["agents-mcp-skills", skillsUrl],
        queryFn: async () => {
            const r = await fetch(skillsUrl);
            return r.ok ? r.json() : null;
        },
    });
    const mcpServers = useMemo<{ name: string; type?: string }[]>(
        () => (skillsData?.mcp || []).map((m: { name: string; type: string }) => ({ name: m.name, type: m.type })),
        [skillsData]
    );

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
    // Poll as a backstop (the WebSocket feed above is the live source). Same
    // 15s cadence as the old setInterval, now via refetchInterval; polling
    // pauses in a background tab automatically (refetchIntervalInBackground
    // defaults to false), matching the old document.visibilityState check.
    const { data: agentsData } = useQuery({
        queryKey: ["agents-history", agentsUrl],
        queryFn: async () => {
            try {
                const r = await fetch(agentsUrl);
                if (!r.ok) throw new Error(`${r.status}`);
                return (await r.json()) as { agents: AgentInfo[] };
            } catch (e) {
                console.error("Agents fetch failed:", e);
                throw e;
            }
        },
        refetchInterval: 15000,
    });
    // Replace the base list on every successful poll (same as the old fetch
    // effect); the WS handlers above then patch `agents` directly for updates
    // that land between polls. Adjusted during render, not in an effect, since
    // this is just syncing local state to the latest query result.
    const fetchedAgents = agentsData?.agents ?? null;
    const [prevFetchedAgents, setPrevFetchedAgents] = useState<AgentInfo[] | null>(null);
    if (fetchedAgents && fetchedAgents !== prevFetchedAgents) {
        setPrevFetchedAgents(fetchedAgents);
        setAgents(fetchedAgents);
    }

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
            {logTab === "agents" && (
                <RosterGrid activeChars={activeChars} agents={agents} selectedChar={selectedChar} onSelect={setSelectedChar} />
            )}

            {/* Tab content */}
            {logTab === "agents" && <AgentLogList agents={filtered} onSelect={setSelected} />}
            {logTab === "mcp" && <McpList servers={mcpServers} />}
            {logTab === "cli" && <CliList />}

            {/* Character Profile Modal */}
            {selectedChar && (
                <CharacterProfileModal char={selectedChar} agents={agents} onClose={() => setSelectedChar(null)} />
            )}

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
