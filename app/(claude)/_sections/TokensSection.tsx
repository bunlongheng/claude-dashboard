"use client";

import { useState, useMemo, useEffect } from "react";
import {
    CpuChipIcon, CurrencyDollarIcon,
    ArchiveBoxIcon,
    ServerIcon, FolderIcon, ChevronLeftIcon, ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
    ACCENT, StatCard, SectionHeader,
    Token, MACHINE_COLORS,
    groupBy, calcCost, fmtNum, fmtCost, hexToRgba, PRICE,
} from "./shared";
import { useMachine } from "./MachineContext";
import { safeFetch } from "./shared";

const PAGE_SIZE = 20;
const COLOR_PALETTE = ["#ff3b5c", "#ff6347", "#f97316", "#ffb800", "#cddc39", "#00c853", "#00bfa5", "#4fc3f7", "#2962ff", "#5c4db1", "#ab47bc", "#ff1667"];
function getAppColor(index: number): string {
    return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

// ── Pricing (per MTok, from Nate's pricing.json) ────────────────────────────
const MODEL_PRICING: Record<string, { input: number; output: number; cache_read: number; cache_create: number }> = {
    opus:   { input: 15.00, output: 75.00, cache_read: 1.50, cache_create: 18.75 },
    sonnet: { input: 3.00,  output: 15.00, cache_read: 0.30, cache_create: 3.75  },
    haiku:  { input: 1.00,  output: 5.00,  cache_read: 0.10, cache_create: 1.25  },
};

const PLANS = [
    { key: "api",     label: "API",     monthly: 0 },
    { key: "pro",     label: "Pro",     monthly: 20 },
    { key: "max",     label: "Max",     monthly: 100 },
    { key: "max-20x", label: "Max 20x", monthly: 200 },
];

function getTier(model: string): string {
    const m = (model || "").toLowerCase();
    if (m.includes("opus")) return "opus";
    if (m.includes("haiku")) return "haiku";
    return "sonnet";
}

function calcModelCost(input: number, output: number, cacheRead: number, cacheCreate: number, model: string): number {
    const p = MODEL_PRICING[getTier(model)] ?? MODEL_PRICING.sonnet;
    return (input / 1e6) * p.input + (output / 1e6) * p.output + (cacheRead / 1e6) * p.cache_read + (cacheCreate / 1e6) * p.cache_create;
}

// ── Chart colors ────────────────────────────────────────────────────────────
const TOKEN_COLORS = {
    input: "#4A9EFF",
    output: "#7C5CFF",
    cache_read: "#3FB68B",
    cache_creation: "#E8A23B",
};
const MODEL_COLORS_CHART = ["#f97316", "#4A9EFF", "#3FB68B", "#7C5CFF", "#E8A23B", "#f472b6"];

// ── Types ───────────────────────────────────────────────────────────────────
interface DailyBucket { day: string; input: number; output: number; cache_read: number; cache_creation: number; turns: number; sessions: number }
interface ModelBucket { model: string; input: number; output: number; cache_read: number; cache_creation: number; turns: number }
interface ToolBucket  { tool: string; calls: number }

// ── Stacked Bar Chart (pure CSS) ────────────────────────────────────────────
function StackedBarChart({ data, keys, colors, labels }: {
    data: { label: string; values: number[] }[];
    keys: string[];
    colors: string[];
    labels: string[];
}) {
    const maxVal = Math.max(...data.map(d => d.values.reduce((s, v) => s + v, 0)), 1);
    return (
        <div>
            <div className="flex items-end gap-[2px]" style={{ height: 200 }}>
                {data.map((d, i) => {
                    const total = d.values.reduce((s, v) => s + v, 0);
                    const pct = (total / maxVal) * 100;
                    return (
                        <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: "100%" }}
                            title={`${d.label}\n${keys.map((k, j) => `${labels[j]}: ${fmtNum(d.values[j])}`).join("\n")}`}>
                            <div style={{ height: `${pct}%`, minHeight: total > 0 ? 2 : 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: "2px 2px 0 0", overflow: "hidden" }}>
                                {d.values.map((v, j) => {
                                    const segPct = total > 0 ? (v / total) * 100 : 0;
                                    if (segPct < 0.5) return null;
                                    return <div key={j} style={{ height: `${segPct}%`, background: colors[j], minHeight: v > 0 ? 1 : 0 }} />;
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* X-axis labels - show every Nth */}
            <div className="flex gap-[2px] mt-1">
                {data.map((d, i) => {
                    const showLabel = data.length <= 14 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1;
                    return (
                        <div key={i} className="flex-1 text-center">
                            {showLabel && <span className="text-[8px] text-white/20">{d.label.slice(5)}</span>}
                        </div>
                    );
                })}
            </div>
            {/* Legend */}
            <div className="flex gap-3 mt-2">
                {labels.map((l, i) => (
                    <div key={l} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: colors[i] }} />
                        <span className="text-[9px] text-white/40">{l}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Donut Chart (pure SVG) ──────────────────────────────────────────────────
function DonutChart({ segments, size = 160 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return <div className="text-white/20 text-xs text-center py-8">No data</div>;

    const r = (size - 20) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const strokeWidth = 28;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    return (
        <div className="flex items-center gap-4">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {segments.filter(s => s.value > 0).map((seg, i) => {
                    const pct = seg.value / total;
                    const dashLen = pct * circumference;
                    const dashOffset = -offset * circumference;
                    offset += pct;
                    return (
                        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={strokeWidth}
                            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                            strokeDashoffset={dashOffset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ opacity: 0.85 }} />
                    );
                })}
                <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="18" fontWeight="700">{fmtNum(total)}</text>
                <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="600">TOKENS</text>
            </svg>
            <div className="space-y-1.5">
                {segments.filter(s => s.value > 0).map((seg, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: seg.color }} />
                        <span className="text-[10px] text-white/50">{seg.label}</span>
                        <span className="text-[10px] font-bold text-white/70">{((seg.value / total) * 100).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Horizontal Bar Chart ────────────────────────────────────────────────────
function HBarChart({ items, color }: { items: { label: string; value: number }[]; color: string }) {
    const maxVal = items[0]?.value ?? 1;
    return (
        <div className="space-y-2">
            {items.map((item, i) => (
                <div key={item.label}>
                    <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-white/50">{item.label}</span>
                        <span className="text-[10px] font-bold" style={{ color }}>{fmtNum(item.value)}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <div style={{ width: `${(item.value / maxVal) * 100}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.8s", transitionDelay: `${i * 0.04}s` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function TokensSection({ initialTokens }: { initialTokens: Token[] }) {
    const [tokens] = useState<Token[]>(initialTokens);
    const { machine, apiBase } = useMachine();
    const [page, setPage] = useState(0);
    const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("30d");
    const [plan, setPlan] = useState("max-20x");
    const [sessionDates, setSessionDates] = useState<Map<string, number>>(new Map());
    const [glossaryOpen, setGlossaryOpen] = useState(false);

    // Daily data from API
    const [daily, setDaily] = useState<DailyBucket[]>([]);
    const [byModelDaily, setByModelDaily] = useState<ModelBucket[]>([]);
    const [topTools, setTopTools] = useState<ToolBucket[]>([]);
    const [totalTurns, setTotalTurns] = useState(0);

    useEffect(() => {
        safeFetch<any>(apiBase("/api/claude/token-stats/daily"), { daily: [], byModel: [], tools: [], totalTurns: 0 })
            .then(d => {
                setDaily(d.daily ?? []);
                setByModelDaily(d.byModel ?? []);
                setTopTools(d.tools ?? []);
                setTotalTurns(d.totalTurns ?? 0);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    // Fetch session dates for time filtering
    useEffect(() => {
        safeFetch<any>(apiBase("/api/claude/sessions"), { projects: [] }).then(d => {
            const dates = new Map<string, number>();
            for (const p of d.projects ?? []) {
                for (const s of p.sessions ?? []) {
                    dates.set(s.id, new Date(s.updatedAt).getTime());
                }
            }
            setSessionDates(dates);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    // Time-filtered tokens
    const timeFiltered = useMemo(() => {
        if (period === "all" || sessionDates.size === 0) return tokens;
        const cutoff = period === "today" ? Date.now() - 86400000
            : period === "7d" ? Date.now() - 7 * 86400000
            : Date.now() - 30 * 86400000;
        return tokens.filter(t => {
            const date = sessionDates.get(t.session_id);
            return date ? date > cutoff : false;
        });
    }, [tokens, period, sessionDates]);

    // Filtered data (machine + time)
    const filtered = useMemo(
        () => machine ? timeFiltered.filter(t => t.machine === machine) : timeFiltered,
        [timeFiltered, machine]
    );

    // Filter daily data by period
    const filteredDaily = useMemo(() => {
        if (period === "all") return daily;
        const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
        const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
        return daily.filter(d => d.day >= cutoff);
    }, [daily, period]);

    // Aggregates
    const totalIn = useMemo(() => filtered.reduce((s, t) => s + t.input_tokens, 0), [filtered]);
    const totalOut = useMemo(() => filtered.reduce((s, t) => s + t.output_tokens, 0), [filtered]);
    const totalCacheRead = useMemo(() => filtered.reduce((s, t) => s + t.cache_read_tokens, 0), [filtered]);
    const totalCacheCreate = useMemo(() => filtered.reduce((s, t) => s + t.cache_creation_tokens, 0), [filtered]);
    const totalCost = useMemo(() => filtered.reduce((s, t) => s + calcCost(t), 0), [filtered]);
    const filteredTurns = useMemo(() => filteredDaily.reduce((s, d) => s + d.turns, 0), [filteredDaily]);

    // Per-model breakdown
    const byModel = useMemo(() => {
        const m = groupBy(filtered, t => t.model ?? "unknown");
        return [...m.entries()]
            .map(([model, rows]) => ({
                model,
                total: rows.reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
                input: rows.reduce((s, t) => s + t.input_tokens, 0),
                output: rows.reduce((s, t) => s + t.output_tokens, 0),
                cache_read: rows.reduce((s, t) => s + t.cache_read_tokens, 0),
                cache_creation: rows.reduce((s, t) => s + t.cache_creation_tokens, 0),
                cost: rows.reduce((s, t) => s + calcCost(t), 0),
                count: rows.length,
            }))
            .sort((a, b) => b.total - a.total);
    }, [filtered]);

    // Per-project breakdown
    const byProject = useMemo(() => {
        const m = groupBy(filtered, t => t.project?.split("/").pop() ?? "unknown");
        return [...m.entries()]
            .map(([project, rows]) => ({
                project,
                total: rows.reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
                cost: rows.reduce((s, t) => s + calcCost(t), 0),
                count: rows.length,
            }))
            .sort((a, b) => b.total - a.total);
    }, [filtered]);

    // Paginated session table
    const sorted = useMemo(() => [...filtered].sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)), [filtered]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    useEffect(() => { setPage(0); }, [machine, period]);

    // Plan-aware cost
    const currentPlan = PLANS.find(p => p.key === plan) ?? PLANS[0];

    // Model donut segments
    const modelDonutSegments = byModel.map((m, i) => {
        const shortName = m.model.replace("claude-", "").replace(/-\d.*/, "");
        return { label: shortName || m.model, value: m.total, color: MODEL_COLORS_CHART[i % MODEL_COLORS_CHART.length] };
    });

    // Chart data
    const CHART_ROWS = Math.max(Math.min(byProject.length, 8), Math.min(filtered.length, 8));

    return (
        <>
            {/* Time filter + Plan selector */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                {(["today", "7d", "30d", "all"] as const).map(p => (
                    <button key={p} onClick={() => { setPeriod(p); setPage(0); }}
                        className="px-3 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                        style={{
                            background: period === p ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.03)",
                            border: period === p ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.06)",
                            color: period === p ? "#f97316" : "rgba(255,255,255,0.35)",
                        }}>
                        {p === "today" ? "Today" : p === "7d" ? "7d" : p === "30d" ? "30d" : "All"}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-1">
                    {PLANS.map(p => (
                        <button key={p.key} onClick={() => setPlan(p.key)}
                            className="px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer"
                            style={{
                                background: plan === p.key ? "rgba(249,115,22,0.15)" : "transparent",
                                border: plan === p.key ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(255,255,255,0.06)",
                                color: plan === p.key ? "#f97316" : "rgba(255,255,255,0.25)",
                            }}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI stat cards - 7 columns like Nate's */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
                <StatCard label="SESSIONS" value={fmtNum(filtered.length)} sub={period === "all" ? "all time" : period === "today" ? "today" : `last ${period}`} />
                <StatCard label="TURNS" value={fmtNum(filteredTurns)} sub={period === "all" ? "all time" : `last ${period}`} />
                <StatCard label="INPUT" value={fmtNum(totalIn)} color="#4A9EFF" />
                <StatCard label="OUTPUT" value={fmtNum(totalOut)} color="#7C5CFF" />
                <StatCard label="CACHE READ" value={fmtNum(totalCacheRead)} color="#3FB68B" />
                <StatCard label="CACHE CREATE" value={fmtNum(totalCacheCreate)} color="#E8A23B" />
                <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl p-3">
                    <div className="text-[9px] font-bold text-white/30 uppercase tracking-wider mb-1">EST. COST</div>
                    <div className="text-xl font-bold" style={{ color: "#4ade80" }}>{fmtCost(totalCost)}</div>
                    {currentPlan.monthly > 0 && (
                        <div className="text-[9px] text-white/25 mt-0.5">pay ${currentPlan.monthly}/mo on {currentPlan.label}</div>
                    )}
                </div>
            </div>

            {/* Glossary */}
            <div className="mb-4 bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden">
                <button onClick={() => setGlossaryOpen(!glossaryOpen)}
                    className="w-full px-4 py-2.5 flex items-center gap-2 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{ background: "none", border: "none", color: "white" }}>
                    <span className="text-[11px] font-bold text-white/70">What do these numbers mean?</span>
                    <span className="text-[10px] text-white/20">- click to {glossaryOpen ? "collapse" : "expand"}</span>
                </button>
                {glossaryOpen && (
                    <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 border-t border-white/[0.05] pt-3">
                        {[
                            ["Session", "One run of Claude Code (from start to exit). Each session is a single .jsonl file."],
                            ["Turn", "One message you sent to Claude. Each turn triggers a response (possibly with tool calls)."],
                            ["Input tokens", "The new text you (and tool results) sent to Claude this turn. Billed at the full input rate."],
                            ["Output tokens", "The text Claude wrote back. Usually the biggest cost driver per turn."],
                            ["Cache read", "Tokens Claude re-used from cache (CLAUDE.md, previously-read files). ~10x cheaper than fresh input. High numbers = good."],
                            ["Cache create", "Writing something into the cache for the first time. One-time cost; pays off on the next turn."],
                        ].map(([term, desc]) => (
                            <div key={term} className="flex gap-2">
                                <span className="text-[10px] font-bold text-white/50 shrink-0 w-20">{term}</span>
                                <span className="text-[10px] text-white/30">{desc}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Daily charts - 2 columns */}
            {filteredDaily.length > 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    {/* Daily billable tokens */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Your daily work</h3>
                        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>
                            Tokens you paid for: what you sent (<b style={{ color: TOKEN_COLORS.input }}>input</b>), what Claude wrote (<b style={{ color: TOKEN_COLORS.output }}>output</b>), and what got stored for re-use (<b style={{ color: TOKEN_COLORS.cache_creation }}>cache create</b>).
                        </p>
                        <StackedBarChart
                            data={filteredDaily.map(d => ({ label: d.day, values: [d.input, d.output, d.cache_creation] }))}
                            keys={["input", "output", "cache_creation"]}
                            colors={[TOKEN_COLORS.input, TOKEN_COLORS.output, TOKEN_COLORS.cache_creation]}
                            labels={["input", "output", "cache create"]}
                        />
                    </div>
                    {/* Daily cache reads */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Daily cache reads</h3>
                        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>
                            <b style={{ color: TOKEN_COLORS.cache_read }}>Cache reads</b> are cheap re-uses of things Claude already saw (like your CLAUDE.md). They cost ~10x less than regular input tokens - high numbers here are a good thing.
                        </p>
                        <StackedBarChart
                            data={filteredDaily.map(d => ({ label: d.day, values: [d.cache_read] }))}
                            keys={["cache_read"]}
                            colors={[TOKEN_COLORS.cache_read]}
                            labels={["cache read"]}
                        />
                    </div>
                </div>
            )}

            {/* 3 breakdown panels - model donut, tokens by project, top tools */}
            {filtered.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                    {/* Token usage by model - donut */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Token Usage by Model</h3>
                        <DonutChart segments={modelDonutSegments} />
                    </div>
                    {/* Tokens by project */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Tokens by Project</h3>
                        <HBarChart items={byProject.slice(0, 8).map(p => ({ label: p.project, value: p.total }))} color="#4A9EFF" />
                    </div>
                    {/* Top tools */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Top Tools (by call count)</h3>
                        {topTools.length > 0 ? (
                            <HBarChart items={topTools.slice(0, 8).map(t => ({ label: t.tool, value: t.calls }))} color="#7C5CFF" />
                        ) : (
                            <div className="text-white/20 text-xs py-8 text-center">Loading...</div>
                        )}
                    </div>
                </div>
            )}

            {/* Cost by Model table */}
            {byModel.length > 0 && (
                <section className="mb-4">
                    <SectionHeader icon={CpuChipIcon} title="Cost by Model" />
                    <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-x-auto">
                        <div className="grid grid-cols-[1fr_60px_80px_80px_80px_80px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.06] text-[9px] font-bold text-white/30 uppercase tracking-wider">
                            <span>Model</span><span className="text-right">Sessions</span><span className="text-right">Input</span><span className="text-right">Output</span><span className="text-right">Cache Read</span><span className="text-right">Cache Create</span><span className="text-right">Cost</span>
                        </div>
                        {byModel.map(m => (
                            <div key={m.model} className="grid grid-cols-[1fr_60px_80px_80px_80px_80px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors items-center">
                                <span className="text-[10px] font-bold" style={{ color: m.model.includes("opus") ? "#f97316" : m.model.includes("haiku") ? "#3FB68B" : "#4A9EFF" }}>
                                    {m.model.replace("claude-", "").replace(/-\d.*/, "") || m.model}
                                </span>
                                <span className="text-[9px] text-white/40 text-right font-mono">{m.count}</span>
                                <span className="text-[9px] text-white/40 text-right font-mono">{fmtNum(m.input)}</span>
                                <span className="text-[9px] text-white/40 text-right font-mono">{fmtNum(m.output)}</span>
                                <span className="text-[9px] text-white/40 text-right font-mono">{fmtNum(m.cache_read)}</span>
                                <span className="text-[9px] text-white/40 text-right font-mono">{fmtNum(m.cache_creation)}</span>
                                <span className="text-[10px] font-mono text-right" style={{ color: "#4ade80" }}>{fmtCost(m.cost)}</span>
                            </div>
                        ))}
                        <div className="grid grid-cols-[1fr_60px_80px_80px_80px_80px_70px] gap-1 px-3 py-2 border-t border-white/[0.06] items-center">
                            <span className="text-[10px] font-bold text-white/50">Total</span>
                            <span className="text-[9px] text-white/50 text-right font-mono font-bold">{filtered.length}</span>
                            <span className="text-[9px] text-white/50 text-right font-mono font-bold">{fmtNum(totalIn)}</span>
                            <span className="text-[9px] text-white/50 text-right font-mono font-bold">{fmtNum(totalOut)}</span>
                            <span className="text-[9px] text-white/50 text-right font-mono font-bold">{fmtNum(totalCacheRead)}</span>
                            <span className="text-[9px] text-white/50 text-right font-mono font-bold">{fmtNum(totalCacheCreate)}</span>
                            <span className="text-[10px] font-mono text-right font-bold" style={{ color: "#4ade80" }}>{fmtCost(totalCost)}</span>
                        </div>
                    </div>
                </section>
            )}

            {/* Cost by Project table */}
            {byProject.length > 0 && (
                <section className="mb-4">
                    <SectionHeader icon={FolderIcon} title="Cost by Project" />
                    <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-x-auto">
                        <div className="grid grid-cols-[1fr_60px_80px_80px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.06] text-[9px] font-bold text-white/30 uppercase tracking-wider">
                            <span>Project</span><span className="text-right">Sessions</span><span className="text-right">Tokens</span><span className="text-right">Share</span><span className="text-right">Cost</span>
                        </div>
                        {byProject.slice(0, 20).map((p, i) => {
                            const totalTokens = byProject.reduce((s, x) => s + x.total, 0);
                            const share = totalTokens > 0 ? (p.total / totalTokens) * 100 : 0;
                            return (
                                <div key={p.project} className="grid grid-cols-[1fr_60px_80px_80px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors items-center">
                                    <span className="text-[10px] text-white/70 truncate">{p.project}</span>
                                    <span className="text-[9px] text-white/40 text-right font-mono">{p.count}</span>
                                    <span className="text-[9px] text-white/40 text-right font-mono">{fmtNum(p.total)}</span>
                                    <span className="text-[9px] text-white/30 text-right">{share.toFixed(1)}%</span>
                                    <span className="text-[10px] font-mono text-right" style={{ color: "#4ade80" }}>{fmtCost(p.cost)}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Session detail table */}
            <section>
                <SectionHeader icon={ArchiveBoxIcon} title={`Session Details (${sorted.length})`} />
                <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_90px_70px_80px_100px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.06] text-[9px] font-bold text-white/30 uppercase tracking-wider">
                        <span>Project</span><span>Session</span><span>Machine</span><span>Model</span><span className="text-right">In / Out / Cache</span><span className="text-right">Cost</span>
                    </div>
                    {pageItems.map(t => {
                        const proj = t.project?.split("/").pop() ?? "unknown";
                        const mColor = MACHINE_COLORS[t.machine ?? ""] ?? "#6b7280";
                        return (
                            <div key={t.session_id} className="grid grid-cols-[1fr_90px_70px_80px_100px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors items-center">
                                <span className="text-[10px] text-white/70 truncate">{proj}</span>
                                <span className="text-[9px] text-white/25 font-mono truncate">{t.session_id.slice(0, 8)}</span>
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded w-fit" style={{ background: hexToRgba(mColor, 0.15), color: mColor }}>{t.machine ?? "-"}</span>
                                <span className="text-[9px] text-white/40 truncate">{t.model ?? "-"}</span>
                                <span className="text-[9px] text-white/40 font-mono text-right">{fmtNum(t.input_tokens)}/{fmtNum(t.output_tokens)}/{fmtNum(t.cache_read_tokens)}</span>
                                <span className="text-[10px] font-mono text-amber-400 text-right">{fmtCost(calcCost(t))}</span>
                            </div>
                        );
                    })}
                    {pageItems.length === 0 && (
                        <div className="px-3 py-8 text-center text-white/30 text-sm">No token data available.</div>
                    )}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.06]">
                            <span className="text-[10px] text-white/30">Page {page + 1} of {totalPages}</span>
                            <div className="flex gap-1">
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                    className="p-1 rounded hover:bg-white/5 disabled:opacity-20 transition-colors cursor-pointer">
                                    <ChevronLeftIcon className="w-3 h-3 text-white/50" />
                                </button>
                                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                                    className="p-1 rounded hover:bg-white/5 disabled:opacity-20 transition-colors cursor-pointer">
                                    <ChevronRightIcon className="w-3 h-3 text-white/50" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
