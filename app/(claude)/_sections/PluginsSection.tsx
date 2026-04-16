"use client";

import { useEffect, useState, useMemo } from "react";
import { Puzzle, Search } from "lucide-react";
import { useMachine } from "./MachineContext";

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type PluginFilter = "all" | "builtin" | "external" | "lsp";

const TYPE_COLORS: Record<string, string> = { builtin: "#8b5cf6", external: "#22c55e", lsp: "#6b7280" };

export default function PluginsSection() {
    const { machine } = useMachine();
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<PluginFilter>("external");

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.json())
            .then(d => { setPlugins(d.plugins ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [machine]);

    const filtered = useMemo(() => {
        let list = plugins;
        if (filter !== "all") list = list.filter(p => p.type === filter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
        }
        return list;
    }, [plugins, filter, search]);

    if (loading) return <p className="text-white/30 text-center py-16">Scanning plugins...</p>;

    const counts = { builtin: plugins.filter(p => p.type === "builtin").length, external: plugins.filter(p => p.type === "external").length, lsp: plugins.filter(p => p.type === "lsp").length };

    const tabs: { label: string; value: PluginFilter; count: number; color: string }[] = [
        { label: "All", value: "all", count: plugins.length, color: "#8b5cf6" },
        { label: "Built-in", value: "builtin", count: counts.builtin, color: TYPE_COLORS.builtin },
        { label: "External", value: "external", count: counts.external, color: TYPE_COLORS.external },
        { label: "LSP", value: "lsp", count: counts.lsp, color: TYPE_COLORS.lsp },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    {tabs.map(t => (
                        <button key={t.value} onClick={() => setFilter(t.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                            style={{
                                background: filter === t.value ? `${t.color}20` : "rgba(255,255,255,0.03)",
                                border: filter === t.value ? `1px solid ${t.color}40` : "1px solid rgba(255,255,255,0.06)",
                                color: filter === t.value ? t.color : "rgba(255,255,255,0.4)",
                            }}>
                            {t.label}
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{t.count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plugins..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{filtered.length} plugin{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-1">
                {filtered.map(p => {
                    const color = TYPE_COLORS[p.type] ?? "#6b7280";
                    return (
                        <div key={p.name} style={{
                            padding: "10px 12px", borderRadius: 8,
                            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                        }}>
                            <div className="flex items-center gap-2 mb-1">
                                <Puzzle size={12} style={{ color }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{p.name}</span>
                                <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${color}20`, color }}>{p.type}</span>
                            </div>
                            {p.description && p.description !== p.name && (
                                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, paddingLeft: 20 }}>{p.description}</p>
                            )}
                            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "3px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                                {p.path.replace(/.*\.claude\//, "~/.claude/")}
                            </p>
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <p className="text-white/20 text-center py-8 text-[11px]">{search ? `No plugins matching "${search}"` : "No plugins found"}</p>
                )}
            </div>
        </div>
    );
}
