"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
    Zap, Search, Pencil, Save, X, Send, Copy, Eye, Code2, CircleDot, List,
    StickyNote, LayoutPanelTop, GitBranch, Monitor, Server, HardDrive, Cpu,
    AppWindow, Rocket, LayoutGrid, BarChart3, Lightbulb, Ban, FlaskConical,
    ClipboardList, TestTube2, PackageSearch, ShieldCheck, Bot, MessageSquare,
    Mic, Camera, QrCode, Sparkles, Star, Mail, Presentation, Triangle,
    Download,
    // Extra icons for skill mapping + deterministic fallback
    Activity, AlertCircle, Award, BookOpen, Boxes, Brain, Briefcase, Bug,
    Calendar, CheckCircle2, ChevronsRight, ClipboardCheck, Cloud, Coffee,
    Compass, Crosshair, Database, FileCode, FileText, Filter, Flame, Flag,
    Folder, Gauge, Gift, Globe, Hammer, Headphones, Heart, Image as ImageIcon,
    Inbox, Info, Key, Layers, Link as LinkIcon, ListChecks, Lock, Map as MapIcon,
    Megaphone, Network, Package, PenTool, PieChart, Play, Power, RefreshCw,
    Repeat, Scale, Settings, Shield, Shuffle, SlidersHorizontal,
    Smartphone, Speaker, Sun, Tag, Target, Terminal as TerminalIcon, Timer,
    Truck, Tv, Umbrella, Upload, Users, Video, Wand2, Watch, Wifi,
    Workflow, Wrench,
    type LucideIcon,
} from "lucide-react";
import { marked } from "marked";
import { FileViews } from "./FileViews";
import { SegmentedTabs } from "./shared";
import { useMachine, type MachineInfo } from "./MachineContext";
import { useToast } from "./ToastContext";

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type SkillInfo = { name: string; plugin: string; description: string; path: string; source?: "builtin" | "external"; content?: string; createdAt?: string };

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
    "stickies": StickyNote, "sticky": StickyNote, "/sticky": StickyNote, "note": StickyNote,
    "deck": LayoutPanelTop, "/deck": LayoutPanelTop,
    "diagram": GitBranch, "/diagram": GitBranch,
    "local-apps": AppWindow, "/local-apps": AppWindow, "apps": AppWindow,
    "onboard": Rocket, "/onboard": Rocket,
    "slack-read": MessageSquare, "/slack-read": MessageSquare,
    "mimi": Mic, "/mimi": Mic,
    "screenshots": Camera, "show-ui": ImageIcon, "route-shots": Camera,
    "show-lan": QrCode,
    "email": Mail, "/email": Mail,
    "pixel": Triangle,
    "tabs": LayoutPanelTop,
    "rag": Search,
    "sitemap": MapIcon,
    "session-recap": ClipboardCheck,
    "release-ready": CheckCircle2,
    "release-playbook": Flag,
    "finish-branch": Flag,
    "testing-guardrail": Shield,
    "tdd": TestTube2,
    "debug": Bug,
    "code-review": Eye,
    "security-review": ShieldCheck,
    "review": Eye,
    "brainstorm": Brain,
    "verify": CheckCircle2,
    "execute-plan": Play,
    "subagent-dev": Users,
    "plan": ListChecks,
    "parallel": Layers,
    "contrib-radar": Globe,
    "mindmap": Brain,
    "erd": Database,
    "claude-api": Code2,
    "init": Power,
    "loop": Repeat,
    "schedule": Calendar,
    "update-config": Settings,
    "keybindings-help": Key,
    "simplify": Wand2,
    "fewer-permission-prompts": Lock,
    "frontend-design": PenTool,
    "frontend-design:frontend-design": PenTool,
};

// Pool used when a skill has no explicit mapping. Hashing the name into this
// pool gives each skill a stable, distinct-looking icon instead of every
// unmapped row collapsing to a single fallback (Zap).
const SKILL_ICON_POOL: LucideIcon[] = [
    Activity, Award, Boxes, Briefcase, Cloud, Coffee, Compass, Crosshair,
    Filter, Flame, Folder, FileCode, FileText, Gift, Hammer, Headphones,
    Heart, Inbox, Info, Layers, LinkIcon, Network, Package, PieChart,
    RefreshCw, Scale, SlidersHorizontal, Smartphone, Speaker, Sun, Tag,
    Target, TerminalIcon, Tv, Umbrella, Upload, Users, Video, Watch, Wifi,
    Wrench, Workflow, AlertCircle, ChevronsRight,
];

