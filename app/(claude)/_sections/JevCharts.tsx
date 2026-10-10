"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, MessageSquare, Route, Timer, Coins, DollarSign, AlertTriangle, Power, BarChart3, type LucideIcon } from "lucide-react";
import {
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Line, LabelList,
} from "recharts";
import { Line as CostLine } from "react-chartjs-2";
import type { Chart as ChartJsChart, ChartOptions } from "chart.js";
import "./overview/chartjs";
import { TOOLTIP as CHARTJS_TOOLTIP } from "./overview/chartjs";
import { PolarChart } from "./overview/PolarChart";
import { BigStat } from "./McpLogPanel";
import { cardShell } from "@/lib/ui-tokens";
import { fmtNum, timeAgo, WindowBadge, type Window4 } from "./shared";
import AppIcon from "./AppIcon";
import { AGENT_CHARS } from "./agents/lib";
import type { JevAggregate, JevDecision, JevOutcome, JevSession } from "@/lib/jev-log";
import { TIER_ORDER, TIER_COLORS, HEALTH_STYLE, JEV_DAYS } from "@/lib/jev-palette";
import { formatUsd } from "@/lib/format";

const STATUS_COLORS = {
    routed: "#22C55E",
    skipped: "#6B7280",
    error: "#EF4444",
};

const TOOLTIP = {
    contentStyle: { background: "#14151a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 },
    itemStyle: { color: "#fff" },
    labelStyle: { color: "rgba(255,255,255,0.5)" },
};

const AXIS_TICK = { fill: "rgba(255,255,255,0.3)", fontSize: 9 };

// Recharts measures against a real DOM, so the charts only render client-side.
// The value never changes after mount, so subscribe is a no-op.
function subscribeMounted() { return () => {}; }
function getMounted() { return true; }
function getMountedServer() { return false; }

// Keeps the clock read out of a component body so react-hooks/purity stays
// quiet. Local, not UTC - the daily buckets key off the hook's local timestamp,
// so an ISO/UTC day would point at tomorrow all evening.
function todayKey(): string { return new Date().toLocaleDateString("en-CA"); }

function CardLabel({ title, sub }: { title: string; sub: string }) {
    return (
        <>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>{sub}</div>
        </>
    );
}

function Pill({ text, color, dim = false, icon }: { text: string; color: string; dim?: boolean; icon?: ReactNode }) {
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap",
            background: dim ? "rgba(255,255,255,0.05)" : `${color}1F`,
            color: dim ? "rgba(255,255,255,0.45)" : color,
            border: `1px solid ${dim ? "rgba(255,255,255,0.08)" : `${color}33`}`,
        }}>{icon}{text}</span>
    );
}

function TierPill({ tier }: { tier: string }) {
    const color = TIER_COLORS[tier] ?? "#6B7280";
    return <Pill text={tier} color={color} icon={<TierMark tier={tier} color={color} />} />;
}

function fmtTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// "2026-09-24T14" reads as "Wed 2 PM". The bucket key is already local, so it
// is split by hand rather than parsed - Date would re-apply an offset to it.
function fmtHourLabel(hour: string): string {
    const day = new Date(`${hour.slice(0, 10)}T00:00:00`);
    const h = Number(hour.slice(11));
    if (Number.isNaN(day.getTime()) || !Number.isFinite(h)) return hour;
    const suffix = h < 12 ? "AM" : "PM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${day.toLocaleDateString("en-US", { weekday: "short" })} ${hour12} ${suffix}`;
}

// The 4 tiers are all Claude models, so a model logo would be the same glyph on
// every row and say nothing. This says the one thing the word alone does not:
// where the tier sits on the cheap to expensive ladder, filled bars = rank.
const TIER_RANK: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3, fable: 4 };

function TierMark({ tier, color }: { tier: string; color: string }) {
    const rank = TIER_RANK[tier] ?? 0;
    return (
        <svg width="11" height="9" viewBox="0 0 11 9" aria-hidden="true" style={{ flexShrink: 0 }}>
            {[0, 1, 2, 3].map(i => (
                <rect
                    key={i}
                    x={i * 3}
                    y={9 - (i + 1) * 2 - 1}
                    width="2"
                    height={(i + 1) * 2 + 1}
                    rx="0.5"
                    fill={color}
                    opacity={i < rank ? 1 : 0.22}
                />
            ))}
        </svg>
    );
}

