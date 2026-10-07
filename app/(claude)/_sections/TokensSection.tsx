"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownLeft, Database, Users, Bot } from "lucide-react";
import { useMachine } from "./MachineContext";
import { safeFetch, SegmentedTabs, WINDOW_TABS, fmtCompact, fmtCost, fmtTs, timeAgo, FetchError } from "./shared";
import { cardShell } from "@/lib/ui-tokens";
import { BigStat, MONO, th, td, num } from "./McpLogPanel";
import { HeroSlot } from "./PageHero";
import AppIcon from "./AppIcon";
import type { TokensData, Since, Role, WhoRow } from "@/app/api/claude/tokens/route";

const ACCENT = "#FFCC00";
const OUT = "#7C5CFF";
const IN = "#4A9EFF";
const CACHE = "#3FB68B";
const PAGE = 25;
const ROLE: Record<Role, { label: string; color: string }> = { main: { label: "main thread", color: ACCENT }, agent: { label: "subagent", color: "#5AC8FA" } };
const SINCE_LABEL: Record<Since, string> = { today: "since 12:00 AM today", "7d": "last 7 days", "30d": "last 30 days", all: "all time" };

const shortModel = (m: string) => m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
const fmtFull = (n: number) => n.toLocaleString("en-US");

function RoleTag({ role }: { role: Role }) {
    const { label, color } = ROLE[role];
    return <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color, padding: "2px 7px", borderRadius: 999, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>{label}</span>;
}

function Share({ value, color }: { value: number; color: string }) {
    return (
        <div className="flex items-center" style={{ gap: 6, minWidth: 120 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(1, value * 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: MONO, color: "rgba(255,255,255,0.5)", width: 34, textAlign: "right" }}>{(value * 100).toFixed(0)}%</span>
        </div>
    );
}

function Title({ children }: { children: React.ReactNode }) {
    return <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: "22px 0 8px" }}>{children}</p>;
}

function TokCells({ r }: { r: { turns: number; input: number; output: number; cacheRead: number; cacheCreate: number; cost: number } }) {
    return (
        <>
            <td style={num}>{fmtFull(r.turns)}</td>
            <td style={{ ...num, color: OUT, fontWeight: 600 }} title={fmtFull(r.output)}>{fmtCompact(r.output)}</td>
            <td style={{ ...num, color: IN }} title={fmtFull(r.input)}>{fmtCompact(r.input)}</td>
            <td style={{ ...num, color: CACHE }} title={fmtFull(r.cacheRead)}>{fmtCompact(r.cacheRead)}</td>
            <td style={{ ...num, color: "rgba(255,255,255,0.45)" }} title={fmtFull(r.cacheCreate)}>{fmtCompact(r.cacheCreate)}</td>
            <td style={{ ...num, color: "rgba(255,255,255,0.3)" }}>{fmtCost(r.cost)}</td>
        </>
    );
}

const TOK_HEAD = (
    <>
        <th style={{ ...th, textAlign: "right" }}>turns</th>
        <th style={{ ...th, textAlign: "right", color: OUT }}>output</th>
        <th style={{ ...th, textAlign: "right", color: IN }}>input</th>
        <th style={{ ...th, textAlign: "right", color: CACHE }}>cache read</th>
        <th style={{ ...th, textAlign: "right" }}>cache write</th>
        <th style={{ ...th, textAlign: "right", color: "rgba(255,255,255,0.25)" }}>est $ (fyi)</th>
    </>
);

