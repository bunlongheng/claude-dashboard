"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Activity, DollarSign, Layers, Radio } from "lucide-react";
import { useMachine } from "./MachineContext";
import { safeFetch, fmtCompact, fmtCost, fmtTs, SegmentedTabs } from "./shared";
import { cardShell } from "@/lib/ui-tokens";
import type { McpLogData, McpServerStat, McpCall, Verdict, Win } from "@/app/api/claude/mcp-log/route";
import type { Kind } from "@/lib/tool-log";
import { HeroSlot } from "./PageHero";

const ACCENT = "#FFCC00";
export const WIN_LABEL: Record<Win, string> = { today: "today, since 12:00 AM", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days" };
export const UNIT_LABEL = { hour: "by hour", day: "by day", month: "by month" } as const;
const PAGE = 40;
// The same panel serves the MCP page and the CLI page; only the words and the
// accent change.
const KIND = {
    mcp: { title: "MCP Log", calls: "MCP calls", noun: "servers", route: "mcp-log", accent: "#FFCC00", sep: "." },
    cli: { title: "CLI Log", calls: "Tool calls", noun: "tools", route: "cli-log", accent: "#34C759", sep: " " },
} as const;

// One colour per decision so the table reads top to bottom as a verdict list.
export const VERDICT: Record<Verdict, { label: string; color: string }> = {
    keep: { label: "keep", color: "#8AC249" },
    low: { label: "low use", color: ACCENT },
    flaky: { label: "flaky", color: "#f97316" },
    gone: { label: "gone", color: "#ef4444" },
    idle: { label: "idle", color: "rgba(255,255,255,0.35)" },
    connector: { label: "connector", color: "#5AC8FA" },
};
export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
export const th: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", padding: "6px 8px", textAlign: "left", whiteSpace: "nowrap" };
export const td: React.CSSProperties = { fontSize: 11, color: "rgba(255,255,255,0.7)", padding: "7px 8px", whiteSpace: "nowrap", verticalAlign: "top" };
export const num: React.CSSProperties = { ...td, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

export const shortModel = (m: string) => m.replace(/^claude-/, "").replace(/-\d{8}$/, "");

export function VerdictChip({ v, label }: { v: Verdict; label?: string }) {
    const { color } = VERDICT[v];
    label ??= VERDICT[v].label;
    return (
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color, padding: "2px 7px", borderRadius: 999, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>{label}</span>
    );
}

export function Chips({ title, items }: { title: string; items: string[] }) {
    if (!items.length) return null;
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ ...th, padding: "0 0 4px" }}>{title}</div>
            <div className="flex flex-wrap" style={{ gap: 4 }}>
                {items.map(i => <span key={i} style={{ fontSize: 10, fontFamily: MONO, padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>{i}</span>)}
            </div>
        </div>
    );
}

// Calls per bucket with the bucket name on hover and the first/last label
// underneath, so the strip reads as a clock (today) or a calendar (7d, 30d, 90d).
export function Spark({ series, labels, color }: { series: number[]; labels: string[]; color: string }) {
    const max = Math.max(1, ...series);
    const wide = series.length <= 7;
    return (
        <div style={{ width: wide ? 140 : 180 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: wide ? 3 : 1, height: 28 }}>
                {series.map((d, i) => (
                    <div key={i} title={`${labels[i] ?? ""}: ${d} call${d === 1 ? "" : "s"}`} style={{ flex: 1, minWidth: 1, height: d ? `${Math.max(12, (d / max) * 100)}%` : 2, background: d ? color : "rgba(255,255,255,0.08)", borderRadius: 1 }} />
                ))}
            </div>
            <div className="flex justify-between" style={{ fontSize: 8, fontFamily: MONO, color: "rgba(255,255,255,0.3)", marginTop: 2 }}><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>
        </div>
    );
}

// Same card as the RAG overview stat row so the 2 pages read as 1 dashboard.
// Tiny area chart pinned to the bottom of a stat box; viewBox units, stretched to fit.
export function Sparkline({ values, color }: { values: number[]; color: string }) {
    const max = Math.max(...values) || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 26}`);
    const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
    return (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden style={{ display: "block", width: "100%", height: 32, marginTop: 10, pointerEvents: "none" }}>
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <polygon points={`0,30 ${pts.join(" ")} 100,30`} fill={`url(#${id})`} />
            <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

// Same look as the Overview hero cards: colored 1px border with a snake that
// runs around it on hover, dark tint, and a faint big icon in the corner.
export function BigStat({ label, value, sub, icon: Icon, color, trend, iconStyle }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string; trend?: number[]; iconStyle?: React.CSSProperties }) {
    return (
        <div className="group" style={{ position: "relative", overflow: "hidden", borderRadius: 12, padding: 1, background: `${color}40`, minWidth: 0 }}>
            <div className="opacity-0 group-hover:opacity-100 [animation-play-state:paused] group-hover:[animation-play-state:running]"
                style={{
                    position: "absolute", inset: "-150%", pointerEvents: "none", transition: "opacity 0.3s",
                    background: `conic-gradient(transparent 0deg, ${color} 40deg, transparent 80deg)`,
                    animation: "heroSnake 2s linear infinite",
                }} />
            <div style={{ position: "relative", overflow: "hidden", height: "100%", padding: "15px 17px", borderRadius: 11, background: `linear-gradient(135deg, ${color}20 0%, ${color}08 100%), #08090d` }}>
                <Icon size={64} style={{ position: "absolute", right: -7, bottom: -7, color, opacity: 0.05, mixBlendMode: "screen", pointerEvents: "none" }} />
                <div className="flex items-center gap-2 mb-2" style={{ position: "relative" }}>
                    <Icon size={16} style={{ color, flexShrink: 0, ...iconStyle }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                </div>
                <div style={{ position: "relative", fontSize: 28, fontWeight: 800, color, lineHeight: 1.1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                {sub && <div style={{ position: "relative", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
                {trend && trend.length > 1 && <div style={{ position: "relative" }}><Sparkline values={trend} color={color} /></div>}
            </div>
        </div>
    );
}

// Every MCP tool call reconstructed from the session transcripts: a verdict
// per server (keep / low / idle / gone / flaky) and the raw log underneath so
// the "is this MCP worth its RAM" question is answered on the page, not by
// running an audit.
const WIN_TABS = [{ key: "today", label: "Today" }, { key: "7d", label: "7d" }, { key: "30d", label: "30d" }, { key: "90d", label: "90d" }] as const;

// Both the default export and McpRecentCalls read the same window/kind, so
// the query is factored into 1 hook - react-query dedupes the request by
// queryKey, meaning only 1 fetch actually happens on the page.
function useLogData(win: Win, kind: Kind) {
    const { apiBase } = useMachine();
    const k = KIND[kind];
    const url = apiBase(`/api/claude/${k.route}?win=${win}`);
    return useQuery<McpLogData | null>({
        queryKey: [k.route, url],
        queryFn: () => safeFetch<McpLogData | null>(url, null),
        refetchInterval: 300_000,
        refetchOnWindowFocus: false,
        placeholderData: prev => prev,
    });
}

// The window selector is portaled into the page hero (next to the icon and
// title) so the page has no extra row; the parent owns the value.
export default function McpLogPanel({ win, onWin, kind = "mcp" }: { win: Win; onWin?: (w: Win) => void; kind?: Kind }) {
    const k = KIND[kind];
    const { data, isFetching } = useLogData(win, kind);

    const servers: McpServerStat[] = data?.servers ?? [];
    const t = data?.totals;

    return (
        <div style={{ ...cardShell, marginBottom: 20 }}>
            <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, marginBottom: 14 }}>
                <div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>{k.title} <span style={{ color: k.accent }}>{WIN_LABEL[win]}</span></p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>what was called, when, from where, why, by which model, and what it cost{isFetching && !data ? " - scanning transcripts..." : ""}</p>
                </div>
                {onWin && (
                    <HeroSlot>
                        <SegmentedTabs<Win> tabs={[...WIN_TABS]} value={win} onChange={onWin} accent={k.accent} />
                    </HeroSlot>
                )}
            </div>

            {t && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
                    <BigStat label={k.calls} value={t.calls.toLocaleString()} sub={`${t.sessions} sessions`} icon={Activity} color={k.accent} />
                    <BigStat label="API list price" value={fmtCost(t.cost)} sub="not your plan bill - output + result re-read" icon={DollarSign} color="#FF9500" />
                    <BigStat label="Result tokens" value={fmtCompact(t.tokens)} sub="pulled back into context" icon={Layers} color="#f97316" />
                    <BigStat label="Errors" value={String(t.errors)} sub={`${t.servers} of ${servers.length} ${k.noun} used`} icon={t.errors ? AlertTriangle : Radio} color={t.errors ? "#ef4444" : "#8AC249"} />
                </div>
            )}
        </div>
    );
}

// Rendered separately, below the server/tool directory, so the directory
// reads first and the raw call log reads last.
export function McpRecentCalls({ win, kind = "mcp" }: { win: Win; kind?: Kind }) {
    const [limit, setLimit] = useState(PAGE);
    const k = KIND[kind];
    const { data } = useLogData(win, kind);
    const calls: McpCall[] = data?.recent ?? [];

    return (
        <div style={{ ...cardShell, marginTop: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: "4px 0 8px" }}>
                Recent calls <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>{calls.length}</span>
            </p>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                            <th style={th}>when</th><th style={th}>what</th><th style={th}>where</th><th style={th}>who</th><th style={th}>why</th>
                            <th style={{ ...th, textAlign: "right" }}>tokens</th><th style={{ ...th, textAlign: "right" }}>cost</th><th style={{ ...th, textAlign: "right" }}>ms</th>
                        </tr>
                    </thead>
                    <tbody>
                        {calls.slice(0, limit).map((c, i) => (
                            <tr key={`${c.sessionId}-${c.ts}-${i}`} title={`${c.input}\n\n${c.result}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ ...td, color: "rgba(255,255,255,0.45)" }}>{fmtTs(c.ts)}</td>
                                <td style={{ ...td, fontFamily: MONO }}>
                                    {c.isError && <AlertTriangle size={10} style={{ color: "#ef4444", display: "inline", marginRight: 4, verticalAlign: -1 }} />}
                                    <span style={{ color: "rgba(255,255,255,0.45)" }}>{c.server}{k.sep}</span><span style={{ color: "#fff" }}>{c.tool}</span>
                                </td>
                                <td style={td}>{c.project}{c.branch && c.branch !== "main" ? <span style={{ color: "rgba(255,255,255,0.35)" }}> @{c.branch}</span> : null}</td>
                                <td style={td}>{shortModel(c.model)}{c.skill ? <span style={{ color: k.accent }}> /{c.skill}</span> : null}</td>
                                <td style={{ ...td, whiteSpace: "normal", minWidth: 200, maxWidth: 420, color: "rgba(255,255,255,0.55)" }} title={c.prompt}>{c.prompt ? (c.prompt.length > 120 ? `${c.prompt.slice(0, 120)}...` : c.prompt) : "-"}</td>
                                <td style={num}>{fmtCompact(c.resultTokens)}</td>
                                <td style={num}>{fmtCost(c.cost)}</td>
                                <td style={{ ...num, color: "rgba(255,255,255,0.35)" }}>{c.latencyMs ?? "-"}</td>
                            </tr>
                        ))}
                        {data && !calls.length && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 24 }}>No calls</td></tr>}
                    </tbody>
                </table>
            </div>
            {calls.length > limit && (
                <button type="button" onClick={() => setLimit(l => l + PAGE)} style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: k.accent, background: "none", border: `1px solid color-mix(in srgb, ${k.accent} 35%, transparent)`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>
                    show {Math.min(PAGE, calls.length - limit)} more
                </button>
            )}
        </div>
    );
}
