"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import type { ChartOptions, ScriptableContext } from "chart.js";
import { Search, Layers, FileText, PieChart, DatabaseZap, MessageSquare, Target, Timer, Brain, type LucideIcon } from "lucide-react";
import { cardShell } from "@/lib/ui-tokens";
import type { RagChartsPayload } from "@/lib/rag-charts";
import { useMachine } from "./MachineContext";
import { safeFetch } from "./shared";
import { TOOLTIP } from "./overview/chartjs";

const MS = 900;
const EASE = "easeOutQuart" as const;
const GRID = "rgba(255,255,255,0.06)";
const TICK = "rgba(255,255,255,0.45)";
const PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
const MUTED = { fontSize: 11, color: "rgba(255,255,255,0.5)" };

const ticks = { color: TICK, font: { size: 10 } };
const xAxis = { grid: { color: GRID }, ticks: { ...ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, border: { display: false } };
const yAxis = { beginAtZero: true, grid: { color: GRID }, ticks: { ...ticks, precision: 0 }, border: { display: false } };
const anim = { duration: MS, easing: EASE };

// Vertical gradient fill from the chart area, falls back to a flat tint before first layout.
const gradient = (color: string, top = "66", bottom = "00") => (ctx: ScriptableContext<"line">) => {
    const { chart } = ctx;
    const a = chart.chartArea;
    if (!a) return `${color}33`;
    const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, color + top);
    g.addColorStop(1, color + bottom);
    return g;
};

// Lines grow up from the zero baseline.
const lineAnim: ChartOptions<"line">["animations"] = {
    y: { duration: MS, easing: EASE, from: (ctx) => ctx.chart.scales.y?.getPixelForValue(0) ?? 0 },
};

const lineBase: ChartOptions<"line"> = {
    responsive: true, maintainAspectRatio: false, animation: anim, animations: lineAnim,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
    scales: { x: xAxis, y: yAxis },
};

function ChartCard({ icon: Icon, color, title, subtitle, className = "", children }: {
    icon: LucideIcon; color: string; title: string; subtitle: string; className?: string; children: ReactNode;
}) {
    return (
        <div className={className} style={cardShell}>
            <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                <div className="flex items-center justify-center shrink-0 rounded-lg" style={{ width: 32, height: 32, background: `${color}33` }}>
                    <Icon size={16} style={{ color }} />
                </div>
                <div className="min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{title}</div>
                    <div style={{ ...MUTED, marginTop: 2 }}>{subtitle}</div>
                </div>
            </div>
            {children}
        </div>
    );
}

function Chips({ items }: { items: { label: string; color: string }[] }) {
    return (
        <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
            {items.map(i => (
                <span key={i.label} className="flex items-center gap-1.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: i.color }} />{i.label}
                </span>
            ))}
        </div>
    );
}

function DonutLegend({ items, total }: { items: { label: string; value: number; color: string }[]; total: number }) {
    return (
        <div className="flex flex-col justify-center gap-2 min-w-0" style={{ flex: 1 }}>
            {items.map(i => (
                <div key={i.label} className="flex items-center gap-2" style={{ fontSize: 11 }}>
                    <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 999, background: i.color }} />
                    <span className="truncate" style={{ color: "rgba(255,255,255,0.75)", flex: 1 }}>{i.label}</span>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>{total > 0 ? Math.round((i.value / total) * 100) : 0}%</span>
                </div>
            ))}
        </div>
    );
}

const donutOptions: ChartOptions<"doughnut"> = {
    responsive: true, maintainAspectRatio: false, cutout: "70%",
    animation: { ...anim, animateRotate: true, animateScale: true },
    plugins: { legend: { display: false }, tooltip: TOOLTIP },
};

function Donut({ items, center, centerLabel, height = 240 }: {
    items: { label: string; value: number; color: string }[]; center: string; centerLabel: string; height?: number;
}) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const empty = total === 0;
    return (
        <div className="flex items-center gap-4" style={{ height }}>
            <div className="relative shrink-0" style={{ width: Math.min(height, 200), height: Math.min(height, 200) }}>
                <Doughnut
                    options={donutOptions}
                    data={{
                        labels: empty ? ["None"] : items.map(i => i.label),
                        datasets: [{ data: empty ? [1] : items.map(i => i.value), backgroundColor: empty ? ["rgba(255,255,255,0.06)"] : items.map(i => i.color), borderWidth: 0, borderRadius: 4, spacing: 2 }],
                    }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{center}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{centerLabel}</span>
                </div>
            </div>
            <DonutLegend items={items} total={total} />
        </div>
    );
}

