"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { DatabaseZap, Search, Layers, Brain, FolderOpen, RefreshCw, Sparkles, Copy, Check, ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import { MascotLoader } from "./MascotLoader";
import { useMachine } from "./MachineContext";
import { SegmentedTabs } from "./shared";
import dynamic from "next/dynamic";
import AppIcon from "./AppIcon";
const RagCharts = dynamic(() => import("./RagCharts"), { ssr: false });
import EvalTab from "./EvalTab";
import { cardShell } from "@/lib/ui-tokens";

const ACCENT = "#10b981";

type Stats = {
    documents: number; chunks: number; preferences: number;
    searches: number; projects: number; lastIngest: string | null;
    contextInjections: number; totalContextSize: number;
    recentContexts: { project: string; prefs_count: number; chunks_count: number; context_size: number; created_at: string; times?: number }[];
    typeCounts: { source_type: string; count: number }[];
    projectCounts: { project: string; count: number }[];
    prefCategories: { category: string; count: number }[];
    timeline: { day: string; count: number; conversations: number; insights: number; memory: number }[];
    injectionTimeline: { day: string; count: number; avg_size: number }[];
    searchBenchmark?: { query: string; hits: number; topScore: number }[];
};

type Pref = { id: number; category: string; key: string; value: string };
type SearchResult = { chunk_id: number; doc_id: number; content: string; project: string; source_type: string; title: string };

export type RagTab = "overview" | "documents" | "search" | "preferences" | "context" | "eval";
type DocInfo = { id: number; source_path: string; source_type: string; project: string; title: string; size: number; chunk_count: number; updated_at: string };

