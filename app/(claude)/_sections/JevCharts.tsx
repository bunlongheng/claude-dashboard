"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { cardShell } from "@/lib/ui-tokens";
import { fmtNum, timeAgo } from "./shared";
import type { JevAggregate, JevRow, JevSession } from "@/lib/jev-log";

// Fixed tier colors - the ladder reads left to right cheapest first, so the
// palette has to stay stable across every chart and pill on the page.
const TIER_COLORS: Record<string, string> = {
    haiku: "#22C55E",
    sonnet: "#4A9EFF",
    opus: "#A855F7",
    fable: "#F97316",
};
const TIER_ORDER = ["haiku", "sonnet", "opus", "fable"] as const;

const STATUS_COLORS = {
    routed: "#22C55E",
    skipped: "#6B7280",
    error: "#EF4444",
};

const HEALTH_STYLE: Record<string, { color: string; label: string; note: string }> = {
    live: { color: "#22C55E", label: "LIVE", note: "routed in the last 15 minutes" },
    stale: { color: "#E8A23B", label: "STALE", note: "no routing decision recently" },
    never: { color: "#6B7280", label: "NEVER", note: "the router has not answered yet" },
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

function Pill({ text, color, dim = false }: { text: string; color: string; dim?: boolean }) {
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap",
            background: dim ? "rgba(255,255,255,0.05)" : `${color}1F`,
            color: dim ? "rgba(255,255,255,0.45)" : color,
            border: `1px solid ${dim ? "rgba(255,255,255,0.08)" : `${color}33`}`,
        }}>{text}</span>
    );
}

function fmtTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// The router costs fractions of a cent per call, so 2 decimals reads as $0.00
// until the log is enormous. Widen the precision instead of lying about it.
function fmtCost(usd: number): string {
    if (usd === 0) return "$0";
    if (usd < 0.01) return `$${usd.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${usd.toFixed(2)}`;
}

function statusOf(row: JevRow): "routed" | "skipped" | "error" {
    if (row.status === "routed") return "routed";
    if (row.status === "error") return "error";
    return "skipped";
}

