"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
    Zap, Search, Pencil, Save, X, Send, Copy, Eye, Code2,
    StickyNote, LayoutPanelTop, GitBranch, Monitor, Server, HardDrive, Cpu,
    AppWindow, Rocket, LayoutGrid, BarChart3, Lightbulb, Ban, FlaskConical,
    ClipboardList, TestTube2, PackageSearch, ShieldCheck, Bot, MessageSquare,
    Mic, Camera, QrCode, Sparkles, Star, Mail, Presentation, Triangle,
    type LucideIcon,
} from "lucide-react";
import { ACCENT } from "./shared";
import { useMachine, type MachineInfo } from "./MachineContext";
import { useToast } from "./ToastContext";

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type SkillInfo = { name: string; plugin: string; description: string; path: string; source?: "builtin" | "external"; content?: string };

// ── Orbital color palette ───────────────────────────────────────────────────
const ORB_COLORS = [
    "#f97316", "#7c3aed", "#2563eb", "#16a34a", "#db2777",
    "#0891b2", "#dc2626", "#d97706", "#0d9488", "#4338ca",
    "#e11d48", "#65a30d",
];

const ORB_ICONS = [
    "zap", "sparkles", "star", "bolt", "diamond", "hexagon",
    "triangle", "layers", "activity", "cpu", "terminal", "rocket",
];

const SKILL_ICONS: Record<string, LucideIcon> = {
    "stickies": StickyNote, "sticky": StickyNote, "/sticky": StickyNote,
    "deck": LayoutPanelTop, "/deck": LayoutPanelTop,
    "diagram": GitBranch, "/diagram": GitBranch,
    "sshM4": Monitor, "/sshM4": Monitor,
    "sshProd": Server, "/sshProd": Server,
    "sshPM2026": HardDrive, "/sshPM2026": HardDrive,
    "sshPi5": Cpu, "/sshPi5": Cpu,
    "local-apps": AppWindow, "/local-apps": AppWindow,
    "onboard": Rocket, "/onboard": Rocket,
    "zeta-sprint": LayoutGrid, "sprint-snapshot": LayoutGrid,
    "zeta-metrics": BarChart3,
    "zeta-loe": Lightbulb, "loe-insight": Lightbulb,
    "zeta-blocks": Ban,
    "zeta-qe": FlaskConical, "qe-zeta": FlaskConical,
    "zeta-chores": ClipboardList,
    "zeta-qa": TestTube2,
    "zeta-dev": Code2,
    "zeta-kpds": PackageSearch,
    "zeta-security": ShieldCheck,
    "zeta-bugs": Ban,
    "zeta-wins": Star,
    "zeta-highlight": Sparkles,
    "zeta-retro": Presentation,
    "zeta-releases": Rocket,
    "ai-ticket-flow": Bot,
    "slack-read": MessageSquare, "/slack-read": MessageSquare,
    "mimi": Mic, "/mimi": Mic,
    "screenshots": Camera,
    "show-lan": QrCode,
    "email": Mail, "/email": Mail,
    "pixel": Triangle,
    "tabs": LayoutPanelTop,
    "rag": Search,
};

