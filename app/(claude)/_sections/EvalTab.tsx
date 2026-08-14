"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Play, Trophy, Clock, DollarSign, FileText, ChevronDown, ChevronRight } from "lucide-react";

type ConfigKey = "nothing" | "rag" | "rag_vector" | "rag_vector_kp" | "kp";

const CONFIG_META: Record<ConfigKey, { label: string; color: string }> = {
    nothing: { label: "Nothing", color: "#6b7280" },
    rag: { label: "RAG only", color: "#10b981" },
    rag_vector: { label: "RAG + Vector", color: "#3b82f6" },
    rag_vector_kp: { label: "RAG + Vector + KP", color: "#8b5cf6" },
    kp: { label: "KP LLM only", color: "#f59e0b" },
};

type ConfigReport = {
    config: ConfigKey;
    runs: number;
    avgScore: number;
    avgLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCostUsd: number;
    avgContextSize: number;
};
type Report = { batchId: string | null; configs: ConfigReport[]; questionCount: number };
type Question = { id: number; question: string; expected: string; tags: string };
type DetailRow = { question_id: number; question: string; expected: string; config: ConfigKey; response: string; judge_score: number; judge_reason: string };

export default function EvalTab({ apiBase }: { apiBase: (p: string) => string }) {
    const [running, setRunning] = useState(false);
    const [openQ, setOpenQ] = useState<number | null>(null);

    const { data, isFetching: loading, refetch } = useQuery({
        queryKey: ["rag-eval", apiBase("/api/rag/eval")],
        queryFn: async () => {
            const [r, q] = await Promise.all([
                fetch(apiBase(`/api/rag/eval`)).then(x => x.json()),
                fetch(apiBase(`/api/rag/eval/questions`)).then(x => x.json()),
            ]);
            let detail: DetailRow[] = [];
            if (r?.batchId) {
                const d = await fetch(apiBase(`/api/rag/eval?batch=${r.batchId}&detail=1`)).then(x => x.json());
                detail = d.rows || [];
            }
            return { report: r as Report, questions: (q.questions || []) as Question[], detail };
        },
    });
    const report = data?.report ?? null;
    const questions = data?.questions ?? [];
    const detail = data?.detail ?? [];

    async function run() {
        setRunning(true);
        try {
            await fetch(apiBase(`/api/rag/eval`), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            await refetch();
        } catch { /* */ }
        setRunning(false);
    }

    const configs = report?.configs ?? [];
    const maxScore = 5;
    const bestScore = Math.max(0, ...configs.map(c => c.avgScore));
    const maxLatency = Math.max(1, ...configs.map(c => c.avgLatencyMs));
    const maxCost = Math.max(0.0001, ...configs.map(c => c.totalCostUsd));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FlaskConical size={18} style={{ color: "#8b5cf6" }} />
                        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>Memory Benchmark</h2>
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", margin: "4px 0 0" }}>
                        {questions.length} questions x 5 configs. LLM-judged 0-5 on accuracy.
                    </p>
                </div>
                <button
                    onClick={run}
                    disabled={running || questions.length === 0}
                    style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                        background: running ? "rgba(139,92,246,0.3)" : "#8b5cf6", color: "#fff",
                        border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: running || !questions.length ? "default" : "pointer", opacity: !questions.length ? 0.4 : 1,
                    }}
                >
                    <Play size={14} /> {running ? "Running 50 evals..." : "Run benchmark"}
                </button>
            </div>

            {loading && <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>Loading...</p>}

            {!loading && !report?.batchId && (
                <div style={{ textAlign: "center", padding: "48px 0", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12 }}>
                    <FlaskConical size={28} style={{ color: "rgba(255,255,255,0.45)", margin: "0 auto 10px" }} />
                    <p style={{ color: "rgba(255,255,255,0.52)", fontSize: 13 }}>No benchmark run yet</p>
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 4 }}>Click Run benchmark to compare all 5 memory configs.</p>
                </div>
            )}

            {/* Config comparison cards */}
            {configs.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    {configs.map(c => {
                        const meta = CONFIG_META[c.config];
                        const isBest = c.avgScore === bestScore && bestScore > 0;
                        return (
                            <div key={c.config} style={{
                                background: "rgba(255,255,255,0.02)", border: `1px solid ${isBest ? meta.color : "rgba(255,255,255,0.08)"}`,
                                borderRadius: 12, padding: 16, position: "relative",
                                boxShadow: isBest ? `0 0 0 1px ${meta.color}, 0 8px 24px ${meta.color}22` : "none",
                            }}>
                                {isBest && (
                                    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 4, color: meta.color, fontSize: 10, fontWeight: 700 }}>
                                        <Trophy size={12} /> BEST
                                    </div>
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{meta.label}</span>
                                </div>
                                {/* Score */}
                                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                                    <span style={{ fontSize: 30, fontWeight: 800, color: meta.color, lineHeight: 1 }}>{c.avgScore.toFixed(2)}</span>
                                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>/ 5.0</span>
                                </div>
                                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
                                    <div style={{ width: `${(c.avgScore / maxScore) * 100}%`, height: "100%", background: meta.color }} />
                                </div>
                                {/* Metrics */}
                                <Metric icon={<Clock size={12} />} label="Latency" value={`${Math.round(c.avgLatencyMs)}ms`} bar={c.avgLatencyMs / maxLatency} color={meta.color} />
                                <Metric icon={<DollarSign size={12} />} label="Cost" value={`$${c.totalCostUsd.toFixed(4)}`} bar={c.totalCostUsd / maxCost} color={meta.color} />
                                <Metric icon={<FileText size={12} />} label="Context" value={`${Math.round(c.avgContextSize)} ch`} />
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 8 }}>
                                    {c.totalTokensIn.toLocaleString()} in / {c.totalTokensOut.toLocaleString()} out tokens
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Per-question drill-down */}
            {detail.length > 0 && (
                <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>
                        Per-question scores
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {questions.map(q => {
                            const rows = detail.filter(d => d.question_id === q.id);
                            if (!rows.length) return null;
                            const open = openQ === q.id;
                            return (
                                <div key={q.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                                    <button onClick={() => setOpenQ(open ? null : q.id)} style={{
                                        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                                        background: "none", border: "none", cursor: "pointer", textAlign: "left",
                                    }}>
                                        {open ? <ChevronDown size={14} color="rgba(255,255,255,0.52)" /> : <ChevronRight size={14} color="rgba(255,255,255,0.52)" />}
                                        <span style={{ flex: 1, fontSize: 12, color: "#fff" }}>{q.question}</span>
                                        <div style={{ display: "flex", gap: 4 }}>
                                            {rows.map(r => (
                                                <span key={r.config} title={CONFIG_META[r.config].label}
                                                    style={{
                                                        width: 22, height: 22, borderRadius: 5, fontSize: 11, fontWeight: 700,
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        background: `${CONFIG_META[r.config].color}22`, color: CONFIG_META[r.config].color,
                                                    }}>
                                                    {r.judge_score}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                    {open && (
                                        <div style={{ padding: "0 12px 12px 36px", display: "flex", flexDirection: "column", gap: 8 }}>
                                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.52)" }}>
                                                <span style={{ color: "rgba(255,255,255,0.6)" }}>Expected:</span> {q.expected}
                                            </div>
                                            {rows.map(r => (
                                                <div key={r.config} style={{ borderLeft: `2px solid ${CONFIG_META[r.config].color}`, paddingLeft: 10 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: CONFIG_META[r.config].color }}>{CONFIG_META[r.config].label}</span>
                                                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.52)" }}>score {r.judge_score}</span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{r.response}</div>
                                                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2, fontStyle: "italic" }}>{r.judge_reason}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function Metric({ icon, label, value, bar, color }: { icon: React.ReactNode; label: string; value: string; bar?: number; color?: string }) {
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.52)" }}>{icon} {label}</span>
                <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{value}</span>
            </div>
            {bar !== undefined && (
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
                    <div style={{ width: `${Math.min(100, bar * 100)}%`, height: "100%", background: color, opacity: 0.5 }} />
                </div>
            )}
        </div>
    );
}