// Token accounting the owner can trust: today by default (local midnight),
// every session listed, who used what (model x main thread / subagent),
// numbers deduped by message id with subagent transcripts included. Cost is
// shown dimmed as an FYI - the owner is on a flat plan.
export default function TokensSection() {
    const { apiBase } = useMachine();
    const [since, setSince] = useState<Since>("today");
    const [limit, setLimit] = useState(PAGE);
    const url = apiBase(`/api/claude/tokens?since=${since}`);
    const { data, isFetching, isError, refetch } = useQuery<TokensData | null>({
        queryKey: ["tokens", url],
        queryFn: () => safeFetch<TokensData | null>(url, null),
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        placeholderData: prev => prev,
    });
    const t = data?.totals;
    const live = data?.sessions.filter(s => s.active).length ?? 0;
    const whoByRole = (data?.who ?? []).reduce<Record<Role, WhoRow[]>>((acc, w) => { acc[w.role].push(w); return acc; }, { main: [], agent: [] });

    return (
        <div style={{ ...cardShell, marginBottom: 20 }}>
            <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, marginBottom: 14 }}>
                <div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Tokens <span style={{ color: ACCENT }}>{SINCE_LABEL[since]}</span></p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>
                        full transcripts, deduped by message id, subagents included{data ? ` · ${data.sessions.length} sessions · as of ${fmtTs(data.generatedAt)}` : ""}{isFetching && !data ? " · scanning..." : ""}
                    </p>
                </div>
                <HeroSlot>
                    <SegmentedTabs<Since> tabs={WINDOW_TABS} value={since} onChange={s => { setSince(s); setLimit(PAGE); }} accent={ACCENT} />
                </HeroSlot>
            </div>

            {isError && <FetchError what="token stats" onRetry={() => refetch()} />}

            {t && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <BigStat label="Output tokens" value={fmtCompact(t.output)} sub={`${fmtCompact(t.mainOutput)} main thread · ${fmtCompact(t.agentOutput)} subagents`} icon={ArrowUpRight} color={OUT} />
                    <BigStat label="Input tokens" value={fmtCompact(t.input)} sub="uncached prompt tokens" icon={ArrowDownLeft} color={IN} />
                    <BigStat label="Cache read" value={fmtCompact(t.cacheRead)} sub={`${fmtCompact(t.cacheCreate)} written to cache`} icon={Database} color={CACHE} />
                    <BigStat label="Sessions" value={String(t.sessions)} sub={`${live} live now · ${t.agents} subagent runs · ${fmtFull(t.turns)} turns`} icon={Users} color={ACCENT} />
                </div>
            )}
            {t && (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "10px 0 0" }}>
                    FYI only: {fmtCost(t.cost)} is what this usage would cost at API list price. You are on a flat Max plan, so it is not a bill.
                </p>
            )}

            <Title>Who used what</Title>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}><th style={th}>model</th><th style={th}>role</th><th style={th}>share of output</th>{TOK_HEAD}</tr></thead>
                    <tbody>
                        {(["main", "agent"] as Role[]).flatMap(role => whoByRole[role].map(w => (
                            <tr key={`${w.model}-${w.role}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ ...td, fontFamily: MONO, color: "#fff", fontWeight: 600 }}>{shortModel(w.model)}</td>
                                <td style={td}><RoleTag role={w.role} /></td>
                                <td style={td}><Share value={w.share} color={ROLE[w.role].color} /></td>
                                <TokCells r={w} />
                            </tr>
                        )))}
                        {data && !data.who.length && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 20 }}>No usage {SINCE_LABEL[since]}</td></tr>}
                    </tbody>
                </table>
            </div>

            {data && data.projects.length > 0 && (
                <>
                    <Title>By project</Title>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}><th style={th}>project</th><th style={{ ...th, textAlign: "right" }}>sessions</th><th style={th}>share of output</th>{TOK_HEAD}</tr></thead>
                            <tbody>
                                {data.projects.map(p => (
                                    <tr key={p.project} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                        <td style={{ ...td, fontFamily: MONO, color: "#fff" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><AppIcon project={p.project} size={16} />{p.project}</span></td>
                                        <td style={num}>{p.sessions}</td>
                                        <td style={td}><Share value={t?.output ? p.output / t.output : 0} color={OUT} /></td>
                                        <TokCells r={p} />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}


            <Title>Sessions <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>{data?.sessions.length ?? 0}</span></Title>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                            <th style={{ ...th, width: 14 }} /><th style={th}>last activity</th><th style={th}>started</th><th style={th}>project</th><th style={th}>what</th><th style={th}>models</th><th style={{ ...th, textAlign: "right" }}>agents</th>{TOK_HEAD}
                        </tr>
                    </thead>
                    <tbody>
                        {(data?.sessions ?? []).slice(0, limit).map(s => (
                            <tr key={s.sessionId} title={s.sessionId} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={td}><span title={s.active ? "live: wrote in the last 5 min" : "closed or idle"} style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: s.active ? "#8AC249" : "rgba(255,255,255,0.15)", boxShadow: s.active ? "0 0 6px #8AC249" : "none" }} /></td>
                                <td style={{ ...td, color: s.active ? "#8AC249" : "rgba(255,255,255,0.6)" }}>{timeAgo(s.lastTs)}</td>
                                <td style={{ ...td, color: "rgba(255,255,255,0.45)" }}>{fmtTs(s.firstTs)}</td>
                                <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><AppIcon project={s.project} size={14} />{s.project}{s.branch && s.branch !== "main" ? <span style={{ color: "rgba(255,255,255,0.35)" }}> @{s.branch}</span> : null}</span></td>
                                <td style={{ ...td, whiteSpace: "normal", minWidth: 200, maxWidth: 380, color: "rgba(255,255,255,0.55)" }}>{s.title}</td>
                                <td style={{ ...td, fontFamily: MONO, fontSize: 10 }}>{s.models.map(shortModel).join(", ")}</td>
                                <td style={{ ...num, color: s.agents ? "#5AC8FA" : "rgba(255,255,255,0.3)" }}>{s.agents ? <><Bot size={10} style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />{s.agents}</> : 0}</td>
                                <TokCells r={s} />
                            </tr>
                        ))}
                        {data && !data.sessions.length && <tr><td colSpan={13} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 20 }}>No sessions {SINCE_LABEL[since]}</td></tr>}
                    </tbody>
                </table>
            </div>
            {data && data.sessions.length > limit && (
                <button type="button" onClick={() => setLimit(l => l + PAGE)} style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: ACCENT, background: "none", border: `1px solid color-mix(in srgb, ${ACCENT} 35%, transparent)`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>
                    show {Math.min(PAGE, data.sessions.length - limit)} more
                </button>
            )}
        </div>
    );
}