// Empty card body: when the switch is off it says since when, otherwise just no data.
function EmptyChart({ offSince, note }: { offSince: string | null; note: string }) {
    const Icon = offSince ? Power : BarChart3;
    return (
        <div style={{ flex: 1, minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center",
            borderRadius: 12, background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0 8px, transparent 8px 16px)", border: "1px dashed rgba(255,255,255,0.08)" }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <Icon size={20} style={{ color: "rgba(255,255,255,0.55)" }} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.85)" }}>{offSince ? "ROUTER OFF" : "NO DATA"}</span>
            {offSince && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>since <b style={{ color: "#fff" }}>{fmtTime(offSince)}</b> - {timeAgo(offSince)}</span>}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{note}</span>
        </div>
    );
}

// ── 1. Health strip ──────────────────────────────────────────────────────────
// The proof block. Everything else on the page is detail; this answers "is the
// hook running" in one glance, so it gets the size and the only moving part.
function HealthStrip({ data, win }: { data: JevAggregate; win: Window4 }) {
    const { totals, health, daily } = data;
    // Tile trends: last 24 hours on Today, per day otherwise.
    const rows: (JevAggregate["hourly"][number] | JevAggregate["daily"][number])[] = win === "today" ? data.hourly : daily;
    const calls = rows.map(r => r.routed + r.skipped + r.errors);
    const h = HEALTH_STYLE[health] ?? HEALTH_STYLE.never;
    const todayRow = daily.find(d => d.day === todayKey());
    const callsToday = todayRow ? todayRow.routed + todayRow.skipped + todayRow.errors : 0;

    // Same tile as the RAG overview: icon + label, 1 big number, 1 line under.
    const tiles: { label: string; value: string; sub: string; icon: LucideIcon; color: string; pulse?: boolean; trend?: number[] }[] = [
        { label: "Status", value: h.label, sub: health === "off" ? (data.windows[0] ? `since ${timeAgo(data.windows[0].from)}` : h.note) : totals.lastCallTs ? `${timeAgo(totals.lastCallTs)} - ${h.note}` : h.note, icon: Activity, color: h.color, pulse: health === "live" },
        { label: "Calls today", value: String(callsToday), sub: `${totals.calls} in range`, icon: MessageSquare, color: "#4A9EFF", trend: calls },
        { label: "Routed", value: `${totals.routedPct}%`, sub: `${totals.routed} of ${totals.calls}`, icon: Route, color: STATUS_COLORS.routed, trend: rows.map(r => r.routed) },
        { label: "Avg latency", value: `${totals.avgLatencyMs}ms`, sub: `p95 ${totals.p95LatencyMs}ms`, icon: Timer, color: "#E8A23B", trend: rows.map(r => r.avgLatencyMs) },
        { label: "Tokens today", value: fmtNum(todayRow?.tokens ?? 0), sub: `${fmtNum(totals.inputTokens + totals.outputTokens)} in range`, icon: Coins, color: "#A855F7", trend: rows.map(r => r.tokens) },
        { label: "Est. cost", value: formatUsd(totals.estCostUsd), sub: `${totals.sessions} sessions`, icon: DollarSign, color: "#F97316", trend: rows.map(r => r.costUsd) },
        { label: "Errors", value: String(totals.errors), sub: totals.errors > 0 ? "check the log" : "clean", icon: AlertTriangle, color: totals.errors > 0 ? STATUS_COLORS.error : STATUS_COLORS.skipped, trend: rows.map(r => r.errors) },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
            <style>{`@keyframes jevPulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.35; transform:scale(.72) } }`}</style>
            {tiles.map(t => (
                <BigStat key={t.label} label={t.label} value={t.value} sub={t.sub} icon={t.icon} color={t.color} trend={t.trend}
                    iconStyle={{ animation: t.pulse ? "jevPulse 1.8s ease-in-out infinite" : "none" }} />
            ))}
        </div>
    );
}

