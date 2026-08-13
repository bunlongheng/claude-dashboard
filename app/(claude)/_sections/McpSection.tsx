"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
    Server, Globe, Terminal as TermIcon, Radio, Search, X,
    Mail, Calendar, FileText, Bell, Cloud, Database, MessageSquare,
    Eye, Zap, Shield, Code, Webhook, Puzzle, Brain, Briefcase,
    LayoutGrid, CircleDot, List,
} from "lucide-react";
import { FileViews } from "./FileViews";
import { useMachine } from "./MachineContext";
import { SegmentedTabs } from "./shared";
import AppIcon from "./AppIcon";

type McpInfo = { name: string; type: string; url?: string; command?: string; path: string; createdAt?: string | null; source?: "user" | "plugin" };
type McpFilter = "all" | "mine" | "shipped";

const TYPE_COLORS: Record<string, string> = { http: "#3b82f6", sse: "#f59e0b", command: "#f97316" };

const MCP_ICONS: Record<string, typeof Server> = {
    gmail: Mail, "google-calendar": Calendar, "google-drive": FileText,
    notion: Brain, slack: MessageSquare, stickies: Bell,
    "brave-search": Search, puppeteer: Eye, playwright: Eye,
    filesystem: Database, memory: Brain, "sequential-thinking": Zap,
    fetch: Globe, everything: Zap, github: Code, sentry: Shield,
    cloudflare: Cloud, vercel: Cloud, supabase: Database,
    postgres: Database, sqlite: Database, webhooks: Webhook,
    context7: Puzzle, tavily: Search, perplexity: Search,
    mindmaps: Brain, diagrams: Briefcase, "rag-memory": Database,
    "local-apps": Server, tools: Zap, drop: Cloud, clip: Code,
    frames: Eye, vault: Shield, safe: Shield,
};

const ORB_COLORS = [
    "#f97316", "#8b5cf6", "#3b82f6", "#10b981", "#ef4444", "#ec4899",
    "#06b6d4", "#f59e0b", "#14b8a6", "#a855f7", "#6366f1", "#84cc16",
    "#e879f9", "#22d3ee", "#fb923c", "#4ade80",
];

function getMcpIcon(name: string) {
    const lower = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    for (const [key, icon] of Object.entries(MCP_ICONS)) {
        if (lower.includes(key)) return icon;
    }
    return Server;
}

