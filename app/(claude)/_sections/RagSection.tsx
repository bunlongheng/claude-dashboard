"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Search, Layers, Brain, FolderOpen, RefreshCw, Sparkles, Copy, Check, ChevronDown, ChevronRight, FileText, X, Monitor } from "lucide-react";
import { useMachine } from "./MachineContext";

const ACCENT = "#10b981";

type Stats = {
    documents: number; chunks: number; preferences: number;
    searches: number; projects: number; lastIngest: string | null;
    contextInjections: number; totalContextSize: number;
    recentContexts: { project: string; prefs_count: number; chunks_count: number; context_size: number; created_at: string }[];
};

type Pref = { id: number; category: string; key: string; value: string };
type SearchResult = { chunk_id: number; doc_id: number; content: string; project: string; source_type: string; title: string };

export type RagTab = "overview" | "documents" | "search" | "preferences" | "context";
type DocInfo = { id: number; source_path: string; source_type: string; project: string; title: string; size: number; chunk_count: number; updated_at: string };

export default function RagSection({ initialTab = "overview" }: { initialTab?: RagTab }) {
    const { machine, machines } = useMachine();
    const currentMachine = machines.find(m => m.id === machine);
    const isRemote = currentMachine ? !currentMachine.isLocal : false;
    const [tab, setTab] = useState<RagTab>(initialTab);
    const [stats, setStats] = useState<Stats | null>(null);
    const [prefs, setPrefs] = useState<Pref[]>([]);
    const [loading, setLoading] = useState(true);
    const [ingesting, setIngesting] = useState(false);

    // Search state
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    // Context state
    const [contextPrompt, setContextPrompt] = useState("");
    const [contextResult, setContextResult] = useState("");
    const [contextLoading, setContextLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Docs state
    const [docs, setDocs] = useState<DocInfo[]>([]);
    const [docFilter, setDocFilter] = useState<string>("all");
    const [docProjectFilter, setDocProjectFilter] = useState<string>("all");
    const [selectedDoc, setSelectedDoc] = useState<any>(null);
    const [docContent, setDocContent] = useState<string>("");
    const [loadingDoc, setLoadingDoc] = useState(false);

    // Prefs collapse
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    useEffect(() => { fetchAll(); }, []);

    async function fetchAll() {
        setLoading(true);
        try {
            const [s, p, d] = await Promise.all([
                fetch(`/api/rag/stats`).then(r => r.json()),
                fetch(`/api/rag/preferences`).then(r => r.json()),
                fetch(`/api/rag/docs`).then(r => r.json()),
            ]);
            setStats(s);
            setPrefs(p);
            setDocs(d);
        } catch { /* RAG server not running */ }
        setLoading(false);
    }

    async function runIngest() {
        setIngesting(true);
        try {
            await fetch(`/api/rag/ingest`, { method: "POST" });
            await fetch(`/api/rag/insights`, { method: "POST" });
            await fetchAll();
        } catch { /* */ }
        setIngesting(false);
    }

    async function doSearch() {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/rag/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            setResults(data.results || []);
        } catch { setResults([]); }
        setSearching(false);
    }

    async function buildContext() {
        if (!contextPrompt.trim()) return;
        setContextLoading(true);
        try {
            const res = await fetch(`/api/rag/context`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: contextPrompt.trim() }),
            });
            const data = await res.json();
            setContextResult(data.context || "No relevant context found.");
        } catch { setContextResult("RAG server not reachable."); }
        setContextLoading(false);
    }

    function copyContext() {
        navigator.clipboard.writeText(contextResult);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    if (isRemote) return (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
            <Monitor size={32} style={{ color: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 600 }}>RAG runs locally</p>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 6, lineHeight: 1.6, maxWidth: 400, margin: "6px auto 0" }}>
                RAG knowledge base is local to this machine. Switch to <span style={{ color: ACCENT, fontWeight: 600 }}>Local</span> in the machine picker to view your documents, preferences, and search.
            </p>
        </div>
    );

    if (loading) return <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "64px 0" }}>Connecting to RAG...</p>;
    if (!stats) return (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
            <DatabaseZap size={32} style={{ color: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>RAG not available</p>
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 4 }}>RAG data will be created on your first Claude Code session.</p>
        </div>
    );

    const tabs: { label: string; value: string; count?: number }[] = [
        { label: "Overview", value: "overview" },
        { label: "Documents", value: "documents", count: docs.length },
        { label: "Search", value: "search" },
        { label: "Preferences", value: "preferences", count: prefs.length },
        { label: "Context", value: "context" },
    ];

    const catColors: Record<string, string> = {
        stack: "#3b82f6", style: "#8b5cf6", workflow: "#22c55e", feedback: "#f59e0b",
        infra: "#06b6d4", security: "#ef4444", ui: "#ec4899", general: "#64748b",
    };

    const toggleCat = (cat: string) => {
        setCollapsed(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
    };

    return (
        <div>
            {/* Ingest button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button onClick={runIngest} disabled={ingesting}
                    style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: ingesting ? "rgba(255,255,255,0.05)" : `${ACCENT}15`,
                        border: `1px solid ${ACCENT}30`, color: ACCENT, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                    }}>
                    <RefreshCw size={10} style={{ animation: ingesting ? "spin 1s linear infinite" : "none" }} />
                    {ingesting ? "Ingesting..." : "Re-ingest"}
                </button>
            </div>

            {/* ── Overview ── */}
            {tab === "overview" && (
                <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                        {[
                            { label: "Documents", value: stats.documents, icon: DatabaseZap, color: "#3b82f6" },
                            { label: "Chunks", value: stats.chunks, icon: Layers, color: "#8b5cf6" },
                            { label: "Preferences", value: stats.preferences, icon: Brain, color: "#f59e0b" },
                            { label: "Projects", value: stats.projects, icon: FolderOpen, color: "#22c55e" },
                        ].map(c => (
                            <div key={c.label} style={{
                                padding: "14px", borderRadius: 10,
                                background: `${c.color}08`, border: `1px solid ${c.color}25`,
                                textAlign: "center",
                            }}>
                                <c.icon size={16} style={{ color: c.color, margin: "0 auto 6px" }} />
                                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>{c.label}</div>
                            </div>
                        ))}
                    </div>

                    {stats.lastIngest && (
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 16 }}>
                            Last ingested: {stats.lastIngest}
                        </div>
                    )}

                    {/* RAG Impact — proof it works */}
                    <div style={{
                        padding: "16px", borderRadius: 10, marginBottom: 16,
                        background: "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)",
                        border: "1px solid rgba(16,185,129,0.15)",
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>RAG Impact</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{stats.contextInjections}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Sessions enriched</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{stats.totalContextSize > 1000 ? `${(stats.totalContextSize / 1000).toFixed(0)}K` : stats.totalContextSize}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Chars injected</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{stats.contextInjections > 0 ? `${(stats.totalContextSize / stats.contextInjections / 1000).toFixed(1)}K` : '0'}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Avg per session</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 10 }}>
                            Without RAG: ~4KB (CLAUDE.md only) · With RAG: ~17KB (preferences + relevant context)
                        </div>
                    </div>

                    {/* Recent injections */}
                    {stats.recentContexts && stats.recentContexts.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Recent Injections</div>
                            {stats.recentContexts.slice(0, 5).map((c, i) => (
                                <div key={i} style={{
                                    padding: "8px 12px", marginBottom: 3, borderRadius: 6,
                                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                                    display: "flex", alignItems: "center", gap: 8,
                                }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: ACCENT, minWidth: 70 }}>{c.project || 'global'}</span>
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", flex: 1 }}>{c.prefs_count} prefs · {c.chunks_count} chunks</span>
                                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>{(c as any).times ?? 1}x</span>
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{(c.context_size / 1000).toFixed(1)}KB</span>
                                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)" }}>{c.created_at?.slice(0, 10)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Source breakdown - donut charts */}
                    {(() => {
                        const typeColors: Record<string, string> = { conversation: "#22c55e", insight: "#10b981", memory: "#eab308", claude_md: "#8b5cf6", global_rules: "#a855f7", article: "#06b6d4" };
                        const typeCounts: Record<string, number> = {};
                        for (const d of docs) typeCounts[d.source_type] = (typeCounts[d.source_type] || 0) + 1;
                        const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
                        const total = docs.length || 1;

                        // Project breakdown
                        const projectCounts: Record<string, number> = {};
                        for (const d of docs) projectCounts[d.project] = (projectCounts[d.project] || 0) + 1;
                        const topProjects = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
                        const projColors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444", "#06b6d4"];

                        function Donut({ data, colors, size = 120, label }: { data: [string, number][]; colors: Record<string, string> | string[]; size?: number; label: string }) {
                            const r = size / 2 - 8;
                            const cx = size / 2, cy = size / 2;
                            const circumference = 2 * Math.PI * r;
                            const total = data.reduce((s, [, v]) => s + v, 0) || 1;
                            let offset = 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
                                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={14} />
                                        {data.map(([key, value], i) => {
                                            const pct = value / total;
                                            const dash = circumference * pct;
                                            const gap = circumference - dash;
                                            const color = Array.isArray(colors) ? colors[i % colors.length] : (colors[key] || "#6b7280");
                                            const currentOffset = offset;
                                            offset += pct * circumference;
                                            return <circle key={key} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={14}
                                                strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-currentOffset}
                                                style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dasharray 0.6s ease-out" }} />;
                                        })}
                                        <text x={cx} y={cy - 4} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800}>{total}</text>
                                        <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8} fontWeight={600}>{label}</text>
                                    </svg>
                                    <div style={{ marginTop: 8 }}>
                                        {data.map(([key, value], i) => {
                                            const color = Array.isArray(colors) ? colors[i % colors.length] : (colors[key] || "#6b7280");
                                            return (
                                                <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center", marginBottom: 2 }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{key}</span>
                                                    <span style={{ fontSize: 9, fontWeight: 700, color }}>{value}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
                                <div style={{ padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                    <Donut data={typeEntries} colors={typeColors} label="BY TYPE" />
                                </div>
                                <div style={{ padding: "16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                    <div style={{ textAlign: "center", marginBottom: 8 }}>
                                        <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em" }}>TOP PROJECTS</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, height: 120, padding: "0 8px" }}>
                                        {topProjects.map(([name, count], i) => {
                                            const maxCount = topProjects[0]?.[1] ?? 1;
                                            const pct = (count / maxCount) * 100;
                                            const color = projColors[i % projColors.length];
                                            return (
                                                <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 4 }}>
                                                    <span style={{ fontSize: 9, fontWeight: 700, color }}>{count}</span>
                                                    <div style={{
                                                        width: "100%", maxWidth: 28, borderRadius: "4px 4px 0 0",
                                                        height: `${Math.max(pct, 8)}%`,
                                                        background: `linear-gradient(to top, ${color}, ${color}90)`,
                                                        boxShadow: `0 0 8px ${color}30`,
                                                        transition: "height 0.6s ease",
                                                    }} />
                                                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.1, maxWidth: 40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ── Documents ── */}
            {tab === "documents" && (() => {
                const typeColors: Record<string, string> = { conversation: "#22c55e", insight: "#10b981", memory: "#eab308", claude_md: "#8b5cf6", global_rules: "#a855f7", article: "#06b6d4" };

                // Type breakdown
                const typeCounts: Record<string, number> = {};
                const typeSize: Record<string, number> = {};
                for (const d of docs) {
                    typeCounts[d.source_type] = (typeCounts[d.source_type] || 0) + 1;
                    typeSize[d.source_type] = (typeSize[d.source_type] || 0) + d.size;
                }
                const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
                const maxTypeCount = Math.max(...Object.values(typeCounts), 1);

                // Project breakdown
                const projectCounts: Record<string, number> = {};
                const projectSize: Record<string, number> = {};
                for (const d of docs) {
                    projectCounts[d.project] = (projectCounts[d.project] || 0) + 1;
                    projectSize[d.project] = (projectSize[d.project] || 0) + d.size;
                }
                const projectEntries = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]);
                const maxProjectCount = Math.max(...Object.values(projectCounts), 1);
                const projectColors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444", "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#6366f1"];

                // Total size
                const totalSize = docs.reduce((s, d) => s + d.size, 0);
                const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);

                return (
                    <>
                    <div>
                        {/* Summary row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{docs.length}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Documents</div>
                            </div>
                            <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{totalChunks.toLocaleString()}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Chunks</div>
                            </div>
                            <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{(totalSize / 1024).toFixed(0)}KB</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Total Size</div>
                            </div>
                        </div>

                        {/* Type distribution - horizontal bar chart */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>By Type</div>
                        <div style={{ marginBottom: 20 }}>
                            {typeEntries.map(([type, count]) => {
                                const color = typeColors[type] || "#6b7280";
                                const pct = (count / maxTypeCount) * 100;
                                const sizeKb = ((typeSize[type] || 0) / 1024).toFixed(0);
                                return (
                                    <div key={type} onClick={() => setDocFilter(docFilter === type ? "all" : type)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, cursor: "pointer" }}>
                                        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.45)", minWidth: 75, textAlign: "right" }}>{type}</span>
                                        <div style={{ flex: 1, height: 20, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                                            <div style={{
                                                width: `${pct}%`, height: "100%", background: `${color}30`, borderRadius: 4,
                                                borderRight: `2px solid ${color}`, transition: "width 0.6s ease-out",
                                            }} />
                                            <span style={{ position: "absolute", left: 8, top: 3, fontSize: 9, fontWeight: 700, color }}>{count}</span>
                                        </div>
                                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", minWidth: 35, textAlign: "right" }}>{sizeKb}KB</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Stacked bar - type composition */}
                        <div style={{ height: 24, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 20 }}>
                            {typeEntries.map(([type, count]) => {
                                const color = typeColors[type] || "#6b7280";
                                const pct = (count / docs.length) * 100;
                                return (
                                    <div key={type} title={`${type}: ${count} (${pct.toFixed(0)}%)`}
                                        style={{ width: `${pct}%`, background: `${color}50`, borderRight: "1px solid rgba(0,0,0,0.3)", transition: "width 0.6s ease-out", position: "relative" }}>
                                        {pct > 8 && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color }}>{type}</span>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Project breakdown - horizontal bars */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>By Project ({Object.keys(projectCounts).length})</div>
                        <div style={{ marginBottom: 16 }}>
                            {projectEntries.slice(0, 15).map(([project, count], i) => {
                                const color = projectColors[i % projectColors.length];
                                const pct = (count / maxProjectCount) * 100;
                                return (
                                    <div key={project} onClick={() => setDocProjectFilter(docProjectFilter === project ? "all" : project)}
                                        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, cursor: "pointer" }}>
                                        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.45)", minWidth: 75, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project}</span>
                                        <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.03)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                                            <div style={{
                                                width: `${pct}%`, height: "100%", background: `${color}25`, borderRadius: 3,
                                                borderRight: `2px solid ${color}`, transition: "width 0.6s ease-out",
                                            }} />
                                            <span style={{ position: "absolute", left: 6, top: 2, fontSize: 9, fontWeight: 700, color }}>{count}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {projectEntries.length > 15 && (
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 4 }}>+{projectEntries.length - 15} more projects</div>
                            )}
                        </div>

                        {/* Expandable file list */}
                        <details style={{ marginTop: 8 }}>
                            <summary style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", cursor: "pointer", padding: "8px 0", userSelect: "none" }}>
                                Browse all {docs.length} documents
                            </summary>
                            <div style={{ marginTop: 8 }}>
                                {(() => {
                                    let filtered = docs;
                                    if (docFilter !== "all") filtered = filtered.filter(d => d.source_type === docFilter);
                                    if (docProjectFilter !== "all") filtered = filtered.filter(d => d.project === docProjectFilter);
                                    const grouped: Record<string, DocInfo[]> = {};
                                    for (const d of filtered) { if (!grouped[d.project]) grouped[d.project] = []; grouped[d.project].push(d); }
                                    return Object.entries(grouped).sort().map(([project, items]) => (
                                        <div key={project} style={{ marginBottom: 8 }}>
                                            <div style={{ padding: "4px 8px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                                                <FolderOpen size={10} style={{ color: "rgba(255,255,255,0.15)" }} /> {project} <span style={{ fontSize: 8, color: "rgba(255,255,255,0.12)" }}>({items.length})</span>
                                            </div>
                                            {items.map(d => {
                                                const color = typeColors[d.source_type] || "#6b7280";
                                                return (
                                                    <div key={d.id} onClick={async () => {
                                                        setSelectedDoc(d); setLoadingDoc(true);
                                                        try { const res = await fetch(`/api/rag/docs/${d.id}`); const data = await res.json(); setDocContent(data.content || ""); } catch { setDocContent("Failed to load"); }
                                                        setLoadingDoc(false);
                                                    }} style={{
                                                        padding: "6px 10px 6px 24px", marginBottom: 1, borderRadius: 4,
                                                        background: selectedDoc?.id === d.id ? `${ACCENT}10` : "rgba(255,255,255,0.01)",
                                                        border: selectedDoc?.id === d.id ? `1px solid ${ACCENT}25` : "1px solid transparent",
                                                        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                                                    }}>
                                                        <FileText size={10} style={{ color, flexShrink: 0 }} />
                                                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                                                        <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: `${color}12`, color }}>{d.source_type}</span>
                                                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>{d.chunk_count}ch</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </details>
                    </div>

                    {/* Doc content panel */}
                    {selectedDoc && (
                        <div style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
                            display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)",
                        }} onClick={() => { setSelectedDoc(null); setDocContent(""); }}>
                            <div onClick={e => e.stopPropagation()} style={{
                                width: 560, maxWidth: "90vw", background: "#0f1117",
                                borderLeft: "1px solid rgba(255,255,255,0.08)",
                                display: "flex", flexDirection: "column",
                                animation: "sd-slide-in-right 0.15s ease-out",
                            }}>
                                <div style={{
                                    padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                                    display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                                }}>
                                    <FileText size={12} style={{ color: ACCENT }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedDoc.title}</span>
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{selectedDoc.project}</span>
                                    <button onClick={() => { setSelectedDoc(null); setDocContent(""); }}
                                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", padding: 2 }}>
                                        <X size={14} />
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
                                    {loadingDoc ? (
                                        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Loading...</p>
                                    ) : (
                                        <pre style={{
                                            fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                                            fontFamily: "'SF Mono', 'Fira Code', monospace",
                                            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                                        }}>{docContent}</pre>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    </>
                );
            })()}

            {/* ── Search ── */}
            {tab === "search" && (
                <div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                        <div style={{
                            display: "flex", alignItems: "center", gap: 6, flex: 1, padding: "8px 12px", borderRadius: 8,
                            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        }}>
                            <Search size={12} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                            <input value={query} onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && doSearch()}
                                placeholder="Search your knowledge base..."
                                style={{ background: "none", border: "none", outline: "none", color: "rgba(255,255,255,0.8)", fontSize: 12, flex: 1, fontFamily: "inherit" }} />
                        </div>
                        <button onClick={doSearch} disabled={searching}
                            style={{
                                padding: "8px 16px", borderRadius: 8, background: ACCENT, color: "#fff",
                                border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}>{searching ? "..." : "Search"}</button>
                    </div>

                    {results.map((r, i) => (
                        <div key={i} style={{
                            padding: "12px 14px", marginBottom: 4, borderRadius: 8,
                            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>{r.title}</span>
                                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>{r.project}</span>
                                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}>{r.source_type}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                {r.content.slice(0, 300)}{r.content.length > 300 ? "..." : ""}
                            </div>
                        </div>
                    ))}
                    {results.length === 0 && query && !searching && (
                        <p style={{ color: "rgba(255,255,255,0.2)", textAlign: "center", padding: 32, fontSize: 12 }}>No results</p>
                    )}
                </div>
            )}

            {/* ── Preferences ── */}
            {tab === "preferences" && (
                <div>
                    {(() => {
                        const grouped: Record<string, Pref[]> = {};
                        for (const p of prefs) { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); }
                        return Object.entries(grouped).sort().map(([cat, items]) => {
                            const color = catColors[cat] || "#64748b";
                            const isCollapsed = collapsed.has(cat);
                            return (
                                <div key={cat} style={{ marginBottom: 8 }}>
                                    <button onClick={() => toggleCat(cat)} style={{
                                        width: "100%", padding: "10px 12px", borderRadius: 8,
                                        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                                        color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                                        fontFamily: "inherit", fontSize: 11, fontWeight: 600, textAlign: "left",
                                    }}>
                                        {isCollapsed ? <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                                        <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                                        <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10, color }}>{cat}</span>
                                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>{items.length}</span>
                                    </button>
                                    {!isCollapsed && items.map(p => (
                                        <div key={p.id} style={{
                                            padding: "8px 12px 8px 34px", borderBottom: "1px solid rgba(255,255,255,0.03)",
                                            display: "flex", gap: 10,
                                        }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color, minWidth: 140, flexShrink: 0 }}>{p.key}</span>
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>{p.value}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        });
                    })()}
                </div>
            )}

            {/* ── Context Builder ── */}
            {tab === "context" && (
                <div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 12, lineHeight: 1.5 }}>
                        Paste a prompt to see what context the RAG would inject. This is what Claude sees at session start.
                    </p>
                    <textarea value={contextPrompt} onChange={e => setContextPrompt(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) buildContext(); }}
                        placeholder='e.g. "Build a login page with OAuth"'
                        rows={3}
                        style={{
                            width: "100%", padding: "10px 12px", borderRadius: 8,
                            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.8)", fontSize: 12, outline: "none", resize: "vertical",
                            fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                        }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>Cmd+Enter</span>
                        <button onClick={buildContext} disabled={contextLoading || !contextPrompt.trim()}
                            style={{
                                padding: "6px 14px", borderRadius: 8, background: contextPrompt.trim() ? ACCENT : "rgba(255,255,255,0.05)",
                                color: contextPrompt.trim() ? "#fff" : "rgba(255,255,255,0.2)",
                                border: "none", fontSize: 11, fontWeight: 600, cursor: contextPrompt.trim() ? "pointer" : "default",
                            }}>{contextLoading ? "Building..." : "Build Context"}</button>
                    </div>

                    {contextResult && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>
                                    <Sparkles size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                                    Assembled Context
                                </span>
                                <button onClick={copyContext} style={{
                                    padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                                    background: copied ? "#22c55e" : "rgba(255,255,255,0.04)",
                                    color: copied ? "#fff" : "rgba(255,255,255,0.4)",
                                    fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                }}>
                                    {copied ? <Check size={10} /> : <Copy size={10} />}
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <pre style={{
                                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 8, padding: "12px 14px", fontSize: 10, lineHeight: 1.7,
                                color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace",
                                whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflow: "auto",
                            }}>{contextResult}</pre>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes sd-slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </div>
    );
}
