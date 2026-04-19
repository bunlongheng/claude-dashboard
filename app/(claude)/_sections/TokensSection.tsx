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

const PAGE_SIZE = 20;

export default function TokensSection({ initialTokens }: { initialTokens: Token[] }) {
    const [tokens] = useState<Token[]>(initialTokens);
    const { machine } = useMachine();
    const [page, setPage] = useState(0);
    const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("today");
    const [sessionDates, setSessionDates] = useState<Map<string, number>>(new Map());

    // Fetch session dates for time filtering
    useEffect(() => {
        fetch("/api/claude/sessions").then(r => r.json()).then(d => {
            const dates = new Map<string, number>();
            for (const p of d.projects ?? []) {
                for (const s of p.sessions ?? []) {
                    dates.set(s.id, new Date(s.updatedAt).getTime());
                }
            }
            setSessionDates(dates);
        }).catch(() => {});
    }, []);

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

    // Aggregates
    const totalIn = useMemo(() => filtered.reduce((s, t) => s + t.input_tokens, 0), [filtered]);
    const totalOut = useMemo(() => filtered.reduce((s, t) => s + t.output_tokens, 0), [filtered]);
    const totalCacheRead = useMemo(() => filtered.reduce((s, t) => s + t.cache_read_tokens, 0), [filtered]);
    const totalCacheCreate = useMemo(() => filtered.reduce((s, t) => s + t.cache_creation_tokens, 0), [filtered]);
    const totalAll = totalIn + totalOut + totalCacheRead + totalCacheCreate;
    const totalCost = useMemo(() => filtered.reduce((s, t) => s + calcCost(t), 0), [filtered]);

    // Cost breakdown
    const costIn = (totalIn / 1_000_000) * PRICE.input;
    const costOut = (totalOut / 1_000_000) * PRICE.output;
    const costCacheRead = (totalCacheRead / 1_000_000) * PRICE.cache_read;
    const costCacheCreate = (totalCacheCreate / 1_000_000) * PRICE.cache_creation;

    const costSegments = [
        { label: "Input", value: costIn, color: "#3b82f6" },
        { label: "Output", value: costOut, color: "#f97316" },
        { label: "Cache Read", value: costCacheRead, color: "#22c55e" },
        { label: "Cache Created", value: costCacheCreate, color: "#a855f7" },
    ];

    // Per-model breakdown
    const byModel = useMemo(() => {
        const m = groupBy(filtered, t => t.model ?? "unknown");
        return [...m.entries()]
            .map(([model, rows]) => ({
                model,
                total: rows.reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
                cost: rows.reduce((s, t) => s + calcCost(t), 0),
                count: rows.length,
            }))
            .sort((a, b) => b.total - a.total);
    }, [filtered]);
    const maxModelTokens = byModel[0]?.total ?? 1;

    // Per-machine breakdown
    const byMachine = useMemo(() => {
        const m = groupBy(filtered, t => t.machine ?? "Unknown");
        return [...m.entries()]
            .map(([mac, rows]) => ({
                machine: mac,
                total: rows.reduce((s, t) => s + t.input_tokens + t.output_tokens, 0),
                cost: rows.reduce((s, t) => s + calcCost(t), 0),
                count: rows.length,
            }))
            .sort((a, b) => b.total - a.total);
    }, [filtered]);
    const maxMachineTokens = byMachine[0]?.total ?? 1;

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
    const maxProjectTokens = byProject[0]?.total ?? 1;

    // Paginated session table
    const sorted = useMemo(() => [...filtered].sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)), [filtered]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Reset page when filter changes
    useEffect(() => { setPage(0); }, [machine]);

    // Chart data
    const topSessions = useMemo(() =>
        [...filtered].sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)).slice(0, 8),
    [filtered]);
    const maxSessionTokens = topSessions[0] ? topSessions[0].input_tokens + topSessions[0].output_tokens : 1;

    return (
        <>
            {/* Time filter */}
            <div className="flex items-center gap-2 mb-4">
                {(["today", "7d", "30d", "all"] as const).map(p => (
                    <button key={p} onClick={() => { setPeriod(p); setPage(0); }}
                        className="px-3 py-1 rounded-full text-[10px] font-bold transition"
                        style={{
                            background: period === p ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.03)",
                            border: period === p ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.06)",
                            color: period === p ? "#f97316" : "rgba(255,255,255,0.35)",
                            cursor: "pointer",
                        }}>
                        {p === "today" ? "Today" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
                    </button>
                ))}
                <span className="text-[10px] text-white/20 ml-auto">{filtered.length} sessions</span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                <StatCard label="TOTAL TOKENS" value={fmtNum(totalAll)} sub={`${filtered.length} sessions`} />
                <StatCard label="TOTAL COST" value={fmtCost(totalCost)} color="#f59e0b" />
                <StatCard label="INPUT" value={fmtNum(totalIn)} color="#3b82f6" sub={fmtCost(costIn)} />
                <StatCard label="OUTPUT" value={fmtNum(totalOut)} color="#f97316" sub={fmtCost(costOut)} />
                <StatCard label="CACHE READ" value={fmtNum(totalCacheRead)} color="#22c55e" sub={fmtCost(costCacheRead)} />
                <StatCard label="CACHE CREATED" value={fmtNum(totalCacheCreate)} color="#a855f7" sub={fmtCost(costCacheCreate)} />
            </div>

            {/* 3 charts */}
            {filtered.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f59e0b", marginBottom: 14 }}>Top Sessions by Tokens</h3>
                        <div className="space-y-2">
                            {topSessions.map((t, i) => {
                                const total = t.input_tokens + t.output_tokens;
                                const pct = Math.min((total / maxSessionTokens) * 100, 100);
                                const name = t.project?.split("/").pop() || "unknown";
                                return (
                                    <a key={t.session_id} href={`/${t.session_id}`} target="_blank" rel="noopener noreferrer"
                                        className="block rounded-lg px-2 py-1 -mx-2 transition hover:bg-white/[0.03] cursor-pointer">
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{name}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>{fmtNum(total)}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: "#f59e0b", transition: "width 0.8s", transitionDelay: `${i * 0.05}s` }} />
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#22c55e", marginBottom: 14 }}>Sessions per App</h3>
                        <div className="space-y-2">
                            {byProject.slice(0, 8).map((p, i) => {
                                const maxCount = byProject[0]?.count ?? 1;
                                const pct = Math.min((p.count / maxCount) * 100, 100);
                                const colors = ["#22c55e", "#06b6d4", "#f97316", "#8b5cf6", "#f472b6", "#eab308", "#a3e635", "#10b981"];
                                return (
                                    <div key={p.project}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{p.project}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: colors[i % colors.length] }}>{p.count}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: colors[i % colors.length], transition: "width 0.8s", transitionDelay: `${i * 0.05}s` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>Cost by App</h3>
                        <div className="space-y-2">
                            {byProject.slice(0, 8).map((p, i) => {
                                const maxCost = byProject[0]?.cost ?? 1;
                                const pct = Math.min((p.cost / maxCost) * 100, 100);
                                return (
                                    <div key={p.project + "-cost"}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{p.project}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>{fmtCost(p.cost)}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: "#f97316", transition: "width 0.8s", transitionDelay: `${i * 0.05}s` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#f97316" }}>Total: {fmtCost(totalCost)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Cost breakdown bar */}
            <section className="mb-4">
                <SectionHeader icon={CurrencyDollarIcon} title="Cost Breakdown" />
                <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl p-3">
                    <div className="flex h-5 rounded-md overflow-hidden mb-2">
                        {costSegments.map(seg => {
                            const pct = totalCost > 0 ? (seg.value / totalCost) * 100 : 0;
                            if (pct < 0.5) return null;
                            return (
                                <div key={seg.label} style={{ width: `${pct}%`, background: `${seg.color}50`, minWidth: 2 }}
                                    title={`${seg.label}: ${fmtCost(seg.value)} (${pct.toFixed(1)}%)`} />
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {costSegments.map(seg => (
                            <div key={seg.label} className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm" style={{ background: seg.color }} />
                                <span className="text-[10px] text-white/40">{seg.label}</span>
                                <span className="text-[10px] font-bold text-white/60">{fmtCost(seg.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Per-model breakdown */}
            <section className="mb-4">
                <SectionHeader icon={CpuChipIcon} title={`Per-Model Breakdown (${byModel.length})`} />
                <div className="space-y-1">
                    {byModel.map(({ model, total, cost, count }) => (
                        <div key={model} className="bg-[#0f1117] border border-white/[0.08] rounded-xl px-3 py-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold text-white truncate">{model}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-white/40">{count} sessions</span>
                                    <span className="text-[10px] font-mono text-amber-400">{fmtCost(cost)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${(total / maxModelTokens) * 100}%`, background: `${ACCENT}40` }} />
                                </div>
                                <span className="text-[9px] text-white/30 font-mono w-14 text-right">{fmtNum(total)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Per-machine breakdown */}
            <section className="mb-4">
                <SectionHeader icon={ServerIcon} title="Machine" />
                <div className="space-y-1">
                    {byMachine.map(({ machine: mac, total, cost, count }) => {
                        const color = MACHINE_COLORS[mac] ?? "#6b7280";
                        return (
                            <div key={mac} className="bg-[#0f1117] border border-white/[0.08] rounded-xl px-3 py-2">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <ServerIcon className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.5)" }} />
                                        <span className="text-[11px] font-semibold text-white/70">{mac}</span>
                                        <span className="text-[10px] text-white/40">{count} sessions</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-amber-400">{fmtCost(cost)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${(total / maxMachineTokens) * 100}%`, background: hexToRgba(color, 0.35) }} />
                                    </div>
                                    <span className="text-[9px] text-white/30 font-mono w-14 text-right">{fmtNum(total)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Per-project breakdown */}
            <section className="mb-4">
                <SectionHeader icon={FolderIcon} title="Projects" />
                <div className="space-y-1">
                    {byProject.map(({ project, total, cost, count }) => (
                        <div key={project} className="bg-[#0f1117] border border-white/[0.08] rounded-xl px-3 py-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold text-white truncate">{project}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-white/40">{count} sessions</span>
                                    <span className="text-[10px] font-mono text-amber-400">{fmtCost(cost)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${(total / maxProjectTokens) * 100}%`, background: "rgba(255,136,0,0.35)" }} />
                                </div>
                                <span className="text-[9px] text-white/30 font-mono w-14 text-right">{fmtNum(total)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Session detail table */}
            <section>
                <SectionHeader icon={ArchiveBoxIcon} title={`Session Details (${sorted.length})`} />
                <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_90px_70px_80px_100px_70px] gap-1 px-3 py-1.5 border-b border-white/[0.06] text-[9px] font-bold text-white/30 uppercase tracking-wider">
                        <span>Project</span>
                        <span>Session</span>
                        <span>Machine</span>
                        <span>Model</span>
                        <span className="text-right">In / Out / Cache</span>
                        <span className="text-right">Cost</span>
                    </div>
                    {/* Rows */}
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
                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.06]">
                            <span className="text-[10px] text-white/30">Page {page + 1} of {totalPages}</span>
                            <div className="flex gap-1">
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                    className="p-1 rounded hover:bg-white/5 disabled:opacity-20 transition-colors">
                                    <ChevronLeftIcon className="w-3 h-3 text-white/50" />
                                </button>
                                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                                    className="p-1 rounded hover:bg-white/5 disabled:opacity-20 transition-colors">
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