// ── 1. Health strip ──────────────────────────────────────────────────────────
// The proof block. Everything else on the page is detail; this answers "is the
// hook running" in one glance, so it gets the size and the only moving part.
function HealthStrip({ data }: { data: JevAggregate }) {
    const { totals, health, daily } = data;
    const h = HEALTH_STYLE[health] ?? HEALTH_STYLE.never;
    const todayRow = daily.find(d => d.day === todayKey());
    const callsToday = todayRow ? todayRow.routed + todayRow.skipped + todayRow.errors : 0;

    const cells: { label: string; value: string; sub?: string; color?: string }[] = [
        { label: "Calls today", value: String(callsToday), sub: `${totals.calls} in range` },
        { label: "Routed", value: `${totals.routedPct}%`, sub: `${totals.routed} of ${totals.calls}`, color: STATUS_COLORS.routed },
        { label: "Avg latency", value: `${totals.avgLatencyMs}ms`, sub: `p95 ${totals.p95LatencyMs}ms` },
        { label: "Tokens today", value: fmtNum(todayRow?.tokens ?? 0), sub: `${fmtNum(totals.inputTokens + totals.outputTokens)} in range` },
        { label: "Est. cost", value: fmtCost(totals.estCostUsd), sub: `${totals.sessions} sessions` },
        { label: "Errors", value: String(totals.errors), sub: totals.errors > 0 ? "check the log" : "clean", color: totals.errors > 0 ? STATUS_COLORS.error : undefined },
    ];

    return (
        <div style={{
            ...cardShell,
            padding: 0,
            overflow: "hidden",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "stretch",
            borderColor: `${h.color}2E`,
        }}>
            <style>{`@keyframes jevPulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.35; transform:scale(.72) } }`}</style>

            {/* Status */}
            <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "18px 24px", minWidth: 260, flex: "1 1 260px",
                borderLeft: `3px solid ${h.color}`,
                background: `linear-gradient(90deg, ${h.color}14 0%, transparent 100%)`,
            }}>
                <span style={{
                    width: 9, height: 9, borderRadius: 999, background: h.color, flexShrink: 0,
                    boxShadow: `0 0 12px ${h.color}`,
                    animation: health === "live" ? "jevPulse 1.8s ease-in-out infinite" : "none",
                }} />
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em", color: h.color, lineHeight: 1 }}>{h.label}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {totals.lastCallTs ? timeAgo(totals.lastCallTs) : "no calls"}
                        </span>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>{h.note}</div>
                </div>
            </div>

            {/* Metrics */}
            <div style={{ display: "flex", flexWrap: "wrap", flex: "3 1 560px" }}>
                {cells.map(c => (
                    <div key={c.label} style={{
                        flex: "1 1 120px", padding: "18px 18px",
                        borderLeft: "1px solid rgba(255,255,255,0.05)",
                    }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{c.label}</div>
                        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3, color: c.color ?? "#fff", fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
                        {c.sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{c.sub}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── 2. Calls per day ─────────────────────────────────────────────────────────
function CallsPerDay({ daily }: { daily: JevAggregate["daily"] }) {
    return (
        <div style={cardShell}>
            <CardLabel title="Calls per day" sub="Every prompt the hook saw, by outcome" />
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={daily} barCategoryGap="22%" maxBarSize={44}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="day" tick={AXIS_TICK} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} width={28} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="routed" stackId="a" fill={STATUS_COLORS.routed} name="routed" />
                    <Bar dataKey="skipped" stackId="a" fill={STATUS_COLORS.skipped} name="skipped" />
                    <Bar dataKey="errors" stackId="a" fill={STATUS_COLORS.error} name="error" radius={[3, 3, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6 }}>
                {Object.entries(STATUS_COLORS).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: v }} />
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>{k}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── 3. Tier split ────────────────────────────────────────────────────────────
function TierSplit({ tiers }: { tiers: JevAggregate["tiers"] }) {
    const data = TIER_ORDER
        .map(t => ({ name: t, value: tiers[t], fill: TIER_COLORS[t] }))
        .filter(d => d.value > 0);
    const total = TIER_ORDER.reduce((s, t) => s + tiers[t], 0);

    return (
        <div style={cardShell}>
            <CardLabel title="Tier split" sub="Which rung of the ladder the router picked" />
            <div style={{ position: "relative" }}>
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={3} dataKey="value" strokeWidth={0}>
                            {data.map(d => <Cell key={d.name} fill={d.fill} />)}
                        </Pie>
                        <Tooltip {...TOOLTIP} />
                    </PieChart>
                </ResponsiveContainer>
                <div style={{
                    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", pointerEvents: "none",
                }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{total}</span>
                    <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 3 }}>routed</span>
                </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 6 }}>
                {TIER_ORDER.map(t => (
                    <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, opacity: tiers[t] > 0 ? 1 : 0.35 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: TIER_COLORS[t] }} />
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{t}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: TIER_COLORS[t] }}>{tiers[t]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── 4. Latency per day ───────────────────────────────────────────────────────
function LatencyPerDay({ daily }: { daily: JevAggregate["daily"] }) {
    return (
        <div style={cardShell}>
            <CardLabel title="Latency per day" sub="How long the router took to answer, in milliseconds" />
            <ResponsiveContainer width="100%" height={200}>
                <LineChart data={daily}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="day" tick={AXIS_TICK} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} width={40} axisLine={false} tickLine={false} unit="ms" />
                    <Tooltip {...TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }} iconSize={8} />
                    <Line type="monotone" dataKey="avgLatencyMs" name="avg" stroke="#4A9EFF" strokeWidth={2} dot={{ r: 2.5, fill: "#4A9EFF" }} />
                    <Line type="monotone" dataKey="p95LatencyMs" name="p95" stroke="#E8A23B" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: "#E8A23B" }} />
                </LineChart>
            </ResponsiveContainer>
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
const NUM: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ── 5. Per session ───────────────────────────────────────────────────────────
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
                            <th style={TH}>Session</th>
                            <th style={TH}>Project</th>
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
                                <td style={TD}>
                                    <Link href={`/${s.session_id}`} style={{ color: "#4A9EFF", fontFamily: "ui-monospace, monospace", textDecoration: "none" }}>
                                        {s.session_id.slice(0, 8)}
                                    </Link>
                                </td>
                                <td style={TD}>{s.project}</td>
                                <td style={NUM}>{s.messages}</td>
                                <td style={{ ...NUM, color: STATUS_COLORS.routed }}>{s.routed}</td>
                                <td style={{ ...NUM, color: s.errors > 0 ? STATUS_COLORS.error : "rgba(255,255,255,0.25)" }}>{s.errors}</td>
                                <td style={TD}>{s.topTier ? <Pill text={s.topTier} color={TIER_COLORS[s.topTier] ?? "#6B7280"} /> : <span style={{ color: "rgba(255,255,255,0.2)" }}>-</span>}</td>
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

// ── 6. Per message ───────────────────────────────────────────────────────────
const MESSAGE_LIMIT = 100;
const SNIPPET = 60;

function MessageTable({ recent }: { recent: JevRow[] }) {
    const [filter, setFilter] = useState<"all" | "routed" | "skipped" | "error">("all");

    const counts = useMemo(() => {
        const c = { all: recent.length, routed: 0, skipped: 0, error: 0 };
        for (const r of recent) c[statusOf(r)]++;
        return c;
    }, [recent]);

    const rows = useMemo(
        () => (filter === "all" ? recent : recent.filter(r => statusOf(r) === filter)).slice(0, MESSAGE_LIMIT),
        [recent, filter],
    );

    const chips: ("all" | "routed" | "skipped" | "error")[] = ["all", "routed", "skipped", "error"];

    return (
        <div style={cardShell}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <CardLabel title="Per message" sub="Every prompt the hook logged, newest first" />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                    {chips.map(c => {
                        const active = filter === c;
                        const color = c === "all" ? "#FFFFFF" : STATUS_COLORS[c];
                        return (
                            <button key={c} onClick={() => setFilter(c)}
                                style={{
                                    cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                                    textTransform: "uppercase", padding: "4px 9px", borderRadius: 7,
                                    background: active ? `${color}1F` : "rgba(255,255,255,0.03)",
                                    color: active ? color : "rgba(255,255,255,0.4)",
                                    border: `1px solid ${active ? `${color}44` : "rgba(255,255,255,0.06)"}`,
                                    transition: "all 0.15s ease",
                                }}>
                                {c} {counts[c]}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Time</th>
                            <th style={TH}>Project</th>
                            <th style={TH}>Session</th>
                            <th style={TH}>Status</th>
                            <th style={TH}>Tier</th>
                            <th style={{ ...TH, textAlign: "right" }}>Conf</th>
                            <th style={{ ...TH, textAlign: "right" }}>Latency</th>
                            <th style={{ ...TH, textAlign: "right" }}>In / out</th>
                            <th style={{ ...TH, width: "100%" }}>Prompt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const status = statusOf(r);
                            const prompt = (r.prompt ?? "").replace(/\s+/g, " ").trim();
                            return (
                                <tr key={`${r.ts}-${i}`}>
                                    <td style={{ ...TD, color: "rgba(255,255,255,0.45)" }}>{fmtTime(r.ts)}</td>
                                    <td style={TD}>{r.project ?? "-"}</td>
                                    <td style={{ ...TD, fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.4)" }}>{(r.session_id ?? "").slice(0, 8) || "-"}</td>
                                    <td style={TD}><Pill text={status === "skipped" && r.reason ? `${status} ${r.reason}` : status} color={STATUS_COLORS[status]} dim={status === "skipped"} /></td>
                                    <td style={TD}>{r.tier ? <Pill text={r.tier} color={TIER_COLORS[r.tier] ?? "#6B7280"} /> : <span style={{ color: "rgba(255,255,255,0.2)" }}>-</span>}</td>
                                    <td style={NUM}>{typeof r.conf === "number" ? r.conf.toFixed(2) : "-"}</td>
                                    <td style={NUM}>{typeof r.latency_ms === "number" ? `${r.latency_ms}ms` : "-"}</td>
                                    <td style={NUM}>{(r.input_tokens ?? 0) || (r.output_tokens ?? 0) ? `${fmtNum(r.input_tokens ?? 0)} / ${fmtNum(r.output_tokens ?? 0)}` : "-"}</td>
                                    <td style={{ ...TD, whiteSpace: "normal", color: "rgba(255,255,255,0.5)" }} title={prompt}>
                                        {prompt.length > SNIPPET ? `${prompt.slice(0, SNIPPET)}...` : prompt || "-"}
                                    </td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr><td style={{ ...TD, color: "rgba(255,255,255,0.3)" }} colSpan={9}>No {filter} messages in this range.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
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
export default function JevCharts({ data }: { data: JevAggregate & { logPath: string; hookPath: string } }) {
    const mounted = useSyncExternalStore(subscribeMounted, getMounted, getMountedServer);
    if (!mounted) return null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <HealthStrip data={data} />
            {data.health === "never" ? (
                <NeverRan logPath={data.logPath} hookPath={data.hookPath} />
            ) : (
                <>
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <CallsPerDay daily={data.daily} />
                        <TierSplit tiers={data.tiers} />
                    </div>
                    <LatencyPerDay daily={data.daily} />
                    <SessionTable sessions={data.sessions} />
                    <MessageTable recent={data.recent} />
                </>
            )}
        </div>
    );
}
