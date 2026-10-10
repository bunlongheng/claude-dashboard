"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, Search, RefreshCw } from "lucide-react";
import { MascotLoader } from "./MascotLoader";
import { useMachine } from "./MachineContext";
import { SegmentedTabs, WINDOW_TABS, type Window4 } from "./shared";
import { HeroSlot } from "./PageHero";
import { JEV_DAYS } from "@/lib/jev-palette";
import EvalTab from "./EvalTab";
import { ACCENT, type Stats, type Pref, type SearchResult, type RagTab, type DocInfo } from "./rag/types";
import SearchResultsPanel from "./rag/SearchResultsPanel";
import OverviewTab from "./rag/OverviewTab";
import DocumentsTab from "./rag/DocumentsTab";
import PreferencesTab from "./rag/PreferencesTab";

export type { RagTab };

type RagAllData = { stats: Stats; prefs: Pref[]; docs: DocInfo[] };

export default function RagSection({ initialTab = "overview" }: { initialTab?: RagTab }) {
    const { machine, apiBase } = useMachine();
    // 1 page, no tabs: the old tab routes and the hero cards scroll to a section instead.
    const jump = useCallback((t: RagTab) => {
        document.getElementById(`rag-${t}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    // Stats + preferences + docs are fetched together (same as the original
    // Promise.all) so a failure on any one leaves all three at their fallback,
    // matching the old fetchAll() try/catch behavior.
    const queryClient = useQueryClient();
    const [win, setWin] = useState<Window4>("today");
    const days = JEV_DAYS[win];
    const { data: ragData, isLoading, dataUpdatedAt } = useQuery<RagAllData>({
        queryKey: ["rag", "all", machine, days],
        placeholderData: prev => prev,
        queryFn: async () => {
            const [s, p, d] = await Promise.all([
                fetch(apiBase(`/api/rag/stats?days=${days}`)).then(r => r.json()),
                fetch(apiBase(`/api/rag/preferences`)).then(r => r.json()),
                fetch(apiBase(`/api/rag/docs`)).then(r => r.json()),
            ]);
            return { stats: s, prefs: p, docs: d };
        },
    });
    const stats = ragData?.stats ?? null;
    const ready = stats !== null;
    useEffect(() => {
        if (ready && initialTab !== "overview" && initialTab !== "search") jump(initialTab);
    }, [ready, initialTab, jump]);
    const prefs = ragData?.prefs ?? [];
    // Documents tab lists what was added inside the hero window, counted the same
    // way as the hero card: created_at (SQLite UTC text) since local midnight days-1 ago.
    const start = new Date(dataUpdatedAt); start.setHours(0, 0, 0, 0);
    const cutoff = start.getTime() - (days - 1) * 86400_000;
    const docs = (ragData?.docs ?? []).filter(d => Date.parse(d.created_at.replace(" ", "T") + "Z") >= cutoff);
    const loading = isLoading;

    const ingestMutation = useMutation({
        mutationFn: async () => {
            await fetch(apiBase(`/api/rag/ingest`), { method: "POST" });
            await fetch(apiBase(`/api/rag/insights`), { method: "POST" });
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rag", "all"] }); },
    });
    const ingesting = ingestMutation.isPending;

    // Search state
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

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

    const sectionTitle = (id: RagTab, label: string, count?: number) => (
        <div id={`rag-${id}`} className="flex items-baseline gap-2 mt-8 mb-3 scroll-mt-4">
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
            {count !== undefined && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{count.toLocaleString()}</span>}
        </div>
    );

    return (
        <div>
            <HeroSlot>
                <SegmentedTabs<Window4> tabs={WINDOW_TABS} value={win} onChange={setWin} />
            </HeroSlot>
            {/* Search + Ingest */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
                <button onClick={() => ingestMutation.mutate()} disabled={ingesting}
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

            <SearchResultsPanel results={results} onClear={() => { setResults([]); setQuery(""); }} />

            <OverviewTab stats={stats} onNavigate={jump} />

            {sectionTitle("documents", "Documents", docs.length)}
            <DocumentsTab docs={docs} apiBase={apiBase} />

            {sectionTitle("preferences", "Preferences", prefs.length)}
            <PreferencesTab prefs={prefs} />

            {sectionTitle("eval", "Benchmark")}
            <EvalTab apiBase={apiBase} />

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes sd-slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes barGrow { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
            `}</style>
        </div>
    );
}
