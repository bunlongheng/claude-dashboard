"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Webhook, ChevronDown, ChevronRight, Search, LayoutGrid, List, CircleDot } from "lucide-react";
import { fetchJson, FetchError, useDialog } from "./shared";
import { useMachine } from "./MachineContext";

type HookInfo = { name: string; plugin: string; events: string[]; command?: string; path: string };

const COLOR = "#a3e635";

const ORB_COLORS = [
    "#f97316", "#7c3aed", "#2563eb", "#16a34a", "#db2777",
    "#0891b2", "#dc2626", "#d97706", "#0d9488", "#4338ca",
    "#e11d48", "#65a30d",
];

function HookCard({ hook }: { hook: HookInfo }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div style={{
            padding: "8px 12px", marginBottom: 2, borderRadius: 6,
            background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                <Webhook size={12} style={{ color: COLOR, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>{hook.plugin}</span>
                <div className="flex gap-1">
                    {hook.events.map(e => (
                        <span key={e} style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${COLOR}12`, color: COLOR }}>{e}</span>
                    ))}
                </div>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginLeft: "auto", flexShrink: 0 }}>{hook.name.slice(0, 40)}</span>
            </div>
            {expanded && (
                <div style={{ marginTop: 6, paddingLeft: 20 }}>
                    {hook.command && (
                        <pre style={{
                            padding: 8, borderRadius: 6, marginBottom: 4,
                            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)",
                            fontSize: 9, color: "rgba(255,255,255,0.52)", overflow: "auto", maxHeight: 120,
                        }}>{hook.command}</pre>
                    )}
                    <p style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{hook.path.replace(/.*\.claude\//, "~/.claude/")}</p>
                </div>
            )}
        </div>
    );
}

function HookThumb({ hook, index, total, onClick }: { hook: HookInfo; index: number; total: number; onClick: () => void }) {
    const hue = Math.round((index / Math.max(total, 1)) * 360);
    const color = `hsl(${hue}, 85%, 55%)`;

    return (
        <div
            onClick={onClick}
            className="cursor-pointer group"
            style={{
                borderRadius: 16, overflow: "hidden", position: "relative",
                background: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`,
                aspectRatio: "1",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "none",
                transition: "transform 0.2s, box-shadow 0.2s",
                animation: `thumbIn 0.4s ease ${index * 0.02}s both`,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`;
                const icon = e.currentTarget.querySelector(".hook-thumb-icon") as HTMLElement;
                if (icon) icon.style.animation = "navShake 0.4s ease";
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "none";
                const icon = e.currentTarget.querySelector(".hook-thumb-icon") as HTMLElement;
                if (icon) icon.style.animation = "none";
            }}
        >
            <Webhook size={24} className="hook-thumb-icon" style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }} />
            <span style={{
                fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                textTransform: "uppercase", letterSpacing: "0.03em",
                textAlign: "center", padding: "0 4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
            }}>{hook.plugin}</span>
            <span style={{
                position: "absolute", bottom: 6, right: 6,
                fontSize: 7, fontWeight: 800, color: "rgba(255,255,255,0.7)",
                background: "rgba(0,0,0,0.25)", padding: "1px 5px", borderRadius: 5,
            }}>{hook.events.length}</span>
        </div>
    );
}

function HookModal({ hook, onClose }: { hook: HookInfo; onClose: () => void }) {
    const dialog = useDialog(onClose, "hook-modal-title");
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
        }} onClick={onClose}>
            <div {...dialog} onClick={e => e.stopPropagation()} style={{
                width: "100%", maxWidth: 560,
                background: "#12131a", borderRadius: 16,
                border: `1px solid ${COLOR}30`,
                boxShadow: `0 0 60px ${COLOR}15, 0 20px 60px rgba(0,0,0,0.5)`,
                overflow: "hidden",
                animation: "modalIn 0.3s ease",
            }}>
                {/* Header */}
                <div style={{
                    padding: "16px 20px", borderBottom: `1px solid ${COLOR}20`,
                    display: "flex", alignItems: "center", gap: 12,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${COLOR}, ${COLOR}80)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 20px ${COLOR}40`,
                    }}>
                        <Webhook size={16} style={{ color: "#fff" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div id="hook-modal-title" style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{hook.plugin}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{hook.name}</div>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, fontSize: 18, lineHeight: 1 }}>x</button>
                </div>

                {/* Body */}
                <div style={{ padding: 20 }}>
                    <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Events</span>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {hook.events.map(e => (
                                <span key={e} style={{
                                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                                    background: `${COLOR}15`, color: COLOR, border: `1px solid ${COLOR}30`,
                                }}>{e}</span>
                            ))}
                        </div>
                    </div>
                    {hook.command && (
                        <div style={{ marginBottom: 12 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Command</span>
                            <pre style={{
                                marginTop: 6, padding: 10, borderRadius: 8,
                                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)",
                                fontSize: 10, color: "rgba(255,255,255,0.55)", overflow: "auto", margin: "6px 0 0",
                            }}>{hook.command}</pre>
                        </div>
                    )}
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 8, fontFamily: "monospace" }}>{hook.path.replace(/.*\.claude\//, "~/.claude/")}</p>
                </div>
            </div>
            <style>{`
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.9) rotate(-2deg); }
                    to { opacity: 1; transform: scale(1) rotate(0deg); }
                }
            `}</style>
        </div>
    );
}

export default function HooksSection() {
    const { machine, apiBase } = useMachine();
    const [search, setSearch] = useState("");
    const [eventFilter, setEventFilter] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"thumbs" | "list" | "circles">("list");
    const [selectedHook, setSelectedHook] = useState<HookInfo | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const q = machine ? `?machine=${machine}` : "";
    const hooksUrl = apiBase(`/api/claude/skills?slim=1${q ? "&" + q.slice(1) : ""}`);
    const { data, isFetching: loading, isError, refetch } = useQuery({
        queryKey: ["claude-hooks", hooksUrl],
        queryFn: () => fetchJson<{ hooks?: HookInfo[] }>(hooksUrl),
    });
    const hooks: HookInfo[] = data?.hooks ?? [];

    const allEvents = [...new Set(hooks.flatMap(h => h.events))].sort();

    let filtered = hooks;
    if (eventFilter) filtered = filtered.filter(h => h.events.includes(eventFilter));
    if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(h => h.name.toLowerCase().includes(q) || h.plugin.toLowerCase().includes(q) || h.events.some(e => e.toLowerCase().includes(q)));
    }

    if (loading) return <p className="text-white/30 text-center py-16">Scanning...</p>;

    const orbItems = filtered.slice(0, 40);

    return (
        <div>
            {/* Search + View Toggle */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[200px] ml-auto"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <div className="flex gap-1">
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
                    {filtered.map((h, i) => (
                        <HookThumb
                            key={h.plugin}
                            hook={h}
                            index={i}
                            total={filtered.length}
                            onClick={() => setSelectedHook(h)}
                        />
                    ))}
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
                            {eventFilter ? eventFilter.toUpperCase() : "ALL HOOKS"}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.06)", marginTop: 4 }}>
                            {orbItems.length}
                        </div>
                    </div>
                    {/* Cards in circle */}
                    {orbItems.map((h, i) => {
                        const n = orbItems.length;
                        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
                        const r = 42;
                        const x = 50 + r * Math.cos(angle);
                        const y = 50 + r * Math.sin(angle);
                        const color = ORB_COLORS[i % ORB_COLORS.length];
                        const isHovered = hoveredIdx === i;
                        return (
                            <div key={h.plugin}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                onClick={() => setSelectedHook(h)}
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
                                    position: "relative",
                                }}>
                                    <Webhook size={isHovered ? 22 : 18} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
                                    <span style={{
                                        position: "absolute", top: -3, right: -3,
                                        fontSize: 7, fontWeight: 800, color: "#fff",
                                        background: COLOR, padding: "1px 4px", borderRadius: 5,
                                        boxShadow: `0 1px 4px ${COLOR}50`,
                                    }}>{h.events.length}</span>
                                </div>
                                <span style={{
                                    fontSize: 8, fontWeight: 600,
                                    color: isHovered ? "#fff" : "rgba(255,255,255,0.45)",
                                    textAlign: "center", maxWidth: 80, lineHeight: 1.2,
                                    transition: "color 0.2s",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {h.plugin}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List view */}
            {viewMode === "list" && filtered.map(h => <HookCard key={h.plugin} hook={h} />)}

            {isError && <FetchError what="hooks" onRetry={() => refetch()} />}
            {!isError && filtered.length === 0 && (
                <p className="text-white/20 text-center py-8 text-sm">
                    {search ? `No hooks matching "${search}"` : "No hooks found"}
                </p>
            )}

            {/* Modal for thumb/orb click */}
            {selectedHook && (
                <HookModal hook={selectedHook} onClose={() => setSelectedHook(null)} />
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
