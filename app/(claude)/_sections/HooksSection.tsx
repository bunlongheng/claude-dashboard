"use client";

import { useEffect, useState } from "react";
import { Webhook, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMachine } from "./MachineContext";

type HookInfo = { name: string; plugin: string; events: string[]; command?: string; path: string };

const COLOR = "#a3e635";

function HookCard({ hook }: { hook: HookInfo }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div style={{
            padding: "10px 14px", marginBottom: 4, borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                <Webhook size={13} style={{ color: COLOR }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{hook.plugin}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: `${COLOR}20`, color: COLOR }}>{hook.events.length} events</span>
            </div>
            {!expanded && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: "2px 0 0 24px" }}>{hook.name}</p>
            )}
            {expanded && (
                <div style={{ marginTop: 8, paddingLeft: 24 }}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>{hook.name}</p>
                    <div style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Events</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {hook.events.map(e => (
                                <span key={e} style={{
                                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                                    background: `${COLOR}15`, color: COLOR, border: `1px solid ${COLOR}30`,
                                }}>{e}</span>
                            ))}
                        </div>
                    </div>
                    {hook.command && (
                        <div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Command</span>
                            <pre style={{
                                marginTop: 4, padding: 8, borderRadius: 6,
                                background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)",
                                fontSize: 10, color: "rgba(255,255,255,0.5)", overflow: "auto",
                            }}>{hook.command}</pre>
                        </div>
                    )}
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 6, fontFamily: "monospace" }}>{hook.path.replace(/.*\.claude\//, "~/.claude/")}</p>
                </div>
            )}
        </div>
    );
}

export default function HooksSection() {
    const { machine } = useMachine();
    const [hooks, setHooks] = useState<HookInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [eventFilter, setEventFilter] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.json())
            .then(d => { setHooks(d.hooks ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [machine]);

    // Collect all unique event types
    const allEvents = [...new Set(hooks.flatMap(h => h.events))].sort();

    let filtered = hooks;
    if (eventFilter) filtered = filtered.filter(h => h.events.includes(eventFilter));
    if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(h => h.name.toLowerCase().includes(q) || h.plugin.toLowerCase().includes(q) || h.events.some(e => e.toLowerCase().includes(q)));
    }

    if (loading) return <p className="text-white/30 text-center py-16">Scanning…</p>;

    return (
        <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                    <button onClick={() => setEventFilter(null)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                        style={{
                            background: !eventFilter ? `${COLOR}20` : "rgba(255,255,255,0.03)",
                            border: !eventFilter ? `1px solid ${COLOR}40` : "1px solid rgba(255,255,255,0.06)",
                            color: !eventFilter ? COLOR : "rgba(255,255,255,0.4)",
                        }}>
                        All <span style={{ fontSize: 9, opacity: 0.6 }}>{hooks.length}</span>
                    </button>
                    {allEvents.map(evt => {
                        const active = eventFilter === evt;
                        return (
                            <button key={evt} onClick={() => setEventFilter(active ? null : evt)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                                style={{
                                    background: active ? `${COLOR}20` : "rgba(255,255,255,0.03)",
                                    border: active ? `1px solid ${COLOR}40` : "1px solid rgba(255,255,255,0.06)",
                                    color: active ? COLOR : "rgba(255,255,255,0.4)",
                                }}>
                                {evt}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hooks…"
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{filtered.length} hook{filtered.length !== 1 ? "s" : ""}</span>
            </div>
            {filtered.map(h => <HookCard key={h.plugin} hook={h} />)}
            {filtered.length === 0 && <p className="text-white/20 text-center py-8 text-sm">{search ? `No hooks matching "${search}"` : "No hooks found"}</p>}
        </div>
    );
}
