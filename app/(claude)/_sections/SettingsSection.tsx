"use client";

import { useEffect, useState } from "react";
import { Search, ChevronDown, ChevronRight, FolderOpen, Settings, LayoutGrid, List, X, CircleDot } from "lucide-react";
import AppIcon from "./AppIcon";
import { useMachine } from "./MachineContext";
import { MascotLoader } from "./MascotLoader";

interface ProjectSettings {
    project: string;
    path: string;
    settings: Record<string, unknown> | null;
    localSettings: Record<string, unknown> | null;
    instructions: string | null;
    hasHooks: boolean;
    hasCommands: boolean;
}

const ORB_COLORS = [
    "#f97316", "#7c3aed", "#2563eb", "#16a34a", "#db2777",
    "#0891b2", "#dc2626", "#d97706", "#0d9488", "#4338ca",
    "#e11d48", "#65a30d",
];

// ── JSON Modal ───────────────────────────────────────────────────────────────
function JsonModal({ title, data, hue, onClose }: {
    title: string;
    data: Record<string, unknown> | string;
    hue: number;
    onClose: () => void;
}) {
    const color = `hsl(${hue}, 85%, 55%)`;
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                width: "100%", maxWidth: 680, maxHeight: "85vh",
                background: "#12131a", borderRadius: 16,
                border: `1px solid ${color}30`,
                boxShadow: `0 0 60px ${color}15, 0 20px 60px rgba(0,0,0,0.5)`,
                display: "flex", flexDirection: "column", overflow: "hidden",
                animation: "thumbIn 0.25s ease",
            }}>
                <div style={{
                    padding: "14px 18px", borderBottom: `1px solid ${color}20`,
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: `linear-gradient(135deg, ${color}, hsl(${hue + 15}, 85%, 50%))`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 16px ${color}40`,
                    }}>
                        <Settings size={14} style={{ color: "#fff" }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>{title}</span>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
                    <pre style={{
                        fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.65)",
                        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                    }}>{text}</pre>
                </div>
            </div>
        </div>
    );
}

// ── Expandable list card ─────────────────────────────────────────────────────
function SettingsCard({ title, project, data, search }: { title: string; project?: string; data: Record<string, unknown> | null; search: string }) {
    const [expanded, setExpanded] = useState(false);
    if (!data || Object.keys(data).length === 0) return null;
    const text = JSON.stringify(data, null, 2);
    if (search.trim() && !text.toLowerCase().includes(search.toLowerCase())) return null;

    return (
        <div style={{
            padding: "10px 14px", marginBottom: 4, borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.55)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.55)" }} />}
                {project ? <AppIcon project={project} size={14} /> : <Settings size={12} style={{ color: "#f59e0b" }} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{project || title}</span>
                <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: title.includes("local") ? "rgba(245,158,11,0.15)" : "rgba(107,114,128,0.15)", color: title.includes("local") ? "#f59e0b" : "#6b7280" }}>
                    {title.includes("local") ? "LOCAL" : "SETTINGS"}
                </span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>{Object.keys(data).length} keys</span>
            </div>
            {expanded && (
                <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 8,
                    background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.7)",
                    overflow: "auto", maxHeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontFamily: "monospace",
                }}>{text}</pre>
            )}
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", margin: "3px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                {(project ? `~/Sites/${project}/.claude/` : "~/.claude/") + (title.includes("local") ? "settings.local.json" : title.includes("instructions") ? "instructions.md" : "settings.json")}
            </p>
        </div>
    );
}

function InstructionsCard({ project, content, search }: { project: string; content: string; search: string }) {
    const [expanded, setExpanded] = useState(false);
    if (search.trim() && !content.toLowerCase().includes(search.toLowerCase())) return null;

    return (
        <div style={{
            padding: "10px 14px", marginBottom: 4, borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.55)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.55)" }} />}
                <AppIcon project={project} size={14} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{project}</span>
                <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(52,199,89,0.15)", color: "#34C759" }}>INSTRUCTIONS</span>
            </div>
            {expanded && (
                <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 8,
                    background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.7)",
                    overflow: "auto", maxHeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontFamily: "monospace",
                }}>{content}</pre>
            )}
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", margin: "3px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                ~/Sites/{project}/.claude/instructions.md
            </p>
        </div>
    );
}

// ── Project thumb ────────────────────────────────────────────────────────────
function ProjectThumb({ project, hue, index, onClick }: {
    project: string;
    hue: number;
    index: number;
    onClick: () => void;
}) {
    const color = `hsl(${hue}, 85%, 55%)`;
    const [imgError, setImgError] = useState(false);

    return (
        <div
            onClick={onClick}
            className="cursor-pointer group"
            style={{
                borderRadius: 16, overflow: "hidden", position: "relative",
                background: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`,
                aspectRatio: "1",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                boxShadow: "none",
                transition: "transform 0.2s, box-shadow 0.2s",
                animation: `thumbIn 0.4s ease ${index * 0.02}s both`,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`;
                const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement;
                if (icon) icon.style.animation = "navShake 0.4s ease";
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "none";
                const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement;
                if (icon) icon.style.animation = "none";
            }}
        >
            <div className="thumb-icon" style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {!imgError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={`/api/claude/project-icon?project=${encodeURIComponent(project)}`}
                        alt={project}
                        width={24}
                        height={24}
                        onError={() => setImgError(true)}
                        style={{ borderRadius: 4, objectFit: "cover" }}
                    />
                ) : (
                    <FolderOpen size={24} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }} />
                )}
            </div>
            <span style={{
                fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                textTransform: "uppercase", letterSpacing: "0.03em",
                textAlign: "center", padding: "0 4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
            }}>{project}</span>
        </div>
    );
}

// ── Global setting thumb ─────────────────────────────────────────────────────
function GlobalThumb({ label, hue, index, onClick }: {
    label: string;
    hue: number;
    index: number;
    onClick: () => void;
}) {
    return (
        <div
            onClick={onClick}
            className="cursor-pointer"
            style={{
                borderRadius: 16, overflow: "hidden", position: "relative",
                background: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`,
                aspectRatio: "1",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                boxShadow: "none",
                transition: "transform 0.2s, box-shadow 0.2s",
                animation: `thumbIn 0.4s ease ${index * 0.02}s both`,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`;
                const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement;
                if (icon) icon.style.animation = "navShake 0.4s ease";
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "none";
                const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement;
                if (icon) icon.style.animation = "none";
            }}
        >
            <Settings size={24} className="thumb-icon" style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }} />
            <span style={{
                fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                textTransform: "uppercase", letterSpacing: "0.03em",
                textAlign: "center", padding: "0 4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
            }}>{label}</span>
        </div>
    );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SettingsSection() {
    const { apiBase } = useMachine();
    const [globalSettings, setGlobalSettings] = useState<Record<string, unknown> | null>(null);
    const [globalLocalSettings, setGlobalLocalSettings] = useState<Record<string, unknown> | null>(null);
    const [projects, setProjects] = useState<ProjectSettings[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState<"thumbs" | "list" | "circles">("circles");
    const [modal, setModal] = useState<{ title: string; data: Record<string, unknown> | string; hue: number } | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    useEffect(() => {
        fetch(apiBase("/api/claude/settings?slim=1"))
            .then(r => r.json())
            .then(d => {
                setGlobalSettings(d.global?.settings ?? null);
                setGlobalLocalSettings(d.global?.localSettings ?? null);
                setProjects(d.projects ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [apiBase]);

    if (loading) return <MascotLoader label="Loading settings" />;

    const totalFiles = (globalSettings ? 1 : 0) + (globalLocalSettings ? 1 : 0) +
        projects.reduce((n, p) => n + (p.settings ? 1 : 0) + (p.localSettings ? 1 : 0) + (p.instructions ? 1 : 0), 0);

    // Build all thumb items: global first, then per-project
    const thumbItems: Array<{ key: string; label: string; isGlobal: boolean; isLocal?: boolean; hue: number; data: Record<string, unknown> | string | null }> = [];
    let thumbIdx = 0;

    if (globalSettings) {
        thumbItems.push({ key: "global-settings", label: "Global", isGlobal: true, hue: Math.round((thumbIdx++ / Math.max(1, totalFiles)) * 360), data: globalSettings });
    }
    if (globalLocalSettings) {
        thumbItems.push({ key: "global-local", label: "Global Local", isGlobal: true, isLocal: true, hue: Math.round((thumbIdx++ / Math.max(1, totalFiles)) * 360), data: globalLocalSettings });
    }
    for (const p of projects) {
        if (p.settings) {
            thumbItems.push({ key: `${p.project}-settings`, label: p.project, isGlobal: false, hue: Math.round((thumbIdx++ / Math.max(1, totalFiles)) * 360), data: p.settings });
        }
        if (p.localSettings) {
            thumbItems.push({ key: `${p.project}-local`, label: `${p.project} local`, isGlobal: false, isLocal: true, hue: Math.round((thumbIdx++ / Math.max(1, totalFiles)) * 360), data: p.localSettings });
        }
        if (p.instructions) {
            thumbItems.push({ key: `${p.project}-instructions`, label: `${p.project} inst`, isGlobal: false, hue: Math.round((thumbIdx++ / Math.max(1, totalFiles)) * 360), data: p.instructions });
        }
    }

    const filteredThumbs = search.trim()
        ? thumbItems.filter(t => {
            const text = typeof t.data === "string" ? t.data : JSON.stringify(t.data);
            return t.label.toLowerCase().includes(search.toLowerCase()) || text.toLowerCase().includes(search.toLowerCase());
        })
        : thumbItems;

    const orbItems = filteredThumbs.slice(0, 40);

    return (
        <div>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{totalFiles} files</span>
                <div className="flex gap-1 ml-auto">
                    {([["thumbs", LayoutGrid], ["list", List], ["circles", CircleDot]] as const).map(([mode, ModeIcon]) => (
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

            {/* Thumbs view */}
            {viewMode === "thumbs" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {filteredThumbs.map((item, i) => (
                        item.isGlobal ? (
                            <GlobalThumb
                                key={item.key}
                                label={item.label}
                                hue={item.hue}
                                index={i}
                                onClick={() => item.data && setModal({ title: item.label, data: item.data as Record<string, unknown>, hue: item.hue })}
                            />
                        ) : (
                            <ProjectThumb
                                key={item.key}
                                project={item.label}
                                hue={item.hue}
                                index={i}
                                onClick={() => item.data && setModal({ title: item.label, data: item.data as Record<string, unknown>, hue: item.hue })}
                            />
                        )
                    ))}
                    {filteredThumbs.length === 0 && (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px 0" }}>
                            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                                {search ? `No settings matching "${search}"` : "No settings found"}
                            </p>
                        </div>
                    )}
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
                            ALL SETTINGS
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.06)", marginTop: 4 }}>
                            {orbItems.length}
                        </div>
                    </div>
                    {/* Cards in circle */}
                    {orbItems.map((item, i) => {
                        const n = orbItems.length;
                        const angle = (2 * Math.PI * i / n) - Math.PI / 2;
                        const r = 42;
                        const x = 50 + r * Math.cos(angle);
                        const y = 50 + r * Math.sin(angle);
                        const color = ORB_COLORS[i % ORB_COLORS.length];
                        const isHovered = hoveredIdx === i;
                        return (
                            <div key={item.key}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                onClick={() => item.data && setModal({ title: item.label, data: item.data as Record<string, unknown>, hue: item.hue })}
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
                                    {item.isGlobal
                                        ? <Settings size={isHovered ? 22 : 18} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
                                        : <FolderOpen size={isHovered ? 22 : 18} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
                                    }
                                </div>
                                <span style={{
                                    fontSize: 8, fontWeight: 600,
                                    color: isHovered ? "#fff" : "rgba(255,255,255,0.45)",
                                    textAlign: "center", maxWidth: 80, lineHeight: 1.2,
                                    transition: "color 0.2s",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {item.label}
                                </span>
                            </div>
                        );
                    })}
                    {orbItems.length === 0 && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                                {search ? `No settings matching "${search}"` : "No settings found"}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* List view */}
            {viewMode === "list" && (
                <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.52)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Global</p>
                    <SettingsCard title="settings.json" data={globalSettings} search={search} />
                    <SettingsCard title="settings.local.json" data={globalLocalSettings} search={search} />

                    {projects.length > 0 && (
                        <>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.52)", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                Per-project ({projects.length})
                            </p>
                            {projects.map(p => (
                                <div key={p.project}>
                                    <SettingsCard title="settings.json" project={p.project} data={p.settings} search={search} />
                                    <SettingsCard title="settings.local.json" project={p.project} data={p.localSettings} search={search} />
                                    {p.instructions && <InstructionsCard project={p.project} content={p.instructions} search={search} />}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}

            {/* JSON modal */}
            {modal && (
                <JsonModal
                    title={modal.title}
                    data={modal.data}
                    hue={modal.hue}
                    onClose={() => setModal(null)}
                />
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
