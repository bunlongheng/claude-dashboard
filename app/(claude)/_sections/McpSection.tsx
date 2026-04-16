"use client";

import { useEffect, useState } from "react";
import { Server, Globe, Terminal as TermIcon, Radio, Search } from "lucide-react";
import { useMachine } from "./MachineContext";

type McpInfo = { name: string; type: string; url?: string; command?: string; path: string };

const TYPE_COLORS: Record<string, string> = { http: "#3b82f6", sse: "#f59e0b", command: "#f97316" };

type McpFilter = "all" | "http" | "sse" | "command";

export default function McpSection() {
    const { machine } = useMachine();
    const [servers, setServers] = useState<McpInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<McpFilter>("all");

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.json())
            .then(d => { setServers(d.mcp ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [machine]);

    if (loading) return <p className="text-white/30 text-center py-16">Scanning…</p>;

    let filtered = servers;
    if (filter !== "all") filtered = filtered.filter(s => s.type === filter);
    if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || (s.url ?? "").toLowerCase().includes(q) || (s.command ?? "").toLowerCase().includes(q));
    }

    const byType = (t: string) => filtered.filter(s => s.type === t);
    const httpServers = byType("http");
    const sseServers = byType("sse");
    const cmdServers = byType("command");

    const tabs: { label: string; value: McpFilter; count: number; color: string }[] = [
        { label: "All", value: "all", count: servers.length, color: "#10b981" },
        { label: "HTTP", value: "http", count: servers.filter(s => s.type === "http").length, color: TYPE_COLORS.http },
        { label: "SSE", value: "sse", count: servers.filter(s => s.type === "sse").length, color: TYPE_COLORS.sse },
        { label: "Command", value: "command", count: servers.filter(s => s.type === "command").length, color: TYPE_COLORS.command },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    {tabs.map(t => (
                        <button key={t.value} onClick={() => setFilter(t.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                            style={{
                                background: filter === t.value ? `${t.color}20` : "rgba(255,255,255,0.03)",
                                border: filter === t.value ? `1px solid ${t.color}40` : "1px solid rgba(255,255,255,0.06)",
                                color: filter === t.value ? t.color : "rgba(255,255,255,0.4)",
                            }}>
                            {t.label}
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{t.count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search MCP servers…"
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{filtered.length} server{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Type summary */}
            <div className="grid grid-cols-3 gap-2 mb-6">
                {[
                    { label: "HTTP", count: httpServers.length, color: TYPE_COLORS.http, icon: Globe },
                    { label: "SSE", count: sseServers.length, color: TYPE_COLORS.sse, icon: Radio },
                    { label: "Command", count: cmdServers.length, color: TYPE_COLORS.command, icon: TermIcon },
                ].map(s => (
                    <div key={s.label} style={{
                        padding: "12px 14px", borderRadius: 10,
                        background: `${s.color}08`, border: `1px solid ${s.color}25`,
                        textAlign: "center",
                    }}>
                        <s.icon size={16} style={{ color: s.color, margin: "0 auto 4px" }} />
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.count}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Server list */}
            {servers.map(m => {
                const color = TYPE_COLORS[m.type] ?? "#6b7280";
                return (
                    <div key={m.name} style={{
                        padding: "12px 14px", marginBottom: 4, borderRadius: 8,
                        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                    }}>
                        <div className="flex items-center gap-2.5">
                            <Server size={14} style={{ color, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{m.name}</span>
                            <span style={{
                                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                                background: `${color}20`, color,
                            }}>{m.type}</span>
                        </div>
                        <p style={{
                            fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "4px 0 0 26px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{m.url ?? m.command ?? ""}</p>
                    </div>
                );
            })}

            {servers.length === 0 && <p className="text-white/20 text-center py-8 text-sm">No MCP servers found</p>}
        </div>
    );
}
