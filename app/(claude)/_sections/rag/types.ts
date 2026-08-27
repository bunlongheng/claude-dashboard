// Shared types + constants for the RAG tabs. Split out of RagSection.tsx so
// the per-tab subcomponents in this folder don't need to import from the
// parent (which would create a cycle).

export const ACCENT = "#10b981";

export type Stats = {
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

export type Pref = { id: number; category: string; key: string; value: string };
export type SearchResult = { chunk_id: number; doc_id: number; content: string; project: string; source_type: string; title: string };

export type RagTab = "overview" | "documents" | "search" | "preferences" | "eval";
export type DocInfo = { id: number; source_path: string; source_type: string; project: string; title: string; size: number; chunk_count: number; updated_at: string };
