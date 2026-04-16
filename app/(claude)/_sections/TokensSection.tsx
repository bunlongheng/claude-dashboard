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

    // Filtered data
    const filtered = useMemo(
        () => machine ? tokens.filter(t => t.machine === machine) : tokens,
        [tokens, machine]
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

    return (
        <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                <StatCard label="TOTAL TOKENS" value={fmtNum(totalAll)} sub={`${filtered.length} sessions`} />
                <StatCard label="TOTAL COST" value={fmtCost(totalCost)} color="#f59e0b" />
                <StatCard label="INPUT" value={fmtNum(totalIn)} color="#3b82f6" sub={fmtCost(costIn)} />
                <StatCard label="OUTPUT" value={fmtNum(totalOut)} color="#f97316" sub={fmtCost(costOut)} />
                <StatCard label="CACHE READ" value={fmtNum(totalCacheRead)} color="#22c55e" sub={fmtCost(costCacheRead)} />
                <StatCard label="CACHE CREATED" value={fmtNum(totalCacheCreate)} color="#a855f7" sub={fmtCost(costCacheCreate)} />
            </div>

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
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded w-fit" style={{ background: hexToRgba(mColor, 0.15), color: mColor }}>{t.machine ?? "—"}</span>
                                <span className="text-[9px] text-white/40 truncate">{t.model ?? "—"}</span>
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
