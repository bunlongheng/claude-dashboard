"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { DatabaseZap, Layers, Brain, FolderOpen } from "lucide-react";
import { cardShell } from "@/lib/ui-tokens";
import { ACCENT, type Stats, type RagTab } from "./types";

const RagCharts = dynamic(() => import("../RagCharts"), { ssr: false });

// Overview tab - stat cards, glossary, RAG impact, search architecture
// comparison, recent injections and charts. Lifted verbatim from
// RagSection.tsx's `tab === "overview"` block.
function OverviewTab({ stats, onNavigate }: { stats: Stats; onNavigate: (tab: RagTab) => void }) {
    const [glossaryOpen, setGlossaryOpen] = useState(false);

    return (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 16 }}>
                {[
                    { label: "Documents", value: stats.documents, icon: DatabaseZap, color: "#FF3B30", tab: "documents" as RagTab },
                    { label: "Chunks", value: stats.chunks, icon: Layers, color: "#FF6347", tab: "documents" as RagTab },
                    { label: "Preferences", value: stats.preferences, icon: Brain, color: "#FF9500", tab: "preferences" as RagTab },
                    { label: "Projects", value: stats.projects, icon: FolderOpen, color: "#f97316", tab: "documents" as RagTab },
                ].map(c => (
                    <div key={c.label} onClick={() => onNavigate(c.tab)}
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
    );
}

export default memo(OverviewTab);