// Horizontal bars, one palette colour each, growing from 0.
function HBar({ labels, values, tooltip }: { labels: string[]; values: number[]; tooltip?: (i: number) => string }) {
    return (
        <div style={{ height: 240 }}>
            <Bar
                data={{ labels, datasets: [{ data: values, backgroundColor: values.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 6, borderSkipped: false, barThickness: 18 }] }}
                options={{
                    indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: anim,
                    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, callbacks: { label: c => tooltip?.(c.dataIndex) ?? String(c.parsed.x) } } },
                    scales: { x: yAxis, y: { grid: { display: false }, ticks: { ...ticks, callback(v) { const l = String(this.getLabelForValue(Number(v))); return l.length > 28 ? `${l.slice(0, 27)}...` : l; } }, border: { display: false } } },
                }}
            />
        </div>
    );
}

const Empty = ({ children }: { children: ReactNode }) => (
    <div className="flex items-center justify-center" style={{ height: 240, ...MUTED }}>{children}</div>
);

export default function RagCharts({ days }: { days: number }) {
    const { apiBase } = useMachine();
    const url = `${apiBase("/api/rag/charts")}?days=${days}`;
    const q = useQuery<RagChartsPayload | null>({
        queryKey: ["rag-charts", url],
        queryFn: () => safeFetch<RagChartsPayload | null>(url, null),
        refetchInterval: 60_000,
    });
    const d = q.data ?? null;

    if (!d) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse flex items-center justify-center" style={{ ...cardShell, height: 320, ...MUTED }}>{q.isPending ? "Loading" : "No chart data"}</div>
                ))}
            </div>
        );
    }

    const { totals } = d;
    const hitPct = d.queries.typed.map((t, i) => (t > 0 ? Math.round((d.queries.hits[i] / t) * 100) : null));
    const overallHit = totals.typed > 0 ? Math.round((totals.hits / totals.typed) * 100) : 0;
    const srcItems = d.sources.map((s, i) => ({ label: s.type, value: s.count, color: PALETTE[i % PALETTE.length] }));
    const prefItems = d.prefCategories.map((s, i) => ({ label: s.category, value: s.count, color: PALETTE[i % PALETTE.length] }));
    const sum = (a: { value: number }[]) => a.reduce((s, x) => s + x.value, 0);
    const line = (color: string, data: number[], label: string, extra = {}) => ({
        label, data, borderColor: color, backgroundColor: gradient(color), fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, ...extra,
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard icon={Search} color="#8b5cf6" title="Query Volume" subtitle="Searches per bucket">
                <Chips items={[{ label: "Typed", color: "#8b5cf6" }, { label: "Auto", color: "#9ca3af" }]} />
                <div style={{ height: 240 }}>
                    <Line options={lineBase} data={{ labels: d.labels, datasets: [
                        line("#8b5cf6", d.queries.typed, "Typed"),
                        { label: "Auto", data: d.queries.auto, borderColor: "#9ca3af", borderDash: [5, 4], borderWidth: 1.5, tension: 0.4, pointRadius: 0, pointHoverRadius: 3, fill: false },
                    ] }} />
                </div>
            </ChartCard>

            <ChartCard icon={Layers} color="#10b981" title="Context Loaded" subtitle="Context injections and average size">
                <Chips items={[{ label: "Injections", color: "#10b981" }, { label: "Avg KB", color: "#06b6d4" }]} />
                <div style={{ height: 240 }}>
                    <Line
                        options={{ ...lineBase, scales: { x: xAxis, y: yAxis, y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks, border: { display: false } } } }}
                        data={{ labels: d.labels, datasets: [
                            line("#10b981", d.contexts.count, "Injections"),
                            { label: "Avg KB", data: d.contexts.avgKb, borderColor: "#06b6d4", borderWidth: 1.5, tension: 0.4, pointRadius: 0, pointHoverRadius: 3, fill: false, yAxisID: "y1" },
                        ] }}
                    />
                </div>
            </ChartCard>

            <ChartCard icon={FileText} color="#3b82f6" title="Most Retrieved Docs" subtitle="Top documents by access count (all time)">
                {d.topDocs.length ? <HBar labels={d.topDocs.map(x => x.title)} values={d.topDocs.map(x => x.accessCount)} tooltip={i => `${d.topDocs[i].accessCount} accesses (${d.topDocs[i].sourceType})`} /> : <Empty>No retrieved documents yet</Empty>}
            </ChartCard>

            <ChartCard icon={PieChart} color="#f59e0b" title="Sources" subtitle="Documents by source type">
                <Donut items={srcItems} center={sum(srcItems).toLocaleString()} centerLabel="Documents" />
            </ChartCard>

            <ChartCard icon={DatabaseZap} color="#3b82f6" title="Ingest Volume" subtitle="Docs and chunks added">
                <Chips items={[{ label: "Docs", color: "#3b82f6" }, { label: "Chunks", color: "#8b5cf6" }]} />
                <div style={{ height: 240 }}>
                    <Bar
                        options={{ responsive: true, maintainAspectRatio: false, animation: anim, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: TOOLTIP }, scales: { x: { ...xAxis, stacked: true }, y: { ...yAxis, stacked: true } } }}
                        data={{ labels: d.labels, datasets: [
                            { label: "Docs", data: d.ingest.docs, backgroundColor: "#3b82f6", borderRadius: 4, borderSkipped: false },
                            { label: "Chunks", data: d.ingest.chunks, backgroundColor: "#8b5cf6", borderRadius: 4, borderSkipped: false },
                        ] }}
                    />
                </div>
            </ChartCard>

            <ChartCard icon={MessageSquare} color="#ec4899" title="Top Queries" subtitle="Most common typed searches">
                {d.topQueries.length ? <HBar labels={d.topQueries.map(x => x.query)} values={d.topQueries.map(x => x.count)} tooltip={i => `${d.topQueries[i].count} searches, ${d.topQueries[i].hits} with results`} /> : <Empty>No typed searches in this window</Empty>}
            </ChartCard>

            <ChartCard className="lg:col-span-2" icon={Target} color="#22c55e" title="Query Hit Rate" subtitle="Typed searches that returned results">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="min-w-0" style={{ height: 200, flex: 2 }}>
                        <Line
                            options={{ ...lineBase, plugins: { ...lineBase.plugins, tooltip: { ...TOOLTIP, callbacks: { label: c => `${c.parsed.y}% hit` } } }, scales: { x: xAxis, y: { ...yAxis, min: 0, max: 100, ticks: { ...ticks, callback: v => `${v}%` } } } }}
                            data={{ labels: d.labels, datasets: [line("#22c55e", hitPct as number[], "Hit %", { spanGaps: true })] }}
                        />
                    </div>
                    <div className="min-w-0" style={{ flex: 1 }}>
                        <Donut height={200} center={`${overallHit}%`} centerLabel="Hit rate"
                            items={[{ label: `Hits (${totals.hits})`, value: totals.hits, color: "#22c55e" }, { label: `Misses (${totals.typed - totals.hits})`, value: totals.typed - totals.hits, color: "#ef4444" }]} />
                        {totals.typed === 0 && <div style={{ ...MUTED, marginTop: 8 }}>No typed searches in this window</div>}
                    </div>
                </div>
            </ChartCard>

            <ChartCard icon={Timer} color="#06b6d4" title="Eval Latency" subtitle="Average latency by config (all time)">
                {d.evalByConfig.length ? (
                    <div style={{ height: 240 }}>
                        <Bar
                            data={{ labels: d.evalByConfig.map(e => e.config), datasets: [{ data: d.evalByConfig.map(e => e.latencyMs), backgroundColor: d.evalByConfig.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 6, borderSkipped: false }] }}
                            options={{ responsive: true, maintainAspectRatio: false, animation: anim, plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, callbacks: { label: c => { const e = d.evalByConfig[c.dataIndex]; return `${Math.round(e.latencyMs)} ms, score ${e.score}, ${e.runs} runs`; } } } }, scales: { x: { ...xAxis, grid: { display: false } }, y: { ...yAxis, ticks: { ...ticks, callback: v => `${v}ms` } } } }}
                        />
                    </div>
                ) : <Empty>No eval runs yet</Empty>}
            </ChartCard>

            <ChartCard icon={Brain} color="#a855f7" title="Preference Categories" subtitle="What the RAG has learned">
                <Donut items={prefItems} center={sum(prefItems).toLocaleString()} centerLabel="Preferences" />
            </ChartCard>
        </div>
    );
}