function getSkillIcon(name: string): LucideIcon {
    const clean = name.replace(/^\//, "");
    return SKILL_ICONS[clean] || SKILL_ICONS[name] || Zap;
}

function skillTag(name: string): string {
    if (name.startsWith("/zeta") || name.startsWith("zeta-")) return "zeta";
    if (name.startsWith("/ssh") || name.startsWith("ssh")) return "ssh";
    if (name.startsWith("/local") || name.startsWith("local")) return "ops";
    return "custom";
}

function cleanName(name: string): string {
    return name
        .replace(/^\//, "")
        .replace(/^zeta-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

async function saveSkillFile(filePath: string, content: string): Promise<boolean> {
    try {
        const r = await fetch("/api/claude/skills", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath, content }),
        });
        return r.ok;
    } catch { return false; }
}

// ── Skill Modal ─────────────────────────────────────────────────────────────
function SkillModal({ skill, color, onClose, currentMachine, otherMachines, showToast }: {
    skill: SkillInfo; color: string; onClose: () => void;
    currentMachine: string | null; otherMachines: MachineInfo[];
    showToast: (msg: string, color?: string) => void;
}) {
    const [tab, setTab] = useState<"preview" | "code">("preview");
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(skill.content ?? "");
    const [draft, setDraft] = useState(skill.content ?? "");
    const [saving, setSaving] = useState(false);

    const handleSave = useCallback(async () => {
        setSaving(true);
        const ok = await saveSkillFile(skill.path, draft);
        setSaving(false);
        if (ok) { setContent(draft); setEditing(false); showToast("Saved"); }
        else showToast("Save failed", "#ef4444");
    }, [skill.path, draft, showToast]);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        showToast("Copied to clipboard");
    };

    async function syncTo(targetId: string) {
        try {
            const res = await fetch("/api/claude/sync-skill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from: currentMachine, to: targetId, plugin: skill.plugin, skill: skill.name }),
            });
            if (res.ok) {
                const target = otherMachines.find(m => m.id === targetId);
                showToast(`Copied to ${target?.hostname ?? targetId}`);
            } else showToast("Sync failed", "#ef4444");
        } catch { showToast("Sync failed", "#ef4444"); }
    }

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
                animation: "modalIn 0.3s ease",
            }}>
                {/* Header */}
                <div style={{
                    padding: "16px 20px", borderBottom: `1px solid ${color}20`,
                    display: "flex", alignItems: "center", gap: 12,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${color}, ${color}80)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 20px ${color}40`,
                    }}>
                        {(() => { const Icon = getSkillIcon(skill.name); return <Icon size={16} style={{ color: "#fff" }} />; })()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{cleanName(skill.name)}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>/{skill.name.replace(/^\//, "")}</div>
                    </div>
                    <button onClick={onClose} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "rgba(255,255,255,0.3)", padding: 4,
                    }}><X size={18} /></button>
                </div>

                {/* Toolbar */}
                <div style={{
                    padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", gap: 6,
                }}>
                    <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2 }}>
                        <button onClick={() => { setTab("preview"); setEditing(false); }}
                            style={{
                                background: tab === "preview" ? `${color}20` : "transparent",
                                border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer",
                                color: tab === "preview" ? color : "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                            }}><Eye size={11} /> Preview</button>
                        <button onClick={() => setTab("code")}
                            style={{
                                background: tab === "code" ? `${color}20` : "transparent",
                                border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer",
                                color: tab === "code" ? color : "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                            }}><Code2 size={11} /> Code</button>
                    </div>
                    <div style={{ flex: 1 }} />
                    {tab === "code" && !editing && (
                        <button onClick={() => { setEditing(true); setDraft(content); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4, display: "flex" }}>
                            <Pencil size={13} />
                        </button>
                    )}
                    {editing && (
                        <>
                            <button onClick={handleSave} disabled={saving}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e", padding: 4, display: "flex", opacity: saving ? 0.5 : 1 }}>
                                <Save size={13} />
                            </button>
                            <button onClick={() => { setDraft(content); setEditing(false); }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4, display: "flex" }}>
                                <X size={13} />
                            </button>
                        </>
                    )}
                    <button onClick={handleCopy} title="Copy"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4, display: "flex" }}>
                        <Copy size={13} />
                    </button>
                    {otherMachines.map(m => (
                        <button key={m.id} onClick={() => syncTo(m.id)} title={`Copy to ${m.hostname}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4, display: "flex", fontSize: 9, gap: 3, alignItems: "center" }}>
                            <Send size={10} /> {m.hostname}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
                    {tab === "preview" && (
                        <div style={{
                            fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.55)",
                            whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>{content || "(empty)"}</div>
                    )}
                    {tab === "code" && !editing && (
                        <pre style={{
                            fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.5)",
                            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                            fontFamily: "'SF Mono', 'Fira Code', monospace",
                        }}>{content || "(empty)"}</pre>
                    )}
                    {tab === "code" && editing && (
                        <textarea value={draft} onChange={e => setDraft(e.target.value)}
                            style={{
                                width: "100%", minHeight: 300, padding: 0,
                                background: "transparent", border: "none", outline: "none",
                                fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                                fontFamily: "'SF Mono', 'Fira Code', monospace", resize: "vertical",
                            }} />
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "8px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "monospace",
                }}>
                    {skill.path.replace(/.*\.claude\//, "~/.claude/")}
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

// ── Main Component ──────────────────────────────────────────────────────────
export default function SkillsSection() {
    const { machine, machines } = useMachine();
    const { showToast } = useToast();
    const [skills, setSkills] = useState<SkillInfo[]>([]);
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<SkillInfo | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.ok ? r.json() : { skills: [], commands: [], plugins: [] })
            .then(d => {
                const allSkills = [...(d.skills ?? [])];
                for (const cmd of (d.commands ?? [])) {
                    if (cmd.source === "external") {
                        allSkills.push({ name: cmd.name, plugin: cmd.plugin || "command", description: cmd.description, path: cmd.path, source: "external", content: cmd.content });
                    }
                }
                setSkills(allSkills);
                setPlugins(d.plugins ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [machine]);

    const otherMachines = machines.filter(m => m.id !== machine && m.online);

    const customSkills = useMemo(() => skills.filter(s => s.source === "external"), [skills]);

    const filtered = useMemo(() => {
        let list = customSkills;
        if (filter !== "all") list = list.filter(s => skillTag(s.name) === filter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
        }
        return list;
    }, [customSkills, filter, search]);

    // Get unique tags
    const tags = useMemo(() => {
        const counts: Record<string, number> = { all: customSkills.length };
        for (const s of customSkills) {
            const t = skillTag(s.name);
            counts[t] = (counts[t] ?? 0) + 1;
        }
        return Object.entries(counts)
            .filter(([, c]) => c > 0)
            .map(([tag, count]) => ({ tag, count }));
    }, [customSkills]);

    if (loading) return <p className="text-white/30 text-center py-16">Scanning skills...</p>;

    const TAG_COLORS: Record<string, string> = { all: "#f97316", zeta: "#7c3aed", ssh: "#16a34a", ops: "#0891b2", custom: "#db2777" };

    return (
        <div ref={containerRef}>
            {/* Filter + Search */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="flex gap-1.5">
                    {tags.map(({ tag, count }) => (
                        <button key={tag} onClick={() => setFilter(tag)}
                            className="px-3 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                            style={{
                                background: filter === tag ? `${TAG_COLORS[tag] ?? "#666"}20` : "rgba(255,255,255,0.03)",
                                border: filter === tag ? `1px solid ${TAG_COLORS[tag] ?? "#666"}50` : "1px solid rgba(255,255,255,0.06)",
                                color: filter === tag ? TAG_COLORS[tag] ?? "#666" : "rgba(255,255,255,0.35)",
                            }}>
                            {tag.toUpperCase()} <span style={{ opacity: 0.5, marginLeft: 3 }}>{count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[200px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1"
                        style={{ outline: "none", border: "none" }} />
                </div>
            </div>

            {/* Orbital circle - desktop */}
            <div className="hidden md:block" style={{ position: "relative", width: "100%", aspectRatio: "1", maxWidth: 900, margin: "0 auto" }}>
                {/* Center label */}
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                    textAlign: "center", pointerEvents: "none", zIndex: 0,
                }}>
                    <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.15)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        {filter === "all" ? "ALL SKILLS" : filter.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.06)", marginTop: 4 }}>
                        {filtered.length}
                    </div>
                </div>
                {/* Cards in circle */}
                {filtered.map((s, i) => {
                    const n = filtered.length;
                    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
                    const r = 42; // % from center
                    const x = 50 + r * Math.cos(angle);
                    const y = 50 + r * Math.sin(angle);
                    const color = ORB_COLORS[i % ORB_COLORS.length];
                    const isHovered = hoveredIdx === i;
                    return (
                        <div key={`${s.plugin}/${s.name}`}
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
                                animation: `orbitalIn 0.7s cubic-bezier(.34,1.56,.64,1) ${i * 0.04}s both`,
                            }}>
                            <div style={{
                                width: isHovered ? 72 : 60, height: isHovered ? 72 : 60, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: isHovered ? `0 0 30px ${color}60` : `0 2px 10px ${color}25`,
                                transition: "all 0.3s",
                            }}>
                                {(() => { const Icon = getSkillIcon(s.name); return <Icon size={isHovered ? 24 : 20} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />; })()}
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

            {/* Mobile grid fallback */}
            <div className="md:hidden grid grid-cols-3 gap-3">
                {filtered.map((s, i) => {
                    const color = ORB_COLORS[i % ORB_COLORS.length];
                    return (
                        <div key={`m-${s.plugin}/${s.name}`}
                            onClick={() => setSelected(s)}
                            className="flex flex-col items-center gap-2 cursor-pointer py-3"
                            style={{ animation: `orbitalIn 0.5s ease ${i * 0.03}s both` }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: `0 2px 8px ${color}20`,
                            }}>
                                {(() => { const Icon = getSkillIcon(s.name); return <Icon size={18} style={{ color: "rgba(255,255,255,0.9)" }} />; })()}
                            </div>
                            <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.45)", textAlign: "center", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {cleanName(s.name)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-16">
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)" }}>
                        {search ? `No skills matching "${search}"` : "No skills found"}
                    </p>
                </div>
            )}

            {/* Modal */}
            {selected && (
                <SkillModal
                    skill={selected}
                    color={ORB_COLORS[filtered.indexOf(selected) % ORB_COLORS.length]}
                    onClose={() => setSelected(null)}
                    currentMachine={machine}
                    otherMachines={otherMachines}
                    showToast={showToast}
                />
            )}

            <style>{`
                @keyframes pulseRing {
                    0% { transform: scale(1); opacity: 0.6; }
                    100% { transform: scale(1.6); opacity: 0; }
                }
                @keyframes orbitalIn {
                    from { opacity: 0; transform: translate(-50%, -50%) rotate(-72deg) scale(0.15); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `}</style>
        </div>
    );
}