function cleanName(name: string): string {
    return name
        .replace(/^mcp-/i, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

function McpModal({ server, color, onClose }: { server: McpInfo; color: string; onClose: () => void }) {
    const Icon = getMcpIcon(server.name);
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} />
            <div style={{
                position: "relative", background: "#111318", borderRadius: 20, padding: 32,
                maxWidth: 480, width: "90vw", border: `1px solid ${color}30`,
                boxShadow: `0 0 60px ${color}15`,
            }} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: "absolute", top: 16, right: 16, background: "none", border: "none",
                    color: "rgba(255,255,255,0.55)", cursor: "pointer",
                }}><X size={18} /></button>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${color}, ${color}80)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 24px ${color}30`,
                    }}>
                        <Icon size={24} style={{ color: "#fff" }} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{cleanName(server.name)}</h3>
                        <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                            background: `${TYPE_COLORS[server.type] ?? "#666"}20`,
                            color: TYPE_COLORS[server.type] ?? "#666",
                        }}>{server.type.toUpperCase()}</span>
                    </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {server.url && (
                        <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", marginBottom: 4 }}>URL</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", wordBreak: "break-all" }}>{server.url}</div>
                        </div>
                    )}
                    {server.command && (
                        <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", marginBottom: 4 }}>Command</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "monospace", wordBreak: "break-all" }}>{server.command}</div>
                        </div>
                    )}
                    <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", marginBottom: 4 }}>Config</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "monospace", wordBreak: "break-all" }}>{server.path}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}


export default function McpSection() {
    const { machine, apiBase } = useMachine();
    const [servers, setServers] = useState<McpInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<McpFilter>("mine");
    const [selected, setSelected] = useState<McpInfo | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<"thumbs" | "list" | "circles">("list");
    useEffect(() => {
        setLoading(true);
        // apiBase already routes to the right host; the legacy ?machine= triggers
        // a self-proxy on the remote and returns zero servers (sidebar shows 36
        // but page shows 0). Drop it - same bug pattern we fixed elsewhere.
        fetch(apiBase("/api/claude/skills?slim=1"))
            .then(r => r.json())
            .then(d => { setServers(d.mcp ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    const filtered = useMemo(() => {
        let list = servers;
        // "mine" = servers you configured (.mcp.json / ~/.claude.json);
        // "shipped" = bundled by an installed plugin.
        if (filter === "mine") list = list.filter(s => s.source !== "plugin");
        else if (filter === "shipped") list = list.filter(s => s.source === "plugin");
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || (s.url ?? "").toLowerCase().includes(q));
        }
        // Newest first (servers with no createdAt sort last).
        return [...list].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    }, [servers, filter, search]);

    const mineCount = servers.filter(s => s.source !== "plugin").length;
    const shippedCount = servers.filter(s => s.source === "plugin").length;
    const tabs: { label: string; value: McpFilter; count: number; color: string }[] = [
        { label: "Mine", value: "mine", count: mineCount, color: "#8AC249" },
        { label: "Shipped", value: "shipped", count: shippedCount, color: TYPE_COLORS.http },
        { label: "All", value: "all", count: servers.length, color: "#5AC8FA" },
    ];

    if (loading) return <p className="text-white/30 text-center py-16">Scanning MCP servers...</p>;

    return (
        <div>
            {/* Source filter + Search + view toggle */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <SegmentedTabs
                    value={filter}
                    onChange={(v) => setFilter(v as McpFilter)}
                    accent="#FFCC00"
                    tabs={tabs.map(t => ({ key: t.value, label: t.label, count: t.count }))}
                />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[200px] ml-auto"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <div className="flex gap-1">
                    {([["list", List], ["thumbs", LayoutGrid], ["circles", CircleDot]] as const).map(([mode, ModeIcon]) => (
                        <button key={mode} onClick={() => setViewMode(mode)}
                            className="p-1.5 rounded-md cursor-pointer transition"
                            style={{
                                background: viewMode === mode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                                border: viewMode === mode ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                                color: viewMode === mode ? "#fff" : "rgba(255,255,255,0.3)",
                            }}>
                            <ModeIcon size={14} />
                        </button>
                    ))}
                </div>
            </div>

            {viewMode === "list" && (
                <FileViews mode="list" accent="#FFCC00"
                    items={filtered.map(s => ({
                        id: s.path, name: s.name,
                        description: `${s.type}${s.url ? ` · ${s.url}` : s.command ? ` · ${s.command}` : ""}`,
                        path: s.path, badge: s.source,
                        content: [`Type: ${s.type}`, s.url ? `URL: ${s.url}` : "", s.command ? `Command: ${s.command}` : "", `Path: ${s.path}`].filter(Boolean).join("\n"),
                    }))}
                />
            )}
            {/* Thumbs grid */}
            {viewMode === "thumbs" && (
                <div className="hidden md:grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {filtered.map((s, i) => {
                        const hue = Math.round((i / filtered.length) * 360);
                        const Icon = getMcpIcon(s.name);
                        return (
                            <div key={`t-${s.name}`}
                                onClick={() => setSelected(s)}
                                className="cursor-pointer"
                                style={{
                                    borderRadius: 16, overflow: "hidden", position: "relative",
                                    background: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`,
                                    aspectRatio: "1",
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                                    boxShadow: "none",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                    animation: `thumbIn 0.4s ease ${i * 0.02}s both`,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`; const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement; if (icon) icon.style.animation = "navShake 0.4s ease"; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 2px 12px hsla(${hue}, 85%, 55%, 0.3)`; const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement; if (icon) icon.style.animation = "none"; }}>
                                <Icon size={24} className="thumb-icon" style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }} />
                                <span style={{
                                    fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                                    textTransform: "uppercase", letterSpacing: "0.03em",
                                    textAlign: "center", padding: "0 4px",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
                                }}>{cleanName(s.name)}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Orbital layout */}
            {viewMode === "circles" && (
            <div className="hidden md:block" style={{ position: "relative", width: "100%", aspectRatio: "1", maxWidth: 800, margin: "0 auto" }}>
                {/* Center label */}
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                    textAlign: "center", pointerEvents: "none",
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {filter === "all" ? "MCP" : filter.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: "rgba(255,255,255,0.12)" }}>
                        {filtered.length}
                    </div>
                </div>

                {/* Orbital circles */}
                {filtered.map((s, i) => {
                    const n = filtered.length;
                    // Newest (i=0) at 12 o'clock, then counter-clockwise: 1, 2, 3...
                    const angle = -Math.PI / 2 - (2 * Math.PI * i / n);
                    const r = 42;
                    const x = 50 + r * Math.cos(angle);
                    const y = 50 + r * Math.sin(angle);
                    const color = ORB_COLORS[i % ORB_COLORS.length];
                    const isHovered = hoveredIdx === i;
                    const Icon = getMcpIcon(s.name);
                    return (
                        <div key={s.name}
                            onClick={() => setSelected(s)}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            style={{
                                position: "absolute",
                                left: `${x}%`, top: `${y}%`,
                                transform: `translate(-50%, -50%) scale(${isHovered ? 1.12 : 1})`,
                                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                                cursor: "pointer", zIndex: isHovered ? 2 : 1,
                                transition: "transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.4s",
                                animation: `orbitalIn 0.7s cubic-bezier(.34,1.56,.64,1) ${i * 0.05}s both`,
                            }}>
                            <div style={{
                                width: isHovered ? 72 : 60, height: isHovered ? 72 : 60, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: isHovered ? `0 0 30px ${color}60` : `0 2px 10px ${color}25`,
                                transition: "all 0.3s",
                            }}>
                                <Icon size={isHovered ? 24 : 20} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
                            </div>
                            <span style={{
                                fontSize: 9, fontWeight: 600,
                                color: isHovered ? "#fff" : "rgba(255,255,255,0.45)",
                                textAlign: "center", maxWidth: 80, lineHeight: 1.2,
                                transition: "color 0.2s",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                                {cleanName(s.name)}
                            </span>
                        </div>
                    );
                })}
            </div>
            )}

            {/* Mobile grid fallback */}
            <div className="md:hidden grid grid-cols-3 gap-3">
                {filtered.map((s, i) => {
                    const color = ORB_COLORS[i % ORB_COLORS.length];
                    const Icon = getMcpIcon(s.name);
                    return (
                        <div key={s.name} onClick={() => setSelected(s)}
                            className="flex flex-col items-center gap-2 py-3 cursor-pointer">
                            <div style={{
                                width: 52, height: 52, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: `0 2px 10px ${color}25`,
                            }}>
                                <Icon size={20} style={{ color: "rgba(255,255,255,0.9)" }} />
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
                                {cleanName(s.name)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {filtered.length === 0 && <p className="text-white/20 text-center py-8 text-sm">No MCP servers found</p>}

            <style>{`
                @keyframes orbitalIn {
                    from { opacity: 0; transform: translate(-50%, -50%) rotate(-72deg) scale(0.15); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                @keyframes thumbIn {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes navShake {
                    0% { transform: rotate(0); }
                    20% { transform: rotate(-14deg); }
                    40% { transform: rotate(10deg); }
                    60% { transform: rotate(-6deg); }
                    80% { transform: rotate(3deg); }
                    100% { transform: rotate(0); }
                }
            `}</style>

            {/* Server Modal */}
            {selected && (
                <McpModal
                    server={selected}
                    color={ORB_COLORS[filtered.indexOf(selected) % ORB_COLORS.length]}
                    onClose={() => setSelected(null)}
                />
            )}

        </div>
    );
}
