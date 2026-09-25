"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Puzzle, Search, LayoutGrid, List, CircleDot } from "lucide-react";
import { useMachine } from "./MachineContext";
import { fetchJson, FetchError } from "./shared";

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type PluginFilter = "all" | "builtin" | "external" | "lsp";
type ViewMode = "thumbs" | "list" | "circles";

const TYPE_COLORS: Record<string, string> = { builtin: "#8b5cf6", external: "#22c55e", lsp: "#6b7280" };

const ORB_COLORS = [
    "#f97316", "#7c3aed", "#2563eb", "#16a34a", "#db2777",
    "#0891b2", "#dc2626", "#d97706", "#0d9488", "#4338ca",
    "#e11d48", "#65a30d",
];

export default function PluginsSection() {
    const { machine, apiBase } = useMachine();
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<PluginFilter>("external");
    const [viewMode, setViewMode] = useState<"thumbs" | "list" | "circles">("list");
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const pluginsUrl = apiBase(`/api/claude/skills?slim=1${machine ? `&machine=${machine}` : ""}`);
    const pluginsQuery = useQuery<{ plugins?: PluginInfo[] }>({
        queryKey: ["plugins-skills", pluginsUrl],
        queryFn: () => fetchJson<{ plugins?: PluginInfo[] }>(pluginsUrl),
    });
    const plugins = useMemo(() => pluginsQuery.data?.plugins ?? [], [pluginsQuery.data]);
    const loading = pluginsQuery.isLoading;

    const filtered = useMemo(() => {
        let list = plugins;
        if (filter !== "all") list = list.filter(p => p.type === filter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
        }
        return list;
    }, [plugins, filter, search]);

    if (loading) return <p className="text-white/30 text-center py-16">Scanning plugins...</p>;

    const counts = {
        builtin: plugins.filter(p => p.type === "builtin").length,
        external: plugins.filter(p => p.type === "external").length,
        lsp: plugins.filter(p => p.type === "lsp").length,
    };

    const tabs: { label: string; value: PluginFilter; count: number; color: string }[] = [
        { label: "All", value: "all", count: plugins.length, color: "#8b5cf6" },
        { label: "Built-in", value: "builtin", count: counts.builtin, color: TYPE_COLORS.builtin },
        { label: "External", value: "external", count: counts.external, color: TYPE_COLORS.external },
        { label: "LSP", value: "lsp", count: counts.lsp, color: TYPE_COLORS.lsp },
    ];

    const orbItems = filtered.slice(0, 40);

    return (
        <div>
            {/* Filter + Search + View toggle */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    {tabs.map(t => (
                        <button key={t.value} onClick={() => setFilter(t.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                            style={{
                                background: filter === t.value ? `${t.color}20` : "rgba(255,255,255,0.03)",
                                border: filter === t.value ? `1px solid ${t.color}40` : "1px solid rgba(255,255,255,0.06)",
                                color: filter === t.value ? t.color : "rgba(255,255,255,0.52)",
                            }}>
                            {t.label}
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{t.count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plugins..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    {filtered.length} plugin{filtered.length !== 1 ? "s" : ""}
                </span>
                {/* View toggle */}
                <div className="flex gap-1 ml-auto">
                    {([["thumbs", LayoutGrid], ["list", List], ["circles", CircleDot]] as const).map(([mode, ModeIcon]) => (
                        <button key={mode} type="button" onClick={() => setViewMode(mode)} aria-label={`${mode} view`} title={`${mode} view`} aria-pressed={viewMode === mode}
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

            {/* Thumbs view */}
            {viewMode === "thumbs" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {filtered.map((p, i) => {
                        const hue = Math.round((i / Math.max(filtered.length, 1)) * 360);
                        const color = `hsl(${hue}, 85%, 55%)`;
                        return (
                            <div key={p.name}
                                className="cursor-pointer group"
                                style={{
                                    borderRadius: 16,
                                    background: color,
                                    backgroundImage: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`,
                                    aspectRatio: "1",
                                    display: "flex", flexDirection: "column",
                                    alignItems: "center", justifyContent: "center", gap: 8,
                                    boxShadow: "none",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                    animation: `thumbIn 0.4s ease ${i * 0.02}s both`,
                                    overflow: "hidden",
                                    position: "relative",
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = "scale(1.05)";
                                    e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`;
                                    const icon = e.currentTarget.querySelector(".plug-icon") as HTMLElement;
                                    if (icon) { icon.style.animation = "none"; void icon.offsetWidth; icon.style.animation = "navShake 0.4s ease"; }
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = "scale(1)";
                                    e.currentTarget.style.boxShadow = "none";
                                    const icon = e.currentTarget.querySelector(".plug-icon") as HTMLElement;
                                    if (icon) icon.style.animation = "none";
                                }}>
                                <Puzzle size={24} className="plug-icon" style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }} />
                                <span style={{
                                    fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                                    textTransform: "uppercase", letterSpacing: "0.03em",
                                    textAlign: "center", padding: "0 4px",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
                                }}>{p.name}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Orbital circles view - desktop only */}
            {viewMode === "circles" && (
                <div className="hidden md:block" style={{ position: "relative", width: "100%", aspectRatio: "1", maxWidth: 900, margin: "0 auto" }}>
                    {/* Center label */}
                    <div style={{
                        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                        textAlign: "center", pointerEvents: "none", zIndex: 0,
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                            {filter === "all" ? "ALL PLUGINS" : filter.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.06)", marginTop: 4 }}>
                            {orbItems.length}
                        </div>
                    </div>
                    {/* Cards in circle */}
                    {orbItems.map((p, i) => {
                        const n = orbItems.length;
                        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
                        const r = 42;
                        const x = 50 + r * Math.cos(angle);
                        const y = 50 + r * Math.sin(angle);
                        const color = ORB_COLORS[i % ORB_COLORS.length];
                        const isHovered = hoveredIdx === i;
                        return (
                            <div key={p.name}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                style={{
                                    position: "absolute",
                                    left: `${x}%`, top: `${y}%`,
                                    transform: `translate(-50%, -50%) scale(${isHovered ? 1.12 : 1})`,
                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                                    cursor: "pointer", zIndex: isHovered ? 2 : 1,
                                    transition: "transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.4s",
                                    animation: `orbitalIn 0.7s cubic-bezier(.34,1.56,.64,1) ${i * 0.04}s both`,
                                }}>
                                <div style={{
                                    width: isHovered ? 64 : 52, height: isHovered ? 64 : 52, borderRadius: "50%",
                                    background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    boxShadow: isHovered ? `0 0 30px ${color}60` : `0 2px 10px ${color}25`,
                                    transition: "all 0.3s",
                                }}>
                                    <Puzzle size={isHovered ? 22 : 18} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
                                </div>
                                <span style={{
                                    fontSize: 8, fontWeight: 600,
                                    color: isHovered ? "#fff" : "rgba(255,255,255,0.45)",
                                    textAlign: "center", maxWidth: 80, lineHeight: 1.2,
                                    transition: "color 0.2s",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {p.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List view */}
            {viewMode === "list" && (
                <div className="space-y-1">
                    {filtered.map(p => {
                        const color = TYPE_COLORS[p.type] ?? "#6b7280";
                        const projectName = p.path.split("/").slice(-2, -1)[0] ?? p.name;
                        return (
                            <div key={p.name} style={{
                                padding: "10px 12px", borderRadius: 8,
                                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                            }}>
                                <div className="flex items-center gap-2 mb-1">
                                    <Puzzle size={12} style={{ color }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{p.name}</span>
                                    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${color}20`, color }}>{p.type}</span>
                                    <div className="flex items-center gap-1.5 ml-auto">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={`/api/claude/project-icon?project=${encodeURIComponent(projectName)}`}
                                            alt=""
                                            width={14} height={14}
                                            style={{ borderRadius: 3, opacity: 0.7, flexShrink: 0 }}
                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </div>
                                </div>
                                {p.description && p.description !== p.name && (
                                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.52)", margin: 0, paddingLeft: 20 }}>{p.description}</p>
                                )}
                                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", margin: "3px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                                    {p.path.replace(/.*\.claude\//, "~/.claude/")}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {pluginsQuery.isError && <FetchError what="plugins" onRetry={() => pluginsQuery.refetch()} />}
            {!pluginsQuery.isError && filtered.length === 0 && (
                <p className="text-white/20 text-center py-8 text-[11px]">
                    {search ? `No plugins matching "${search}"` : "No plugins found"}
                </p>
            )}

            <style>{`
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
                @keyframes orbitalIn {
                    from { opacity: 0; transform: translate(-50%, -50%) rotate(-72deg) scale(0.15); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `}</style>
        </div>
    );
}
