"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Activity, DollarSign, Layers, Radio } from "lucide-react";
import { useMachine } from "./MachineContext";
import { safeFetch, fmtCompact, fmtCost, fmtTs } from "./shared";
import { cardShell } from "@/lib/ui-tokens";
import type { McpLogData, McpServerStat, McpCall, Verdict, Win } from "@/app/api/claude/mcp-log/route";

const ACCENT = "#FFCC00";
export const WIN_LABEL: Record<Win, string> = { today: "today, since 12:00 AM", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days" };
export const UNIT_LABEL = { hour: "by hour", day: "by day", month: "by month" } as const;
const PAGE = 40;

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

const shortModel = (m: string) => m.replace(/^claude-/, "").replace(/-\d{8}$/, "");

export function VerdictChip({ v }: { v: Verdict }) {
    const { label, color } = VERDICT[v];
    return (
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color, padding: "2px 7px", borderRadius: 999, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>{label}</span>
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
export function BigStat({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
    return (
        <div style={{ padding: "16px 18px", borderRadius: 12, background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`, border: `1px solid ${color}20` }}>
            <div className="flex items-center gap-2 mb-2">
                <Icon size={16} style={{ color }} />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>{label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{sub}</div>}
        </div>
    );
}

// Every MCP tool call reconstructed from the session transcripts: a verdict
// per server (keep / low / idle / gone / flaky) and the raw log underneath so
// the "is this MCP worth its RAM" question is answered on the page, not by
// running an audit.
export default function McpLogPanel({ win }: { win: Win }) {
    const { apiBase } = useMachine();
    const [limit, setLimit] = useState(PAGE);
    const url = apiBase(`/api/claude/mcp-log?win=${win}`);
    const { data, isFetching } = useQuery<McpLogData | null>({
        queryKey: ["mcp-log", url],
        queryFn: () => safeFetch<McpLogData | null>(url, null),
        refetchInterval: 300_000,
        refetchOnWindowFocus: false,
        placeholderData: prev => prev,
    });

    const servers: McpServerStat[] = data?.servers ?? [];
    const calls: McpCall[] = data?.recent ?? [];
    const t = data?.totals;

    return (
        <div style={{ ...cardShell, marginBottom: 20 }}>
            <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, marginBottom: 14 }}>
                <div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>MCP Log <span style={{ color: ACCENT }}>{WIN_LABEL[win]}</span></p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>what was called, when, from where, why, by which model, and what it cost{isFetching && !data ? " - scanning transcripts..." : ""}</p>
                </div>
            </div>

            {t && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 20 }}>
                    <BigStat label="MCP calls" value={t.calls.toLocaleString()} sub={`${t.sessions} sessions`} icon={Activity} color={ACCENT} />
                    <BigStat label="Cost" value={fmtCost(t.cost)} sub="output + result re-read" icon={DollarSign} color="#FF9500" />
                    <BigStat label="Result tokens" value={fmtCompact(t.tokens)} sub="pulled back into context" icon={Layers} color="#f97316" />
                    <BigStat label="Errors" value={String(t.errors)} sub={`${t.servers} of ${servers.length} servers used`} icon={t.errors ? AlertTriangle : Radio} color={t.errors ? "#ef4444" : "#8AC249"} />
                </div>
            )}

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
                                    <span style={{ color: "rgba(255,255,255,0.45)" }}>{c.server}.</span><span style={{ color: "#fff" }}>{c.tool}</span>
                                </td>
                                <td style={td}>{c.project}{c.branch && c.branch !== "main" ? <span style={{ color: "rgba(255,255,255,0.35)" }}> @{c.branch}</span> : null}</td>
                                <td style={td}>{shortModel(c.model)}{c.skill ? <span style={{ color: ACCENT }}> /{c.skill}</span> : null}</td>
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
                <button type="button" onClick={() => setLimit(l => l + PAGE)} style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: ACCENT, background: "none", border: `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>
                    show {Math.min(PAGE, calls.length - limit)} more
                </button>
            )}
        </div>
    );
}
