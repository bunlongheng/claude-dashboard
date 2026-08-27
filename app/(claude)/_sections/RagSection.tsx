"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, Search, RefreshCw } from "lucide-react";
import { MascotLoader } from "./MascotLoader";
import { useMachine } from "./MachineContext";
import { SegmentedTabs } from "./shared";
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
    const router = useRouter();
    const pathname = usePathname();
    const [tab, setTabState] = useState<RagTab>(initialTab);
    const setTab = useCallback((t: RagTab) => {
        setTabState(t);
        router.replace(`${pathname}?tab=${t}`, { scroll: false });
    }, [router, pathname]);

    // Stats + preferences + docs are fetched together (same as the original
    // Promise.all) so a failure on any one leaves all three at their fallback,
    // matching the old fetchAll() try/catch behavior.
    const queryClient = useQueryClient();
    const { data: ragData, isLoading } = useQuery<RagAllData>({
        queryKey: ["rag", "all", machine],
        queryFn: async () => {
            const [s, p, d] = await Promise.all([
                fetch(apiBase(`/api/rag/stats`)).then(r => r.json()),
                fetch(apiBase(`/api/rag/preferences`)).then(r => r.json()),
                fetch(apiBase(`/api/rag/docs`)).then(r => r.json()),
            ]);
            return { stats: s, prefs: p, docs: d };
        },
    });
    const stats = ragData?.stats ?? null;
    const prefs = ragData?.prefs ?? [];
    const docs = ragData?.docs ?? [];
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

    const tabs: { label: string; value: string; count?: number }[] = [
        { label: "Overview", value: "overview" },
        { label: "Documents", value: "documents", count: docs.length },
        { label: "Preferences", value: "preferences", count: prefs.length },
        { label: "Benchmark", value: "eval" },
    ];

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

            {/* Search results - shown on any tab when there are results */}
            <SearchResultsPanel results={results} onClear={() => { setResults([]); setQuery(""); }} />

            {/* ── Overview ── */}
            {tab === "overview" && <OverviewTab stats={stats} onNavigate={setTab} />}

            {/* ── Documents ── */}
            {tab === "documents" && <DocumentsTab docs={docs} apiBase={apiBase} />}

            {/* ── Preferences ── */}
            {tab === "preferences" && <PreferencesTab prefs={prefs} />}

            {tab === "eval" && <EvalTab apiBase={apiBase} />}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes sd-slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes barGrow { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
            `}</style>
        </div>
    );
}