// ── 2. Cost over time ────────────────────────────────────────────────────────
// Zero-filled across the whole window (not just the days with rows) so a quiet
// stretch reads as flat, not missing.
function buildDayRange(startDay: string, endDay: string): string[] {
    const days: string[] = [];
    const cursor = new Date(`${startDay}T00:00:00`);
    const end = new Date(`${endDay}T00:00:00`);
    while (cursor.getTime() <= end.getTime()) {
        days.push(cursor.toLocaleDateString("en-CA"));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

const usd = (v: number) => (v >= 0.01 ? formatUsd(v) : "$" + v.toFixed(4));

function CostChart({ daily, hourly, win, offSince }: { daily: JevAggregate["daily"]; hourly: JevAggregate["hourly"]; win: Window4; offSince: string | null }) {
    const series = useMemo(() => {
        const today = todayKey();
        if (win === "today") {
            // Calendar day since local midnight, same as the Calls today tile and the Overview.
            return hourly.filter(h => h.hour.slice(0, 10) === today).map(h => ({ label: h.label, value: h.costUsd }));
        }
        const byDay = new Map(daily.map(d => [d.day, d.costUsd]));
        const start = new Date(`${today}T00:00:00`);
        start.setDate(start.getDate() - (JEV_DAYS[win] - 1));
        const startDay = start.toLocaleDateString("en-CA");
        return buildDayRange(startDay, today).map(day => ({ label: day.slice(5), value: byDay.get(day) ?? 0 }));
    }, [daily, hourly, win]);
    const totalUsd = series.reduce((sum, r) => sum + r.value, 0);

    const data = useMemo(() => ({
        labels: series.map(r => r.label),
        datasets: [{
            data: series.map(r => r.value),
            borderColor: "#F97316",
            backgroundColor: "rgba(249,115,22,0.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
        }],
    }), [series]);

    // Peak labels: a point taller than both its neighbours gets its cost drawn
    // above it, so the spikes read without hovering. Bumps under a quarter of the
    // tallest stay bare, and the tallest one is drawn in the line's own orange.
    const peakLabels = useMemo(() => ({
        id: "jevCostPeaks",
        afterDatasetsDraw(chart: ChartJsChart) {
            const vals = series.map(r => r.value);
            const max = Math.max(...vals, 0);
            if (max <= 0) return;
            const meta = chart.getDatasetMeta(0);
            const { ctx } = chart;
            ctx.save();
            ctx.font = "700 9px ui-sans-serif, system-ui, -apple-system, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            vals.forEach((v, i) => {
                const prev = i > 0 ? vals[i - 1] : -1;
                const next = i < vals.length - 1 ? vals[i + 1] : -1;
                if (v <= prev || v < next || v < max * 0.25) return;
                const pt = meta.data[i];
                if (!pt) return;
                ctx.fillStyle = v === max ? "#F97316" : "rgba(255,255,255,0.6)";
                ctx.fillText(usd(v), pt.x, pt.y - 5);
            });
            ctx.restore();
        },
    }), [series]);

    const options = useMemo<ChartOptions<"line">>(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700 },
        interaction: { mode: "index", intersect: false },
        // Headroom so the label over the tallest peak is never clipped.
        layout: { padding: { top: 16 } },
        plugins: {
            legend: { display: false },
            tooltip: { ...CHARTJS_TOOLTIP, callbacks: { label: ctx => usd(ctx.parsed.y ?? 0) } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: "rgba(255,255,255,0.4)", font: { size: 9 }, maxTicksLimit: 8 } },
            y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "rgba(255,255,255,0.4)", font: { size: 9 }, maxTicksLimit: 4, callback: v => usd(Number(v)) } },
        },
    }), []);

    const hasCalls = series.some(r => r.value > 0);

    return (
        <div style={{ ...cardShell, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <CardLabel title="Cost" sub={win === "today" ? "USD at the flat router rate, per hour" : "USD at the flat router rate, per day"} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#F97316", fontVariantNumeric: "tabular-nums" }}>{formatUsd(totalUsd)}</span>
                    <WindowBadge win={win} />
                </div>
            </div>
            {hasCalls ? (
                <div style={{ flex: 1, minHeight: 200, position: "relative" }}>
                    <CostLine data={data} options={options} plugins={[peakLabels]} aria-label="Cost over time" />
                </div>
            ) : (
                <EmptyChart offSince={offSince} note="No router calls in this window" />
            )}
        </div>
    );
}

// ── 3. Calls per day / per hour ──────────────────────────────────────────────
// One bar per day is a single bar until the log spans a week, so the card opens
// on the 24 hour view - the shape of a working day is readable from the first
// session, and the daily view takes over once there is a week to compare.
const LAT_AVG = "#4A9EFF";
const LAT_P95 = "#E8A23B";
function CallsChart({ daily, hourly }: { daily: JevAggregate["daily"]; hourly: JevAggregate["hourly"] }) {
    const [mode, setMode] = useState<"hour" | "day">(daily.length > 1 ? "day" : "hour");
    const byHour = mode === "hour";

    // Both views collapse to the same row shape so the chart has one type: axis
    // is the short tick, tip is the long label the tooltip shows.
    const data = useMemo(() => (
        byHour
            ? hourly.map(h => ({ axis: h.label, tip: fmtHourLabel(h.hour), routed: h.routed, skipped: h.skipped, errors: h.errors, total: h.routed + h.skipped + h.errors, avg: h.avgLatencyMs || null, p95: null }))
            : daily.map(d => ({ axis: d.day.slice(5), tip: d.day, routed: d.routed, skipped: d.skipped, errors: d.errors, total: d.routed + d.skipped + d.errors, avg: d.avgLatencyMs || null, p95: d.p95LatencyMs || null }))
    ), [byHour, hourly, daily]);

    const tips = useMemo(() => new Map(data.map(d => [d.axis, d.tip])), [data]);

    return (
        <div style={cardShell}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <CardLabel
                        title={byHour ? "Calls per hour" : "Calls per day"}
                        sub={byHour ? "Last 24 hours, by outcome - line is router latency" : "Every prompt the hook saw, by outcome - lines are router latency"}
                    />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                    {(["hour", "day"] as const).map(m => {
                        const active = mode === m;
                        return (
                            <button key={m} onClick={() => setMode(m)}
                                style={{
                                    cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                                    textTransform: "uppercase", padding: "4px 9px", borderRadius: 7,
                                    background: active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                                    color: active ? "#fff" : "rgba(255,255,255,0.4)",
                                    border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
                                    transition: "all 0.15s ease",
                                }}>
                                {m === "hour" ? "24h" : "Daily"}
                            </button>
                        );
                    })}
                </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap={byHour ? "14%" : "22%"} maxBarSize={byHour ? 26 : 44}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="axis" tick={AXIS_TICK} interval={byHour ? 1 : 0} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="calls" tick={AXIS_TICK} width={28} axisLine={false} tickLine={false} allowDecimals={false} />
                    {/* Latency rides its own right axis over the bars - empty hours are null so the line skips them. */}
                    <YAxis yAxisId="ms" orientation="right" tick={AXIS_TICK} width={40} axisLine={false} tickLine={false} unit="ms" />
                    <Tooltip
                        {...TOOLTIP}
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        labelFormatter={label => tips.get(String(label)) ?? String(label)}
                    />
                    <Bar yAxisId="calls" dataKey="routed" stackId="a" fill={STATUS_COLORS.routed} name="routed" />
                    <Bar yAxisId="calls" dataKey="skipped" stackId="a" fill={STATUS_COLORS.skipped} name="skipped" />
                    <Bar yAxisId="calls" dataKey="errors" stackId="a" fill={STATUS_COLORS.error} name="error" radius={[3, 3, 0, 0]} />
                    {/* Invisible line at the stack height carries the total, so every bar
                        gets its number even when its top segment is 0 and has no box to label. */}
                    <Line yAxisId="calls" dataKey="total" stroke="none" dot={false} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false}>
                        <LabelList dataKey="total" position="top" offset={4} fill="rgba(255,255,255,0.55)" fontSize={9} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")} />
                    </Line>
                    <Line yAxisId="ms" type="monotone" dataKey="avg" name="avg ms" stroke={LAT_AVG} strokeWidth={2} dot={{ r: 2.5, fill: LAT_AVG }} connectNulls={!byHour} isAnimationActive={false} />
                    {!byHour && <Line yAxisId="ms" type="monotone" dataKey="p95" name="p95 ms" stroke={LAT_P95} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: LAT_P95 }} connectNulls isAnimationActive={false} />}
                </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6 }}>
                {Object.entries(STATUS_COLORS).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: v }} />
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>{k}</span>
                    </div>
                ))}
                {[["avg ms", LAT_AVG, false], ...(byHour ? [] : [["p95 ms", LAT_P95, true]])].map(([k, c, dash]) => (
                    <div key={String(k)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 12, height: 0, borderTop: `2px ${dash ? "dashed" : "solid"} ${c}` }} />
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{String(k)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── 4. Tier split ────────────────────────────────────────────────────────────
// `focus` is the tier the overview card was clicked on: the card scrolls into
// view and that slice stays lit. `jump` is the URL rung only, so the page
// scrolls here on a deep link but not when a slice is clicked.
// Same polar area the overview card uses: the filled wedge is what Jev routed,
// the white outline behind it is every prompt that ran on the tier.
function TierSplit({ tiers, tiersTotal, focus, jump, onPick, offSince }: { tiers: JevAggregate["tiers"]; tiersTotal: JevAggregate["tiersTotal"]; focus?: string; jump?: string; onPick: (t: string) => void; offSince: string | null }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (jump) ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, [jump]);
    const segments = TIER_ORDER
        .map(t => ({ label: t, color: TIER_COLORS[t], value: tiers[t], total: tiersTotal?.[t] ?? 0 }))
        .filter(s => s.value > 0 || s.total > 0);
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const allTotal = segments.reduce((s, seg) => s + seg.total, 0);
    const showAll = allTotal > total;

    return (
        <div id="tier-split" ref={ref} style={{ ...cardShell, scrollMarginTop: 16, outline: focus ? `1px solid ${TIER_COLORS[focus] ?? "transparent"}66` : undefined }}>
            <CardLabel title="Tier split" sub={showAll
                ? "Filled wedge is what Jev picked, white outline is every prompt that ran on the tier"
                : "Which rung of the ladder the router picked"} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{total.toLocaleString()}</span>
                <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>routed</span>
                {showAll && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>of {allTotal.toLocaleString()}</span>}
            </div>
            {total > 0 ? <PolarChart segments={segments} size={190} onSelect={onPick} />
                : <EmptyChart offSince={offSince} note={allTotal > 0 ? `${allTotal.toLocaleString()} prompts ran on the pinned tier` : "Nothing routed in this window"} />}
        </div>
    );
}

// ── Table primitives ─────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
    textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "rgba(255,255,255,0.32)",
    padding: "0 10px 8px", whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
    fontSize: 11, color: "rgba(255,255,255,0.72)", padding: "7px 10px",
    borderTop: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap",
};

function ProjectCell({ project }: { project?: string }) {
    if (!project) return <>-</>;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AppIcon project={project} size={14} />
            {project}
        </span>
    );
}
const NUM: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ── 6. Per session ───────────────────────────────────────────────────────────
const SESSION_PAGE = 25;