function hashName(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function getSkillIcon(name: string): LucideIcon {
    const clean = name.replace(/^\//, "");
    return SKILL_ICONS[clean] || SKILL_ICONS[name] || SKILL_ICON_POOL[hashName(clean) % SKILL_ICON_POOL.length];
}

function skillTag(name: string): string {
    const n = name.replace(/^\//, "").toLowerCase();
    // SSH/remote helper skills group together; everything else you authored is "custom".
    if (n.startsWith("ssh")) return "ssh";
    return "custom";
}

function cleanName(name: string): string {
    return name
        .replace(/^\//, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

async function saveSkillFile(apiBase: (p: string) => string, filePath: string, content: string): Promise<boolean> {
    try {
        const r = await fetch(apiBase("/api/claude/skills"), {
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
    const { apiBase } = useMachine();
    const [tab, setTab] = useState<"preview" | "code">("preview");
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(skill.content ?? "");
    const [draft, setDraft] = useState(skill.content ?? "");
    const [saving, setSaving] = useState(false);
    const [contentLoading, setContentLoading] = useState(false);

    // The skill list endpoint is called with ?slim=1, which strips `content` to keep the
    // payload small. When the modal opens for a skill without inline content, fetch the
    // single file from the same machine via /api/claude/skills?path=...
    useEffect(() => {
        if (content || !skill.path) return;
        let aborted = false;
        setContentLoading(true);
        fetch(apiBase(`/api/claude/skills?path=${encodeURIComponent(skill.path)}`), { cache: "no-store" })
            .then(r => r.ok ? r.json() : { content: "" })
            .then(d => { if (!aborted) { setContent(d.content ?? ""); setDraft(d.content ?? ""); } })
            .catch(() => {})
            .finally(() => { if (!aborted) setContentLoading(false); });
        return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skill.path]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        const ok = await saveSkillFile(apiBase, skill.path, draft);
        setSaving(false);
        if (ok) { setContent(draft); setEditing(false); showToast("Saved"); }
        else showToast("Save failed", "#ef4444");
    }, [skill.path, draft, showToast, apiBase]);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        showToast("Copied to clipboard");
    };

    const handleDownload = () => {
        const filename = (skill.path?.split("/").pop()) || `${skill.name}.md`;
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        showToast(`Downloaded ${filename}`);
    };

    // Strip the YAML frontmatter before rendering markdown (don't show '---' blocks).
    const bodyMd = useMemo(() => {
        const m = content.match(/^---\n[\s\S]*?\n---\n?/);
        return m ? content.slice(m[0].length) : content;
    }, [content]);
    const previewHtml = useMemo(() => marked.parse(bodyMd, { breaks: false, gfm: true }) as string, [bodyMd]);

    async function syncTo(targetId: string) {
        try {
            const res = await fetch(apiBase("/api/claude/sync-skill"), {
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
                // Wider modal so multi-page skill READMEs actually
                // breathe instead of word-wrapping every other token.
                width: "100%", maxWidth: 960, maxHeight: "90vh",
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
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>/{skill.name.replace(/^\//, "")}</div>
                    </div>
                    <button onClick={onClose} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "rgba(255,255,255,0.55)", padding: 4,
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
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex" }}>
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
                    <button onClick={handleCopy} title="Copy to clipboard"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex" }}>
                        <Copy size={13} />
                    </button>
                    <button onClick={handleDownload} title="Download .md"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex" }}>
                        <Download size={13} />
                    </button>
                    {otherMachines.map(m => (
                        <button key={m.id} onClick={() => syncTo(m.id)} title={`Copy to ${m.hostname}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex", fontSize: 9, gap: 3, alignItems: "center" }}>
                            <Send size={10} /> {m.hostname}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
                    {tab === "preview" && (
                        contentLoading && !content
                            ? <p style={{ opacity: 0.3, fontSize: 12 }}>Loading...</p>
                            : <div className="skill-md"
                                style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.78)" }}
                                // marked() output is trusted because it's our own local skill files,
                                // not user input - same trust model as ClaudeMdHistory's renderer.
                                dangerouslySetInnerHTML={{ __html: previewHtml || "<p style=\"opacity:.3\">(empty)</p>" }} />
                    )}
                    {tab === "code" && !editing && (
                        <pre style={{
                            fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                            padding: "16px 18px", borderRadius: 10,
                            background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)",
                            fontFamily: "'SF Mono', 'Fira Code', monospace",
                        }}>{content || (contentLoading ? "Loading..." : "(empty)")}</pre>
                    )}
                    {tab === "code" && editing && (
                        <textarea value={draft} onChange={e => setDraft(e.target.value)}
                            style={{
                                width: "100%", minHeight: 420, padding: "16px 18px",
                                background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 10, outline: "none",
                                fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.85)",
                                fontFamily: "'SF Mono', 'Fira Code', monospace", resize: "vertical",
                            }} />
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "8px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "monospace",
                }}>
                    {skill.path.replace(/.*\.claude\//, "~/.claude/")}
                </div>
            </div>

            <style>{`
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.9) rotate(-2deg); }
                    to { opacity: 1; transform: scale(1) rotate(0deg); }
                }
                /* Markdown body inside the SkillModal preview. Headings break out
                   of the muted body color, code blocks get a dark surface, tables
                   match the rest of the dashboard chrome. */
                .skill-md h1 { font-size: 22px; font-weight: 800; color: #fff; margin: 4px 0 14px; }
                .skill-md h2 { font-size: 17px; font-weight: 700; color: #fff; margin: 22px 0 10px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); }
                .skill-md h3 { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.92); margin: 18px 0 8px; }
                .skill-md h4 { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.85); margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
                .skill-md p { margin: 8px 0 12px; }
                .skill-md ul, .skill-md ol { margin: 8px 0 12px; padding-left: 22px; }
                .skill-md li { margin: 4px 0; }
                .skill-md a { color: ${color}; text-decoration: underline; text-underline-offset: 2px; }
                .skill-md strong { color: #fff; font-weight: 700; }
                .skill-md code { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; font-family: 'SF Mono','Fira Code',monospace; color: ${color}; }
                .skill-md pre { background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; margin: 12px 0; overflow: auto; }
                .skill-md pre code { background: transparent; border: none; padding: 0; color: rgba(255,255,255,0.78); font-size: 11.5px; line-height: 1.6; }
                .skill-md table { border-collapse: collapse; margin: 12px 0; font-size: 12px; width: 100%; }
                .skill-md th, .skill-md td { border: 1px solid rgba(255,255,255,0.08); padding: 6px 10px; text-align: left; }
                .skill-md th { background: rgba(255,255,255,0.04); color: #fff; font-weight: 700; }
                .skill-md blockquote { border-left: 3px solid ${color}55; padding: 4px 0 4px 14px; margin: 12px 0; color: rgba(255,255,255,0.55); }
                .skill-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 18px 0; }
            `}</style>
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function SkillsSection() {
    const { machine, machines, apiBase } = useMachine();
    const { showToast } = useToast();
    const [skills, setSkills] = useState<SkillInfo[]>([]);
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<SkillInfo | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    // Default to list view so the page lands populated with every skill name +
    // description visible (was 'circles' which compressed everything into dots
    // and felt empty until you knew to switch modes).
    const [viewMode, setViewMode] = useState<"thumbs" | "list" | "circles">("list");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLoading(true);
        // apiBase already routes to the right host; ?machine= triggers the same
        // self-proxy bug as Sessions/MCP and returns zero skills. Drop it.
        fetch(apiBase("/api/claude/skills?slim=1"), { cache: "no-store" })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    const otherMachines = machines.filter(m => m.id !== machine && m.online);

    // Tag a skill: plugin-shipped skills get "shipped"; yours get ssh/custom.
    const tagOf = (s: SkillInfo) => (s.source === "external" ? skillTag(s.name) : "shipped");
    const customSkills = skills; // show all skills (yours + shipped)

    const filtered = useMemo(() => {
        let list = customSkills;
        if (filter !== "all") list = list.filter(s => tagOf(s) === filter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
        }
        return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customSkills, filter, search]);

    // Get unique tags
    const tags = useMemo(() => {
        const counts: Record<string, number> = { all: customSkills.length };
        for (const s of customSkills) {
            const t = s.source === "external" ? skillTag(s.name) : "shipped";
            counts[t] = (counts[t] ?? 0) + 1;
        }
        // Stable order: all, ssh, custom, shipped
        const order = ["all", "ssh", "custom", "shipped"];
        return Object.entries(counts)
            .filter(([, c]) => c > 0)
            .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
            .map(([tag, count]) => ({ tag, count }));
    }, [customSkills]);

    if (loading) return <p className="text-white/30 text-center py-16">Scanning skills...</p>;

    return (
        <div ref={containerRef}>
            {/* Filter + Search */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <SegmentedTabs
                    value={filter}
                    onChange={setFilter}
                    accent="#8AC249"
                    tabs={tags.map(({ tag, count }) => ({ key: tag, label: tag.toUpperCase(), count }))}
                />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[200px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1"
                        style={{ outline: "none", border: "none" }} />
                </div>
                <div className="flex gap-1 ml-auto">
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
                <FileViews mode="list" accent="#8AC249"
                    items={filtered.map(s => ({ id: `${s.plugin}/${s.name}`, name: s.name, description: s.description, path: s.path, content: s.content }))}
                    getIcon={(item) => getSkillIcon(item.name)}
                    onItemClick={(item) => {
                        // Map the FileItem id back to the original SkillInfo so the SkillModal
                        // gets full context (source, plugin, sync targets etc).
                        const s = filtered.find(x => `${x.plugin}/${x.name}` === item.id);
                        if (s) setSelected(s);
                    }}
                />
            )}
            {/* Thumbs grid - desktop */}
            {viewMode === "thumbs" && (
                <div className="hidden md:grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {filtered.map((s, i) => {
                        const hue = Math.round((i / filtered.length) * 360);
                        const color = `hsl(${hue}, 85%, 55%)`;
                        const Icon = getSkillIcon(s.name);
                        const isNew = s.createdAt && (Date.now() - new Date(s.createdAt).getTime()) < 5 * 86400000;
                        return (
                            <div key={`t-${s.plugin}/${s.name}`}
                                onClick={() => setSelected(s)}
                                className="cursor-pointer group"
                                style={{
                                    borderRadius: 16, overflow: "hidden", position: "relative",
                                    background: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`, aspectRatio: "1",
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                                    boxShadow: "none",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                    animation: `thumbIn 0.4s ease ${i * 0.02}s both`,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`; const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement; if (icon) icon.style.animation = "navShake 0.4s ease"; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement; if (icon) icon.style.animation = "none"; }}>
                                {isNew && (
                                    <span style={{
                                        position: "absolute", top: 8, right: 8,
                                        fontSize: 7, fontWeight: 800, color: "#fff",
                                        background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 6,
                                    }}>NEW</span>
                                )}
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

            {/* Orbital circle - desktop */}
            {viewMode === "circles" && (
            <div className="hidden md:block" style={{ position: "relative", width: "100%", aspectRatio: "1", maxWidth: 900, margin: "0 auto" }}>
                {/* Center label */}
                <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                    textAlign: "center", pointerEvents: "none", zIndex: 0,
                }}>
                    <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
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
                            <div style={{ position: "relative" }}>
                                {s.createdAt && (Date.now() - new Date(s.createdAt).getTime()) < 5 * 86400000 && (
                                    <span style={{
                                        position: "absolute", top: -4, right: -8, zIndex: 3,
                                        fontSize: 7, fontWeight: 800, letterSpacing: "0.05em",
                                        color: "#fff", background: "#22c55e",
                                        padding: "1px 5px", borderRadius: 6,
                                        boxShadow: "0 1px 4px rgba(34,197,94,0.5)",
                                    }}>NEW</span>
                                )}
                                <div style={{
                                    width: isHovered ? 72 : 60, height: isHovered ? 72 : 60, borderRadius: "50%",
                                    background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    boxShadow: isHovered ? `0 0 30px ${color}60` : `0 2px 10px ${color}25`,
                                    transition: "all 0.3s",
                                }}>
                                    {(() => { const Icon = getSkillIcon(s.name); return <Icon size={isHovered ? 24 : 20} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />; })()}
                                </div>
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
                    return (
                        <div key={`m-${s.plugin}/${s.name}`}
                            onClick={() => setSelected(s)}
                            className="flex flex-col items-center gap-2 cursor-pointer py-3"
                            style={{ animation: `thumbIn 0.4s ease ${i * 0.03}s both` }}>
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
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
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
        </div>
    );
}
