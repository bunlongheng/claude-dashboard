"use client";

import { useState, useMemo } from "react";
import {
    ChevronDownIcon, ChevronUpIcon, ClockIcon, CommandLineIcon, ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import {
    ACCENT, StatCard, SectionHeader,
    HistoryEntry, Note, Token, DrillTarget, Interval,
    filterByInterval, groupBy, calcCost, fmtNum, fmtCost, timeAgo, fmtTs,
} from "./shared";
import DrillPanel from "./DrillPanel";

const INTERVALS: { label: string; value: Interval }[] = [
    { label: "Today", value: "today" }, { label: "7 Days", value: "7d" },
    { label: "30 Days", value: "1m" }, { label: "All Time", value: "all" },
];

export default function PromptsSection({
    initialHistory,
    totalHistory,
    initialNotes,
}: {
    initialHistory: HistoryEntry[];
    totalHistory: number;
    initialNotes: Note[];
}) {
    const [interval, setIntervalFilter] = useState<Interval>("today");
    const [drill, setDrill] = useState<DrillTarget>(null);
    const [tokens] = useState<Token[]>([]);
    const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");

    const filtered = useMemo(() => filterByInterval(Array.isArray(initialHistory) ? initialHistory : [], interval), [initialHistory, interval]);
    const allSessions = useMemo(() => groupBy(filtered, e => e.sessionId ?? "unknown"), [filtered]);
    const sessions = useMemo(() => {
        if (!searchQuery.trim()) return allSessions;
        const q = searchQuery.trim().toLowerCase();
        const result = new Map<string, HistoryEntry[]>();
        for (const [sid, entries] of allSessions) {
            const matchesId = sid.toLowerCase().includes(q);
            const matchesPrompt = entries.some(e => e.display.toLowerCase().includes(q));
            if (matchesId || matchesPrompt) result.set(sid, entries);
        }
        return result;
    }, [allSessions, searchQuery]);
    const uniqueProjects = useMemo(() => new Set(filtered.map(e => e.project).filter(Boolean)), [filtered]);

    const totalIn   = useMemo(() => tokens.reduce((s, t) => s + t.input_tokens, 0), [tokens]);
    const totalOut  = useMemo(() => tokens.reduce((s, t) => s + t.output_tokens, 0), [tokens]);
    const totalCost = useMemo(() => tokens.reduce((s, t) => s + calcCost(t), 0), [tokens]);

    const isLocal = totalHistory > 0;

    const toggleSession = (id: string) =>
        setExpandedSessions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
        <>
            {drill && (
                <DrillPanel
                    target={drill}
                    history={initialHistory}
                    tokens={tokens}
                    onClose={() => setDrill(null)}
                    interval={interval}
                />
            )}

            {/* Interval filter */}
            <div className="flex gap-1.5 mb-4">
                {INTERVALS.map(({ label, value }) => (
                    <button key={value} onClick={() => setIntervalFilter(value)}
                        className="px-2 py-1 rounded-md text-[10px] font-bold transition-colors"
                        style={{
                            background: interval === value ? "rgba(0,217,255,0.12)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${interval === value ? "rgba(0,217,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                            color: interval === value ? ACCENT : "rgba(255,255,255,0.4)",
                        }}>{label}
                    </button>
                ))}
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                <StatCard label="PROMPTS"       value={filtered.length}          sub={interval === "today" ? "today" : interval === "7d" ? "last 7d" : interval === "1m" ? "last 30d" : "all time"} onClick={() => setDrill("prompts")} />
                <StatCard label="SESSIONS"      value={sessions.size}            color="#22c55e" onClick={() => setDrill("sessions")} />
                <StatCard label="PROJECTS"      value={uniqueProjects.size}      color="#ff8800" onClick={() => setDrill("projects")} />
                <StatCard label="TOTAL PROMPTS" value={totalHistory}             color="#9933ff" sub="all time" onClick={() => setDrill("prompts")} />
                <StatCard label="TOKENS"        value={fmtNum(totalIn + totalOut)} sub={`${fmtCost(totalCost)} est. cost`} color="#f59e0b" onClick={() => setDrill("tokens")} />
            </div>

            {/* Session History */}
            <section>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <SectionHeader icon={ClockIcon} title={`Session History (${sessions.size} sessions, ${filtered.length} prompts)`} />
                    <input type="text" placeholder="search session or prompt…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        style={{ marginLeft: "auto", fontSize: "11px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 10px", color: "#ffffff", outline: "none", width: "180px", minWidth: "0" }} />
                </div>
                {!isLocal ? (
                    <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl p-6 text-center">
                        <CommandLineIcon className="w-5 h-5 text-white/20 mx-auto mb-2" />
                        <p className="text-white/40 text-sm">Run <code className="text-white/60 bg-white/5 px-1.5 py-0.5 rounded">node ~/claude-sync.mjs</code> to sync session history</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {[...sessions.entries()].map(([sessionId, entries]) => {
                            const isExpanded = expandedSessions.has(sessionId);
                            const latest = entries[0];
                            const project = latest.project?.split("/").pop() ?? "unknown";
                            const sessionTokens = tokens.find(t => t.session_id === sessionId);
                            return (
                                <div key={sessionId} className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden">
                                    <button type="button" onClick={() => toggleSession(sessionId)}
                                        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-white/3 transition-colors text-left">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <CommandLineIcon className="w-3 h-3 shrink-0" style={{ color: ACCENT }} />
                                            <p className="text-[11px] font-bold text-white truncate">{project}</p>
                                            <p className="text-[9px] text-white/35 shrink-0">{entries.length}p · {fmtTs(latest.timestamp)}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {sessionTokens && <span className="text-[9px] font-mono text-amber-400">{fmtNum(sessionTokens.input_tokens + sessionTokens.output_tokens)}t</span>}
                                            <span className="text-[9px] text-white/20 font-mono">{sessionId.slice(0, 6)}</span>
                                            {isExpanded ? <ChevronUpIcon className="w-3 h-3 text-white/30" /> : <ChevronDownIcon className="w-3 h-3 text-white/30" />}
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="border-t border-white/8 divide-y divide-white/4">
                                            {entries.map((e, i) => (
                                                <div key={i} className="px-3 py-1 flex items-start gap-2">
                                                    <span className="text-[9px] text-white/25 font-mono shrink-0 mt-0.5 w-12">{timeAgo(e.timestamp)}</span>
                                                    <p className="text-[10px] text-white/65 leading-snug line-clamp-1">{e.display}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {sessions.size === 0 && <p className="text-white/30 text-sm text-center py-8">No sessions in this time range.</p>}
                    </div>
                )}
            </section>

            {/* Notes */}
            {initialNotes.length > 0 && (
                <section className="mt-6">
                    <SectionHeader icon={ClipboardDocumentIcon} title={`Claude Notes (${initialNotes.length})`} />
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {initialNotes.map(note => (
                            <div key={note.id} className="bg-[#0f1117] border border-white/[0.08] rounded-xl px-3 py-2"
                                style={{ borderTopColor: note.folder_color, borderTopWidth: 2 }}>
                                <p className="text-[11px] font-black text-white mb-0.5 line-clamp-1">{(note as any).title}</p>
                                <p className="text-[10px] text-white/45 leading-snug line-clamp-2">{note.content}</p>
                                <p className="text-[9px] text-white/25 mt-1">{new Date(note.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </>
    );
}
