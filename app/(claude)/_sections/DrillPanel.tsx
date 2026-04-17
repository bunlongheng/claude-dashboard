"use client";

import { useMemo, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
    ACCENT, HistoryEntry, Token, DrillTarget, Interval,
    filterByInterval, groupBy, calcCost, fmtNum, fmtCost, fmtTs,
} from "./shared";

export default function DrillPanel({ target, history, tokens, onClose, interval }: {
    target: DrillTarget; history: HistoryEntry[]; tokens: Token[];
    onClose: () => void; interval: Interval;
}) {
    const filtered = useMemo(() => filterByInterval(history, interval), [history, interval]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const sessions  = useMemo(() => groupBy(filtered, e => e.sessionId ?? "unknown"), [filtered]);
    const projects  = useMemo(() => groupBy(filtered, e => e.project?.split("/").pop() ?? "unknown"), [filtered]);
    const totalCost = useMemo(() => tokens.reduce((s, t) => s + calcCost(t), 0), [tokens]);

    const titles: Record<NonNullable<DrillTarget>, string> = {
        prompts:  `Prompts (${filtered.length})`,
        sessions: `Sessions (${sessions.size})`,
        projects: `Projects (${projects.size})`,
        tokens:   `Token Usage - ${fmtCost(totalCost)} total`,
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-xl bg-[#0d0e17] border-l border-white/10 h-full overflow-y-auto flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 sticky top-0 bg-[#0d0e17] z-10">
                    <h2 className="text-sm font-black text-white">{target && titles[target]}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-2 flex-1">
                    {target === "prompts" && filtered.map((e, i) => (
                        <div key={i} className="bg-white/3 border border-white/6 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] text-white/70 leading-relaxed line-clamp-3">{e.display}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-[10px] text-white/30">{fmtTs(e.timestamp)}</span>
                                {e.project && <span className="text-[10px] text-white/25 truncate">{e.project.split("/").pop()}</span>}
                            </div>
                        </div>
                    ))}

                    {target === "sessions" && [...sessions.entries()].map(([sid, entries]) => (
                        <div key={sid} className="bg-white/3 border border-white/6 rounded-lg px-3 py-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-bold text-white truncate">{entries[0].project?.split("/").pop() ?? "unknown"}</p>
                                <span className="text-[10px] font-bold" style={{ color: ACCENT }}>{entries.length} prompts</span>
                            </div>
                            <p className="text-[10px] text-white/30 font-mono">{sid.slice(0, 16)}…</p>
                            <p className="text-[10px] text-white/25 mt-0.5">{fmtTs(entries[0].timestamp)}</p>
                        </div>
                    ))}

                    {target === "projects" && [...projects.entries()]
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([proj, entries]) => (
                            <div key={proj} className="bg-white/3 border border-white/6 rounded-lg px-3 py-2.5 flex items-center justify-between">
                                <p className="text-xs font-bold text-white">{proj}</p>
                                <div className="text-right">
                                    <p className="text-sm font-black" style={{ color: ACCENT }}>{entries.length}</p>
                                    <p className="text-[10px] text-white/30">prompts</p>
                                </div>
                            </div>
                        ))}

                    {target === "tokens" && (
                        <>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                {[
                                    { label: "Input",         val: tokens.reduce((s,t) => s + t.input_tokens, 0),          color: ACCENT },
                                    { label: "Output",        val: tokens.reduce((s,t) => s + t.output_tokens, 0),         color: "#22c55e" },
                                    { label: "Cache Read",    val: tokens.reduce((s,t) => s + t.cache_read_tokens, 0),     color: "#9333ea" },
                                    { label: "Cache Created", val: tokens.reduce((s,t) => s + t.cache_creation_tokens, 0), color: "#f59e0b" },
                                ].map(({ label, val, color }) => (
                                    <div key={label} className="bg-white/3 border border-white/6 rounded-lg p-3">
                                        <p className="text-[10px] text-white/40 font-bold tracking-widest">{label.toUpperCase()}</p>
                                        <p className="text-lg font-black mt-0.5" style={{ color }}>{fmtNum(val)}</p>
                                    </div>
                                ))}
                            </div>
                            {tokens
                                .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
                                .map(t => {
                                    const cost = calcCost(t);
                                    const total = t.input_tokens + t.output_tokens;
                                    return (
                                        <div key={t.session_id} className="bg-white/3 border border-white/6 rounded-lg px-3 py-2.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-white truncate">{t.project?.split("/").pop() ?? "unknown"}</p>
                                                    <p className="text-[10px] text-white/30 font-mono mt-0.5">{t.session_id.slice(0, 12)}…</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-black" style={{ color: ACCENT }}>{fmtNum(total)}</p>
                                                    <p className="text-[10px] text-green-400 font-bold">{fmtCost(cost)}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 mt-2 text-[10px] text-white/30">
                                                <span>↑ {fmtNum(t.input_tokens)} in</span>
                                                <span>↓ {fmtNum(t.output_tokens)} out</span>
                                                <span>⚡ {fmtNum(t.cache_read_tokens)} cached</span>
                                                {t.model && <span className="ml-auto text-white/20">{t.model.replace("claude-", "")}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
