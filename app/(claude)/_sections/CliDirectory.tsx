"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, AlertTriangle } from "lucide-react";
import { useMachine } from "./MachineContext";
import { safeFetch, SegmentedTabs, fmtCompact, fmtCost, fmtTs, timeAgo } from "./shared";
import { cardShell } from "@/lib/ui-tokens";
import { VerdictChip, Spark, VERDICT, MONO, th, td, num, WIN_LABEL, UNIT_LABEL } from "./McpLogPanel";
import { cliIconFor } from "./cliIcons";
import { CLI_DESCRIPTIONS, cliTargetNoun } from "@/lib/cli-tools";
import type { CliLogData, CliToolStat, Win } from "@/app/api/claude/cli-log/route";

type Filter = "all" | "never" | "new";
type Sort = "calls" | "recent" | "name";
type Row = { name: string; builtIn: boolean; stat: CliToolStat | null };

const ACCENT = "#34C759";

function Chips({ title, items }: { title: string; items: string[] }) {
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

// Every built-in tool in 1 list with its usage in the page window: the 28
// known tools plus anything the harness added since (called but not yet in
// the list). Click a row to see what the tool was aimed at - the commands
// Bash ran, the agent types launched, the file types read.
export default function CliDirectory({ win }: { win: Win }) {
    const { apiBase } = useMachine();
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<Sort>("calls");
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<string | null>(null);
    const url = apiBase(`/api/claude/cli-log?win=${win}`);
    const { data } = useQuery<CliLogData | null>({
        queryKey: ["cli-log", url],
        queryFn: () => safeFetch<CliLogData | null>(url, null),
        refetchInterval: 300_000,
        refetchOnWindowFocus: false,
        placeholderData: prev => prev,
    });

    const rows = useMemo(() => {
        const byName = new Map<string, Row>();
        for (const name of Object.keys(CLI_DESCRIPTIONS)) byName.set(name, { name, builtIn: true, stat: null });
        for (const s of data?.servers ?? []) {
            const r = byName.get(s.server);
            if (r) r.stat = s;
            else byName.set(s.server, { name: s.server, builtIn: false, stat: s });
        }
        return [...byName.values()];
    }, [data]);

    const match = (r: Row, f: Filter) => f === "all" || (f === "never" ? !r.stat?.calls : !r.builtIn);
    const count = (f: Filter) => rows.filter(r => match(r, f)).length;
    const needle = q.trim().toLowerCase();
    const shown = rows
        .filter(r => match(r, filter))
        .filter(r => !needle || r.name.toLowerCase().includes(needle) || (CLI_DESCRIPTIONS[r.name] ?? "").toLowerCase().includes(needle) || (r.stat?.tools ?? []).some(t => t.tool.toLowerCase().includes(needle)))
        .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
            : sort === "recent" ? (b.stat?.lastUsed ?? 0) - (a.stat?.lastUsed ?? 0) || a.name.localeCompare(b.name)
            : (b.stat?.calls ?? 0) - (a.stat?.calls ?? 0) || a.name.localeCompare(b.name));
    const recent = data?.recent ?? [];

    return (
        <div style={{ ...cardShell, marginBottom: 20 }}>
            <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, marginBottom: 14 }}>
                <div>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>All built-in tools <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>{rows.length}</span></p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>the harness tools every session can call · usage {WIN_LABEL[win]} · click a row to see what each one was aimed at</p>
                </div>
                <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 180 }}>
                        <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="tool, command or file type..." aria-label="Search built-in tools"
                            className="bg-transparent text-[11px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                    </div>
                    <SegmentedTabs<Sort> tabs={[{ key: "calls", label: "Most called" }, { key: "recent", label: "Last called" }, { key: "name", label: "A-Z" }]} value={sort} onChange={setSort} accent={ACCENT} />
                </div>
            </div>
            <div style={{ marginBottom: 12 }}>
                <SegmentedTabs<Filter> value={filter} onChange={setFilter} accent={ACCENT}
                    tabs={[{ key: "all", label: "All", count: count("all") }, { key: "never", label: "Never called", count: count("never") }, { key: "new", label: "Not in the list", count: count("new") }]} />
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                            <th style={{ ...th, width: 20 }} />
                            <th style={th}>tool</th><th style={th}>does</th><th style={th}>verdict</th>
                            <th style={{ ...th, textAlign: "right" }}>calls</th><th style={{ ...th, textAlign: "right" }}>err</th><th style={{ ...th, textAlign: "right" }}>result tok</th><th style={{ ...th, textAlign: "right" }}>cost</th>
                            <th style={th}>last called</th><th style={th}>calls {data ? UNIT_LABEL[data.buckets.unit] : ""}</th><th style={{ ...th, textAlign: "right" }}>targets</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map(r => {
                            const isOpen = open === r.name;
                            const s = r.stat;
                            const verdict = s?.verdict ?? "idle";
                            const Icon = cliIconFor(r.name);
                            const mine = recent.filter(c => c.server === r.name).slice(0, 8);
                            const noun = cliTargetNoun(r.name);
                            return [
                                <tr key={r.name} onClick={() => setOpen(isOpen ? null : r.name)}
                                    style={{ cursor: "pointer", borderBottom: isOpen ? "none" : "1px solid rgba(255,255,255,0.04)", background: isOpen ? `color-mix(in srgb, ${ACCENT} 6%, transparent)` : undefined }}>
                                    <td style={td}><ChevronRight size={12} style={{ color: "rgba(255,255,255,0.4)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} /></td>
                                    <td style={{ ...td, fontFamily: MONO, fontWeight: 600, color: isOpen ? ACCENT : "#fff" }}>
                                        <span className="inline-flex items-center" style={{ gap: 7 }}><Icon size={13} style={{ color: ACCENT, flexShrink: 0 }} />{r.name}</span>
                                    </td>
                                    <td style={{ ...td, color: "rgba(255,255,255,0.45)" }}>{CLI_DESCRIPTIONS[r.name] ?? "not in the built-in list yet"}</td>
                                    <td style={td}><VerdictChip v={verdict} label={verdict === "gone" ? "new" : undefined} /></td>
                                    <td style={num}>{(s?.calls ?? 0).toLocaleString()}</td>
                                    <td style={{ ...num, color: s?.errors ? "#ef4444" : "rgba(255,255,255,0.3)" }}>{s?.errors ?? 0}</td>
                                    <td style={num}>{s?.tokens ? fmtCompact(s.tokens) : "-"}</td>
                                    <td style={num}>{s?.cost ? fmtCost(s.cost) : "-"}</td>
                                    <td style={{ ...td, color: s?.lastUsed ? "rgba(255,255,255,0.6)" : "#ef4444" }}>{s?.lastUsed ? timeAgo(s.lastUsed) : "never"}</td>
                                    <td style={td}>{s && data ? <Spark series={s.series} labels={data.buckets.labels} color={VERDICT[verdict].color} /> : null}</td>
                                    <td style={num}>{s?.tools.length ?? 0}</td>
                                </tr>,
                                isOpen && (
                                    <tr key={`${r.name}-detail`} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: `color-mix(in srgb, ${ACCENT} 3%, transparent)` }}>
                                        <td colSpan={11} style={{ padding: "6px 12px 16px 32px", whiteSpace: "normal" }}>
                                            <div style={{ maxWidth: "calc(100vw - 320px)" }}>
                                            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20 }}>
                                                <div>
                                                    <div style={{ ...th, padding: "0 0 6px" }}>usage</div>
                                                    {[["does", CLI_DESCRIPTIONS[r.name] ?? "-"], ["first call", s?.firstUsed ? fmtTs(s.firstUsed) : "never"], ["last call", s?.lastUsed ? fmtTs(s.lastUsed) : "never"],
                                                      ["sessions", String(s?.sessions ?? 0)], ["result tokens", fmtCompact(s?.tokens ?? 0)], ["cost", fmtCost(s?.cost ?? 0)]].map(([k, v]) => (
                                                        <div key={k} className="flex" style={{ gap: 10, padding: "3px 0", fontSize: 11 }}>
                                                            <span style={{ width: 86, flexShrink: 0, color: "rgba(255,255,255,0.4)" }}>{k}</span>
                                                            <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.75)", wordBreak: "break-all" }}>{v}</span>
                                                        </div>
                                                    ))}
                                                    <div style={{ ...th, padding: "10px 0 4px" }}>why: {s?.reason ?? "no calls recorded"}</div>
                                                    <Chips title="projects" items={s?.projects ?? []} />
                                                    <Chips title="skills that called it" items={Object.entries(s?.skills ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `/${k} ${n}`)} />
                                                    <Chips title="models" items={Object.entries(s?.models ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace(/^claude-/, "")} ${n}`)} />
                                                </div>
                                                <div>
                                                    <div style={{ ...th, padding: "0 0 4px" }}>{noun} by calls</div>
                                                    {s?.tools.length ? (
                                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                            <tbody>
                                                                {s.tools.slice(0, 25).map(t => (
                                                                    <tr key={t.tool} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                                                        <td style={{ ...td, fontFamily: MONO, padding: "4px 6px 4px 0", whiteSpace: "normal", wordBreak: "break-all" }}>{t.tool}</td>
                                                                        <td style={{ ...num, padding: "4px 6px", color: ACCENT }}>{t.calls}</td>
                                                                        <td style={{ ...num, padding: "4px 6px", color: t.errors ? "#ef4444" : "rgba(255,255,255,0.3)" }}>{t.errors} err</td>
                                                                        <td style={{ ...num, padding: "4px 6px" }}>{fmtCompact(t.tokens)} tok</td>
                                                                        <td style={{ ...td, padding: "4px 0 4px 6px", color: "rgba(255,255,255,0.45)" }}>{timeAgo(t.lastUsed)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>Not called {WIN_LABEL[win]}.</p>}
                                                    {(s?.tools.length ?? 0) > 25 && <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "6px 0 0" }}>top 25 of {s?.tools.length} {noun}</p>}
                                                </div>
                                            </div>
                                            {mine.length > 0 && (
                                                <div style={{ marginTop: 14 }}>
                                                    <div style={{ ...th, padding: "0 0 4px" }}>last calls</div>
                                                    {mine.map((c, i) => (
                                                        <div key={`${c.ts}-${i}`} className="flex items-baseline" style={{ gap: 10, padding: "3px 0", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                                            <span style={{ width: 110, flexShrink: 0, color: "rgba(255,255,255,0.45)" }}>{fmtTs(c.ts)}</span>
                                                            <span style={{ fontFamily: MONO, color: "#fff", flexShrink: 0 }}>{c.isError && <AlertTriangle size={10} style={{ color: "#ef4444", display: "inline", marginRight: 4, verticalAlign: -1 }} />}{c.tool}</span>
                                                            <span style={{ color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>{c.project}</span>
                                                            <span style={{ color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 0" }} title={c.prompt}>{c.prompt || "-"}</span>
                                                            <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, color: "rgba(255,255,255,0.5)" }}>{fmtCompact(c.resultTokens)} · {fmtCost(c.cost)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            </div>
                                        </td>
                                    </tr>
                                ),
                            ];
                        })}
                        {!shown.length && <tr><td colSpan={11} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 24 }}>{data ? "No tool matches" : "Scanning transcripts..."}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