function SessionTable({ sessions }: { sessions: JevSession[] }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? sessions : sessions.slice(0, SESSION_PAGE);

    return (
        <div style={cardShell}>
            <CardLabel title="Per session" sub={`${sessions.length} sessions the router has seen, most recent first`} />
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Project</th>
                            <th style={TH}>Session</th>
                            <th style={{ ...TH, textAlign: "right" }}>Msgs</th>
                            <th style={{ ...TH, textAlign: "right" }}>Routed</th>
                            <th style={{ ...TH, textAlign: "right" }}>Errors</th>
                            <th style={TH}>Top tier</th>
                            <th style={{ ...TH, textAlign: "right" }}>Avg conf</th>
                            <th style={TH}>First</th>
                            <th style={TH}>Last</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(s => (
                            <tr key={s.session_id}>
                                <td style={TD}><ProjectCell project={s.project} /></td>
                                <td style={TD}>
                                    <Link href={`/${s.session_id}`} style={{ color: "#4A9EFF", fontFamily: "ui-monospace, monospace", textDecoration: "none" }}>
                                        {s.session_id.slice(0, 8)}
                                    </Link>
                                </td>
                                <td style={NUM}>{s.messages}</td>
                                <td style={{ ...NUM, color: STATUS_COLORS.routed }}>{s.routed}</td>
                                <td style={{ ...NUM, color: s.errors > 0 ? STATUS_COLORS.error : "rgba(255,255,255,0.25)" }}>{s.errors}</td>
                                <td style={TD}>{s.topTier ? <TierPill tier={s.topTier} /> : <span style={{ color: "rgba(255,255,255,0.2)" }}>-</span>}</td>
                                <td style={NUM}>{s.avgConf == null ? "-" : s.avgConf.toFixed(2)}</td>
                                <td style={{ ...TD, color: "rgba(255,255,255,0.4)" }}>{fmtTime(s.firstTs)}</td>
                                <td style={{ ...TD, color: "rgba(255,255,255,0.4)" }}>{fmtTime(s.lastTs)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {sessions.length > SESSION_PAGE && (
                <button onClick={() => setExpanded(!expanded)}
                    style={{
                        marginTop: 10, background: "none", border: "none", cursor: "pointer",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A9EFF",
                    }}>
                    {expanded ? "Show less" : `Show all ${sessions.length}`}
                </button>
            )}
        </div>
    );
}

// Confidence shade, matching the hook gates: under 0.7 the main model picks
// (haiku and sonnet bumped 1 rung as a floor), 0.7 and up the tier is followed.
function confColor(c: number) {
    return c < 0.5 ? "#FF453A" : c < 0.7 ? "#FFB020" : "#30D158";
}

function ConfCell({ value }: { value: number }) {
    const color = confColor(value);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <div style={{ width: 54, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(value * 100)}%`, height: "100%", background: color }} />
            </div>
            <span style={{ color, fontFamily: "ui-monospace, monospace", minWidth: 30, textAlign: "right" }}>{value.toFixed(2)}</span>
        </div>
    );
}

const OUTCOME: Record<JevOutcome, { label: string; color: string }> = {
    followed: { label: "Followed", color: "#30D158" },
    over: { label: "Ran stronger", color: "#4A9EFF" },
    under: { label: "Ran weaker", color: "#FF453A" },
    main: { label: "Main model", color: "rgba(255,255,255,0.4)" },
};

function DecisionTable({ decisions, outcomes }: { decisions: JevDecision[]; outcomes?: Record<JevOutcome, number> }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? decisions : decisions.slice(0, SESSION_PAGE);
    const low = decisions.filter(d => d.conf < 0.7).length;

    return (
        <div style={cardShell}>
            <CardLabel title="Per decision" sub={`Last ${decisions.length} routed prompts, newest first. ${low} under 0.7, where the main model picks with a 1-rung floor`} />
            {outcomes && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 10px" }}>
                    {(Object.keys(OUTCOME) as JevOutcome[]).map(k => (
                        <Pill key={k} text={`${OUTCOME[k].label} ${outcomes[k]}`} color={OUTCOME[k].color} dim={k === "main"} />
                    ))}
                </div>
            )}
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Time</th>
                            <th style={TH}>Project</th>
                            <th style={TH}>Prompt</th>
                            <th style={TH}>Tier</th>
                            <th style={{ ...TH, textAlign: "right" }}>Tier conf</th>
                            <th style={TH}>Agent</th>
                            <th style={{ ...TH, textAlign: "right" }}>Agent conf</th>
                            <th style={TH}>What ran</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((d, i) => (
                            <tr key={d.ts + i}>
                                <td style={{ ...TD, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{fmtTime(d.ts)}</td>
                                <td style={TD}><ProjectCell project={d.project} /></td>
                                <td style={{ ...TD, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }} title={d.prompt}>
                                    {d.session_id ? <Link href={`/${d.session_id}`} style={{ color: "inherit", textDecoration: "none" }}>{d.prompt}</Link> : d.prompt}
                                </td>
                                <td style={TD}><TierPill tier={d.tier} /></td>
                                <td style={TD}><ConfCell value={d.conf} /></td>
                                <td style={{ ...TD, color: d.agent === "none" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.75)" }}>
                                    <span className="inline-flex items-center gap-1.5">
                                        {(() => { const ch = AGENT_CHARS.find(c => c.name.toLowerCase() === d.agent.toLowerCase()); return ch ? <Image src={ch.img} alt={ch.name} width={18} height={18} className="rounded" style={{ border: `1px solid ${ch.color}40` }} /> : null; })()}
                                        {d.agent}
                                    </span>
                                </td>
                                <td style={TD}><ConfCell value={d.agentConf} /></td>
                                <td style={{ ...TD, whiteSpace: "nowrap", color: d.outcome ? OUTCOME[d.outcome].color : "rgba(255,255,255,0.2)" }}>{d.outcome ? OUTCOME[d.outcome].label : "-"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {decisions.length > SESSION_PAGE && (
                <button onClick={() => setExpanded(!expanded)}
                    style={{
                        marginTop: 10, background: "none", border: "none", cursor: "pointer",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A9EFF",
                    }}>
                    {expanded ? "Show less" : `Show all ${decisions.length}`}
                </button>
            )}
        </div>
    );
}

const VERDICT: Record<string, { label: string; color: string }> = {
    agree: { label: "Agree", color: "#30D158" },
    under: { label: "Too weak", color: "#FF453A" },
    over: { label: "Too strong", color: "#4A9EFF" },
    unknown: { label: "Inherits", color: "rgba(255,255,255,0.4)" },
};

// Shadow mode: every subagent launch, the model it got against the cheapest
// tier Jev says its task needs. Nothing is blocked yet - this is the data that
// decides whether to enforce.
function AgentChecks({ checks }: { checks: JevAggregate["agentChecks"] }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? checks.recent : checks.recent.slice(0, SESSION_PAGE);
    return (
        <div style={cardShell}>
            <CardLabel title="Subagent launches (shadow)" sub="Model each agent ran on vs the cheapest tier Jev says its task needs. Logged only, nothing blocked" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 10px" }}>
                {(["agree", "under", "over"] as const).map(k => (
                    <Pill key={k} text={`${VERDICT[k].label} ${checks.counts[k]}`} color={VERDICT[k].color} />
                ))}
            </div>
            {checks.recent.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No subagent launches checked yet. The next Agent call logs 1 row here.</p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                        <thead><tr>
                            <th style={TH}>Time</th><th style={TH}>Project</th><th style={TH}>Agent</th><th style={TH}>Task</th>
                            <th style={TH}>Ran on</th><th style={TH}>Jev floor</th><th style={TH}>Verdict</th>
                        </tr></thead>
                        <tbody>
                            {shown.map((c, i) => (
                                <tr key={c.ts + i}>
                                    <td style={{ ...TD, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{fmtTime(c.ts)}</td>
                                    <td style={TD}><ProjectCell project={c.project} /></td>
                                    <td style={{ ...TD, color: "rgba(255,255,255,0.75)" }}>{c.agent}</td>
                                    <td style={{ ...TD, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }} title={c.task}>{c.task}</td>
                                    <td style={TD}>{c.requested ? <TierPill tier={c.requested} /> : "-"}</td>
                                    <td style={TD}>{c.floor ? <TierPill tier={c.floor} /> : "-"}</td>
                                    <td style={{ ...TD, whiteSpace: "nowrap", color: (VERDICT[c.verdict] ?? VERDICT.unknown).color }}>{(VERDICT[c.verdict] ?? VERDICT.unknown).label}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {checks.recent.length > SESSION_PAGE && (
                <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#4A9EFF" }}>
                    {expanded ? "Show less" : `Show all ${checks.recent.length}`}
                </button>
            )}
        </div>
    );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function NeverRan({ logPath, hookPath }: { logPath: string; hookPath: string }) {
    return (
        <div style={{ ...cardShell, padding: "40px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No routing decisions yet</div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 auto", maxWidth: 520, lineHeight: 1.6 }}>
                The <code style={{ color: "#4A9EFF" }}>UserPromptSubmit</code> hook writes 1 line to{" "}
                <code style={{ color: "#fff" }}>{logPath}</code> on the next prompt you send. This page fills in from there.
            </p>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 14, fontFamily: "ui-monospace, monospace" }}>{hookPath}</div>
        </div>
    );
}

// ── Page body ────────────────────────────────────────────────────────────────
export default function JevCharts({ data, tier, win }: { data: JevAggregate & { logPath: string; hookPath: string }; tier?: string; win: Window4 }) {
    const mounted = useSyncExternalStore(subscribeMounted, getMounted, getMountedServer);
    // A slice click overrides the URL rung; clicking the lit rung again clears it.
    const [pick, setPick] = useState<string | null | undefined>(undefined);
    const focus = pick === undefined ? tier : pick ?? undefined;
    function onPick(t: string) {
        setPick(focus === t ? null : t);
    }
    if (!mounted) return null;
    const offSince = data.health === "off" ? data.windows[0]?.from ?? null : null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <HealthStrip data={data} win={win} />
            {data.health === "never" ? (
                <NeverRan logPath={data.logPath} hookPath={data.hookPath} />
            ) : (
                <>
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
                        <CostChart daily={data.daily} hourly={data.hourly} win={win} offSince={offSince} />
                        <CallsChart key={win} daily={data.daily} hourly={data.hourly} />
                        <TierSplit tiers={data.tiers} tiersTotal={data.tiersTotal} focus={focus} jump={tier} onPick={onPick} offSince={offSince} />
                    </div>
                    <DecisionTable decisions={data.decisions ?? []} outcomes={data.outcomes} />
                    {data.agentChecks && <AgentChecks checks={data.agentChecks} />}
                    <SessionTable sessions={data.sessions} />
                </>
            )}
        </div>
    );
}
