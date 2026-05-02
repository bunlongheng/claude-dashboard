"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Search, Layers, Brain, FolderOpen, RefreshCw, Sparkles, Copy, Check, ChevronDown, ChevronRight, FileText, X } from "lucide-react";

const ACCENT = "#dc143c";

type Stats = {
    documents: number; chunks: number; preferences: number;
    searches: number; projects: number; lastIngest: string | null;
};

type Pref = { id: number; category: string; key: string; value: string };
type SearchResult = { chunk_id: number; doc_id: number; content: string; project: string; source_type: string; title: string };

export type RagTab = "overview" | "documents" | "search" | "preferences" | "context";
type DocInfo = { id: number; source_path: string; source_type: string; project: string; title: string; size: number; chunk_count: number; updated_at: string };

export default function RagSection({ initialTab = "overview" }: { initialTab?: RagTab }) {
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

    if (loading) return <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "64px 0" }}>Connecting to RAG...</p>;
    if (!stats) return (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
            <DatabaseZap size={32} style={{ color: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>RAG server not running</p>
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 4 }}>Start it: <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>cd ~/Sites/rag && npm run dev</code></p>
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

                    {/* Source breakdown */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Data Sources</div>
                    {[
                        { label: "Conversations", desc: "Your past Claude Code sessions", color: "#22c55e" },
                        { label: "Insights", desc: "Auto-extracted learnings from sessions", color: "#f43f5e" },
                        { label: "Memory", desc: "Hand-curated project memory files", color: "#eab308" },
                        { label: "CLAUDE.md", desc: "Project rules & global config", color: "#8b5cf6" },
                    ].map(s => (
                        <div key={s.label} style={{
                            padding: "10px 12px", marginBottom: 4, borderRadius: 8,
                            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                            display: "flex", alignItems: "center", gap: 10,
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{s.label}</div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{s.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Documents ── */}
            {tab === "documents" && (() => {
                const types = [...new Set(docs.map(d => d.source_type))].sort();
                const projects = [...new Set(docs.map(d => d.project))].sort();
                const typeColors: Record<string, string> = { conversation: "#22c55e", insight: "#f43f5e", memory: "#eab308", claude_md: "#8b5cf6", global_rules: "#a855f7" };

                let filtered = docs;
                if (docFilter !== "all") filtered = filtered.filter(d => d.source_type === docFilter);
                if (docProjectFilter !== "all") filtered = filtered.filter(d => d.project === docProjectFilter);

                // Group by project
                const grouped: Record<string, DocInfo[]> = {};
                for (const d of filtered) { if (!grouped[d.project]) grouped[d.project] = []; grouped[d.project].push(d); }

                return (
                    <>
                    <div>
                        {/* Filters */}
                        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", gap: 3 }}>
                                {[{ label: "All", value: "all" }, ...types.map(t => ({ label: t, value: t }))].map(t => (
                                    <button key={t.value} onClick={() => setDocFilter(t.value)}
                                        style={{
                                            padding: "3px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700, cursor: "pointer",
                                            background: docFilter === t.value ? `${typeColors[t.value] || ACCENT}20` : "rgba(255,255,255,0.03)",
                                            border: docFilter === t.value ? `1px solid ${typeColors[t.value] || ACCENT}40` : "1px solid rgba(255,255,255,0.06)",
                                            color: docFilter === t.value ? (typeColors[t.value] || ACCENT) : "rgba(255,255,255,0.35)",
                                            textTransform: "uppercase", letterSpacing: "0.03em",
                                        }}>{t.label}</button>
                                ))}
                            </div>
                            <select value={docProjectFilter} onChange={e => setDocProjectFilter(e.target.value)}
                                style={{
                                    padding: "3px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                                    color: "rgba(255,255,255,0.5)", outline: "none", fontFamily: "inherit",
                                }}>
                                <option value="all">All projects</option>
                                {projects.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginLeft: "auto", alignSelf: "center" }}>{filtered.length} docs</span>
                        </div>

                        {/* Grouped list */}
                        {Object.entries(grouped).sort().map(([project, items]) => (
                            <div key={project} style={{ marginBottom: 12 }}>
                                <div style={{
                                    padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)",
                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                    display: "flex", alignItems: "center", gap: 6,
                                }}>
                                    <FolderOpen size={11} style={{ color: "rgba(255,255,255,0.2)" }} />
                                    {project}
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>({items.length})</span>
                                </div>
                                {items.map(d => {
                                    const color = typeColors[d.source_type] || "#6b7280";
                                    return (
                                        <div key={d.id} onClick={async () => {
                                            setSelectedDoc(d); setLoadingDoc(true);
                                            try {
                                                const res = await fetch(`/api/rag/docs/${d.id}`);
                                                const data = await res.json();
                                                setDocContent(data.content || "");
                                            } catch { setDocContent("Failed to load"); }
                                            setLoadingDoc(false);
                                        }} style={{
                                            padding: "8px 12px 8px 28px", marginBottom: 2, borderRadius: 6,
                                            background: selectedDoc?.id === d.id ? "rgba(244,63,94,0.08)" : "rgba(255,255,255,0.02)",
                                            border: selectedDoc?.id === d.id ? `1px solid ${ACCENT}30` : "1px solid rgba(255,255,255,0.04)",
                                            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                                            transition: "background 0.1s",
                                        }}>
                                            <FileText size={12} style={{ color, flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.7)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                                            <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${color}15`, color, textTransform: "uppercase" }}>{d.source_type}</span>
                                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{d.chunk_count} chunks</span>
                                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", flexShrink: 0 }}>{(d.size / 1024).toFixed(1)}KB</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
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
