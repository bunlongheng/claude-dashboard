import { getDb } from "./rag-db";

// Chart payload for the RAG Overview page. Same window cutoff as getStats in
// rag-search.ts: calendar days in local time, days=1 is since local midnight.
// days <= 0 (all time) still buckets the last 30 days so the axis stays readable.
export interface RagChartsPayload {
    labels: string[];
    queries: { typed: number[]; auto: number[]; hits: number[] };
    contexts: { count: number[]; avgKb: number[] };
    ingest: { docs: number[]; chunks: number[] };
    topQueries: { query: string; count: number; hits: number }[];
    topDocs: { title: string; sourceType: string; accessCount: number }[];
    sources: { type: string; count: number }[];
    prefCategories: { category: string; count: number }[];
    evalByConfig: { config: string; runs: number; score: number; latencyMs: number }[];
    totals: { typed: number; auto: number; hits: number; contexts: number; docs: number; chunks: number };
}

const CUTOFF = "created_at >= datetime('now','localtime','start of day', ?, 'utc')";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
const pad = (n: number) => String(n).padStart(2, "0");

function rows<T>(sql: string, ...args: unknown[]): T[] {
    try { return getDb().prepare(sql).all(...args) as T[]; } catch { return []; }
}

export function getRagCharts(days: number): RagChartsPayload {
    const hourly = days === 1;
    const span = days > 0 ? days : 30;
    const since = `-${span - 1} days`;
    const sinceTotals = days > 0 ? since : "";

    // Bucket keys + labels, oldest first.
    const keys: string[] = [];
    const labels: string[] = [];
    if (hourly) {
        for (let h = 0; h < 24; h++) { keys.push(pad(h)); labels.push(hourLabel(h)); }
    } else {
        const now = new Date();
        for (let i = span - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
            labels.push(`${MONTHS[d.getMonth()]} ${d.getDate()}`);
        }
    }
    const bucket = hourly ? "strftime('%H', created_at, 'localtime')" : "strftime('%Y-%m-%d', created_at, 'localtime')";
    const idx = new Map(keys.map((k, i) => [k, i]));
    const series = (sql: string): number[] => {
        const out = keys.map(() => 0);
        for (const r of rows<{ b: string; v: number }>(sql, since)) {
            const i = idx.get(r.b);
            if (i !== undefined) out[i] = r.v ?? 0;
        }
        return out;
    };
    const AUTO = "query = 'general session'";

    const typed = series(`SELECT ${bucket} b, COUNT(*) v FROM search_log WHERE ${CUTOFF} AND NOT ${AUTO} GROUP BY b`);
    const auto = series(`SELECT ${bucket} b, COUNT(*) v FROM search_log WHERE ${CUTOFF} AND ${AUTO} GROUP BY b`);
    const hits = series(`SELECT ${bucket} b, COUNT(*) v FROM search_log WHERE ${CUTOFF} AND NOT ${AUTO} AND results_count > 0 GROUP BY b`);
    const ctxCount = series(`SELECT ${bucket} b, COUNT(*) v FROM context_log WHERE ${CUTOFF} GROUP BY b`);
    const avgKb = series(`SELECT ${bucket} b, ROUND(AVG(context_size) / 1024.0, 1) v FROM context_log WHERE ${CUTOFF} GROUP BY b`);
    const docs = series(`SELECT ${bucket} b, COUNT(*) v FROM documents WHERE ${CUTOFF} GROUP BY b`);
    const chunks = series(`SELECT ${bucket} b, COUNT(*) v FROM chunks WHERE ${CUTOFF} GROUP BY b`);

    const w = sinceTotals ? `WHERE ${CUTOFF}` : "";
    const wa = sinceTotals ? `AND ${CUTOFF}` : "";
    const a = sinceTotals ? [sinceTotals] : [];
    const count = (sql: string) => rows<{ c: number }>(sql, ...a)[0]?.c ?? 0;

    const topQueries = rows<{ query: string; count: number; hits: number }>(
        `SELECT query, COUNT(*) count, SUM(results_count > 0) hits FROM search_log WHERE NOT ${AUTO} ${wa} GROUP BY query ORDER BY count DESC LIMIT 6`, ...a,
    ).map(r => ({ query: r.query, count: r.count, hits: r.hits ?? 0 }));

    const topDocs = rows<{ title: string | null; source_path: string | null; source_type: string | null; access_count: number }>(
        "SELECT title, source_path, source_type, access_count FROM documents WHERE access_count > 0 ORDER BY access_count DESC LIMIT 6",
    ).map(r => ({
        title: r.title || (r.source_path ?? "").split("/").filter(Boolean).pop() || "untitled",
        sourceType: r.source_type ?? "unknown",
        accessCount: r.access_count,
    }));

    return {
        labels,
        queries: { typed, auto, hits },
        contexts: { count: ctxCount, avgKb },
        ingest: { docs, chunks },
        topQueries,
        topDocs,
        sources: rows<{ type: string | null; count: number }>("SELECT source_type type, COUNT(*) count FROM documents GROUP BY source_type ORDER BY count DESC")
            .map(r => ({ type: r.type ?? "unknown", count: r.count })),
        prefCategories: rows<{ category: string | null; count: number }>("SELECT category, COUNT(*) count FROM preferences GROUP BY category ORDER BY count DESC LIMIT 8")
            .map(r => ({ category: r.category ?? "other", count: r.count })),
        evalByConfig: rows<{ config: string; runs: number; score: number | null; latency: number | null }>(
            "SELECT config, COUNT(*) runs, ROUND(AVG(judge_score), 2) score, ROUND(AVG(latency_ms)) latency FROM eval_runs GROUP BY config ORDER BY config",
        ).map(r => ({ config: r.config, runs: r.runs, score: r.score ?? 0, latencyMs: r.latency ?? 0 })),
        totals: {
            typed: count(`SELECT COUNT(*) c FROM search_log WHERE NOT ${AUTO} ${wa}`),
            auto: count(`SELECT COUNT(*) c FROM search_log WHERE ${AUTO} ${wa}`),
            hits: count(`SELECT COUNT(*) c FROM search_log WHERE NOT ${AUTO} AND results_count > 0 ${wa}`),
            contexts: count(`SELECT COUNT(*) c FROM context_log ${w}`),
            docs: count(`SELECT COUNT(*) c FROM documents ${w}`),
            chunks: count(`SELECT COUNT(*) c FROM chunks ${w}`),
        },
    };
}