export default function RagSection({ initialTab = "overview" }: { initialTab?: RagTab }) {
    const { machine, apiBase } = useMachine();
    const router = useRouter();
    const pathname = usePathname();
    const [tab, setTabState] = useState<RagTab>(initialTab);
    const setTab = useCallback((t: RagTab) => {
        setTabState(t);
        router.replace(`${pathname}?tab=${t}`, { scroll: false });
    }, [router, pathname]);
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
    const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null);
    const [docContent, setDocContent] = useState<string>("");
    const [loadingDoc, setLoadingDoc] = useState(false);

    // Prefs collapse
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [glossaryOpen, setGlossaryOpen] = useState(false);

    useEffect(() => { fetchAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [machine]);

    async function fetchAll() {
        setLoading(true);
        try {
            const [s, p, d] = await Promise.all([
                fetch(apiBase(`/api/rag/stats`)).then(r => r.json()),
                fetch(apiBase(`/api/rag/preferences`)).then(r => r.json()),
                fetch(apiBase(`/api/rag/docs`)).then(r => r.json()),
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
            await fetch(apiBase(`/api/rag/ingest`), { method: "POST" });
            await fetch(apiBase(`/api/rag/insights`), { method: "POST" });
            await fetchAll();
        } catch { /* */ }
        setIngesting(false);
    }

    async function doSearch() {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await fetch(apiBase(`/api/rag/search?q=${encodeURIComponent(query)}`));
            const data = await res.json();
            setResults(data.results || []);
        } catch { setResults([]); }
        setSearching(false);
    }

    async function buildContext() {
        if (!contextPrompt.trim()) return;
        setContextLoading(true);
        try {
            const res = await fetch(apiBase(`/api/rag/context`), {
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

    // (Removed the "RAG runs locally" guard. Each machine has its own rag.db;
    // remote fetches go through apiBase + LAN CORS, so the page works for any
    // machine the dropdown lists.)
    if (loading) return <MascotLoader label="Connecting to RAG" />;
    if (!stats) return (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
            <DatabaseZap size={32} style={{ color: "rgba(255,255,255,0.45)", margin: "0 auto 12px" }} />
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>RAG not available</p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 4 }}>RAG data will be created on your first Claude Code session.</p>
        </div>
    );

    const tabs: { label: string; value: string; count?: number }[] = [
        { label: "Overview", value: "overview" },
        { label: "Documents", value: "documents", count: docs.length },
        { label: "Preferences", value: "preferences", count: prefs.length },
        { label: "Context", value: "context" },
        { label: "Benchmark", value: "eval" },
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
            {/* Tab bar + Ingest */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <SegmentedTabs
                    value={tab}
                    onChange={(v) => setTab(v as RagTab)}
                    tabs={tabs.map(t => ({ key: t.value, label: t.label, count: t.count }))}
                />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={query} onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
                        placeholder="Search knowledge base..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1"
                        style={{ outline: "none", border: "none" }} />
                    {query && (
                        <button onClick={doSearch} disabled={searching}
                            style={{ background: "none", border: "none", cursor: "pointer", color: ACCENT, fontSize: 9, fontWeight: 700 }}>
                            {searching ? "..." : "GO"}
                        </button>
                    )}
                </div>
                <button onClick={runIngest} disabled={ingesting}
                    className="ml-auto"
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

            {/* Search results - shown on any tab when there are results */}
            {results.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Search Results ({results.length})
                        </span>
                        <button onClick={() => { setResults([]); setQuery(""); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 9 }}>Clear</button>
                    </div>
                    {results.map((r, i) => (
                        <div key={i} style={{
                            padding: "10px 14px", marginBottom: 3, borderRadius: 8,
                            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>{r.title}</span>
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>{r.project}</span>
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)" }}>{r.source_type}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                {r.content.slice(0, 200)}{r.content.length > 200 ? "..." : ""}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Overview ── */}
            {tab === "overview" && (
                <div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 16 }}>
                        {[
                            { label: "Documents", value: stats.documents, icon: DatabaseZap, color: "#FF3B30", tab: "documents" as RagTab },
                            { label: "Chunks", value: stats.chunks, icon: Layers, color: "#FF6347", tab: "documents" as RagTab },
                            { label: "Preferences", value: stats.preferences, icon: Brain, color: "#FF9500", tab: "preferences" as RagTab },
                            { label: "Projects", value: stats.projects, icon: FolderOpen, color: "#f97316", tab: "documents" as RagTab },
                        ].map(c => (
                            <div key={c.label} onClick={() => setTab(c.tab)}
                                className="cursor-pointer"
                                style={{
                                    padding: "16px 18px", borderRadius: 12,
                                    background: `linear-gradient(135deg, ${c.color}08 0%, rgba(255,255,255,0.02) 100%)`,
                                    border: `1px solid ${c.color}20`,
                                    transition: "border-color 0.3s, box-shadow 0.3s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = `${c.color}40`; e.currentTarget.style.boxShadow = `0 0 20px ${c.color}15`; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = `${c.color}20`; e.currentTarget.style.boxShadow = "none"; }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <c.icon size={16} style={{ color: c.color }} />
                                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>{c.label}</span>
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: c.color, lineHeight: 1 }}>{(c.value ?? 0).toLocaleString()}</div>
                            </div>
                        ))}
                    </div>

                    {stats.lastIngest && (
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
                            Last ingested: {stats.lastIngest}
                        </div>
                    )}

                    {/* Glossary - what each metric means */}
                    <div className="mb-4 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <button onClick={() => setGlossaryOpen(!glossaryOpen)}
                            className="w-full px-4 py-2.5 flex items-center gap-2 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                            style={{ background: "none", border: "none", color: "white" }}>
                            <span className="text-[11px] font-bold text-white/70">What do these numbers mean?</span>
                            <span className="text-[10px] text-white/20">- click to {glossaryOpen ? "collapse" : "expand"}</span>
                        </button>
                        {glossaryOpen && (
                            <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 border-t border-white/[0.05] pt-3">
                                {[
                                    ["Documents", "Count of indexed sources - past sessions, CLAUDE.md, articles."],
                                    ["Chunks", "Count of FTS5-indexed text segments documents are split into for search."],
                                    ["Preferences", "Count of extracted preference records (your patterns and rules)."],
                                    ["Projects", "Count of distinct projects with indexed RAG data."],
                                    ["Sessions enriched", "Count of Claude Code sessions that received a RAG context injection."],
                                    ["Chars injected", "Total characters of context delivered across all enriched sessions."],
                                    ["Avg per session", "Chars injected ÷ sessions enriched - typical context size per session."],
                                ].map(([term, desc]) => (
                                    <div key={term} className="flex gap-2">
                                        <span className="text-[10px] font-bold text-white/50 shrink-0" style={{ width: 110 }}>{term}</span>
                                        <span className="text-[10px] text-white/30">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RAG Impact — proof it works */}
                    <div style={{ ...cardShell, marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.1em" }}>RAG Impact</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981", lineHeight: 1 }}>{stats.contextInjections}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>Sessions enriched</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981", lineHeight: 1 }}>{stats.totalContextSize > 1000 ? `${(stats.totalContextSize / 1000).toFixed(0)}K` : stats.totalContextSize}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>Chars injected</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981", lineHeight: 1 }}>{stats.contextInjections > 0 ? `${(stats.totalContextSize / stats.contextInjections / 1000).toFixed(1)}K` : '0'}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>Avg per session</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>
                            Without RAG: ~4KB (CLAUDE.md only) · With RAG: ~17KB (preferences + relevant context)
                        </div>
                    </div>

                    {/* Search Architecture Comparison */}
                    <div style={{ ...cardShell, marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.1em" }}>Search Architecture</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                            {/* Current Stack */}
                            <div style={{ padding: "12px", borderRadius: 8, background: `${ACCENT}08`, border: `1px solid ${ACCENT}20` }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 3, background: ACCENT }} /> Current: SQLite FTS5
                                </div>
                                {[
                                    { label: "Engine", value: "SQLite FTS5 + BM25" },
                                    { label: "Signals", value: "FTS + Entity + Haiku rerank" },
                                    { label: "Infra", value: "Zero - in-process" },
                                    { label: "RAM", value: "~0 MB extra" },
                                    { label: "Dependencies", value: "0 extra packages" },
                                    { label: "Latency", value: "< 5ms (FTS)" },
                                ].map(r => (
                                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{r.label}</span>
                                        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{r.value}</span>
                                    </div>
                                ))}
                            </div>
                            {/* Vector DB (removed) */}
                            <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", opacity: 0.5 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.2)" }} /> Removed: ChromaDB
                                </div>
                                {[
                                    { label: "Engine", value: "HNSW + embeddings" },
                                    { label: "Signals", value: "Vector similarity only" },
                                    { label: "Infra", value: "Separate server (port 8000)" },
                                    { label: "RAM", value: "~200-500 MB" },
                                    { label: "Dependencies", value: "47 packages" },
                                    { label: "Latency", value: "~50-200ms (network)" },
                                ].map(r => (
                                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{r.label}</span>
                                        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{r.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* FTS5 Benchmark */}
                        {stats.searchBenchmark && stats.searchBenchmark.length > 0 && (
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>FTS5 Coverage Benchmark</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 1fr", gap: "2px 8px", alignItems: "center" }}>
                                    {stats.searchBenchmark.map((b, i) => {
                                        const pct = (b.hits / 20) * 100;
                                        return [
                                            <span key={`q${i}`} style={{ fontSize: 9, color: "rgba(255,255,255,0.52)", textAlign: "right" }}>{b.query}</span>,
                                            <span key={`h${i}`} style={{ fontSize: 9, fontWeight: 700, color: b.hits >= 15 ? ACCENT : b.hits >= 5 ? "#f59e0b" : "#ef4444", textAlign: "center" }}>{b.hits}/20</span>,
                                            <div key={`b${i}`} style={{ height: 12, background: "rgba(255,255,255,0.03)", borderRadius: 3, overflow: "hidden" }}>
                                                <div style={{ width: `${pct}%`, height: "100%", background: b.hits >= 15 ? `${ACCENT}40` : b.hits >= 5 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)", borderRadius: 3, borderRight: b.hits > 0 ? `2px solid ${b.hits >= 15 ? ACCENT : b.hits >= 5 ? "#f59e0b" : "#ef4444"}` : "none" }} />
                                            </div>,
                                        ];
                                    })}
                                </div>
                                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 8, textAlign: "center" }}>
                                    Avg coverage: {(stats.searchBenchmark.reduce((s, b) => s + b.hits, 0) / stats.searchBenchmark.length).toFixed(0)}/20 hits per query - vector DB adds marginal value at this corpus size ({stats.chunks} chunks)
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recent injections */}
                    {stats.recentContexts && stats.recentContexts.length > 0 && (
                        <div style={{ ...cardShell, marginBottom: 16 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.1em" }}>Recent Injections</div>
                            {stats.recentContexts.slice(0, 5).map((c, i) => (
                                <div key={i} style={{
                                    padding: "8px 12px", marginBottom: 3, borderRadius: 6,
                                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                                    display: "flex", alignItems: "center", gap: 8,
                                }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: ACCENT, minWidth: 70 }}>{c.project || 'global'}</span>
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", flex: 1 }}>{c.prefs_count} prefs · {c.chunks_count} chunks</span>
                                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.52)" }}>{c.times ?? 1}x</span>
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{(c.context_size / 1000).toFixed(1)}KB</span>
                                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>{c.created_at?.slice(0, 10)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Charts */}
                    {stats.typeCounts && (
                        <RagCharts
                            typeCounts={stats.typeCounts}
                            projectCounts={stats.projectCounts || []}
                            prefCategories={stats.prefCategories || []}
                            timeline={stats.timeline || []}
                            injectionTimeline={stats.injectionTimeline || []}
                        />
                    )}
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
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Documents</div>
                            </div>
                            <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{totalChunks.toLocaleString()}</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Chunks</div>
                            </div>
                            <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{(totalSize / 1024).toFixed(0)}KB</div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total Size</div>
                            </div>
                        </div>

                        {/* Type distribution - horizontal bar chart */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.52)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>By Type</div>
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
                                                borderRight: `2px solid ${color}`,
                                                animation: "barGrow 0.8s ease-out both",
                                            }} />
                                            <span style={{ position: "absolute", left: 8, top: 3, fontSize: 9, fontWeight: 700, color }}>{count}</span>
                                        </div>
                                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", minWidth: 35, textAlign: "right" }}>{sizeKb}KB</span>
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
                                        style={{ width: `${pct}%`, background: `${color}50`, borderRight: "1px solid rgba(0,0,0,0.3)", animation: "barGrow 0.8s ease-out both", position: "relative" }}>
                                        {pct > 8 && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color }}>{type}</span>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Project breakdown - horizontal bars */}
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.52)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>By Project ({Object.keys(projectCounts).length})</div>
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
                                                borderRight: `2px solid ${color}`,
                                                animation: "barGrow 0.8s ease-out both",
                                            }} />
                                            <span style={{ position: "absolute", left: 6, top: 2, fontSize: 9, fontWeight: 700, color }}>{count}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {projectEntries.length > 15 && (
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: 4 }}>+{projectEntries.length - 15} more projects</div>
                            )}
                        </div>

                        {/* File list */}
                        <details open style={{ marginTop: 8 }}>
                            <summary style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "8px 0", userSelect: "none" }}>
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
                                            <div style={{ padding: "4px 8px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                                                <AppIcon project={project} size={12} /> <span style={{ textTransform: "uppercase" }}>{project}</span> <span style={{ fontSize: 8, color: "rgba(255,255,255,0.12)" }}>({items.length})</span>
                                            </div>
                                            {items.map(d => {
                                                const color = typeColors[d.source_type] || "#6b7280";
                                                return (
                                                    <div key={d.id} onClick={async () => {
                                                        setSelectedDoc(d); setLoadingDoc(true);
                                                        try { const res = await fetch(apiBase(`/api/rag/docs/${d.id}`)); const data = await res.json(); setDocContent(data.content || ""); } catch { setDocContent("Failed to load"); }
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
                                                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{d.chunk_count}ch</span>
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
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{selectedDoc.project}</span>
                                    <button onClick={() => { setSelectedDoc(null); setDocContent(""); }}
                                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex", padding: 2 }}>
                                        <X size={14} />
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
                                    {loadingDoc ? (
                                        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>Loading...</p>
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
                                        {isCollapsed ? <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.55)" }} /> : <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.55)" }} />}
                                        <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                                        <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10, color }}>{cat}</span>
                                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>{items.length}</span>
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
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.5 }}>
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
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Cmd+Enter</span>
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
                                    color: copied ? "#fff" : "rgba(255,255,255,0.52)",
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

            {tab === "eval" && <EvalTab apiBase={apiBase} />}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes sd-slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes barGrow { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
            `}</style>
        </div>
    );
}
