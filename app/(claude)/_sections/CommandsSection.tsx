"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Terminal, ChevronDown, ChevronRight,
    Pencil, Save, X, Check, Search,
} from "lucide-react";
import { ACCENT } from "./shared";
import { useMachine } from "./MachineContext";
import { useMemo } from "react";

type CommandInfo = { name: string; plugin: string; description: string; path: string; content: string; source?: "builtin" | "external" };

const COLOR = "#f472b6";

async function saveFile(filePath: string, content: string): Promise<boolean> {
    try {
        const r = await fetch("/api/claude/skills", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath, content }),
        });
        return r.ok;
    } catch { return false; }
}

function CommandCard({ cmd }: { cmd: CommandInfo }) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(cmd.content);
    const [draft, setDraft] = useState(cmd.content);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = useCallback(async () => {
        setSaving(true);
        const ok = await saveFile(cmd.path, draft);
        setSaving(false);
        if (ok) {
            setContent(draft);
            setEditing(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    }, [cmd.path, draft]);

    return (
        <div style={{
            padding: "10px 14px", marginBottom: 4, borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${editing ? `${COLOR}40` : "rgba(255,255,255,0.05)"}`,
            cursor: "pointer",
        }} onClick={() => { if (!editing) { setExpanded(!expanded); if (!expanded) setDraft(content); } }}>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                    <Terminal size={13} style={{ color: COLOR }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{cmd.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: `${COLOR}20`, color: COLOR }}>{cmd.plugin}</span>
                    {saved && <Check size={12} style={{ color: "#22c55e" }} />}
                </div>
                {expanded && !editing && (
                    <button onClick={() => { setEditing(true); setDraft(content); }} title="Edit"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.3)", display: "flex" }}>
                        <Pencil size={13} />
                    </button>
                )}
                {editing && (
                    <div className="flex items-center gap-1">
                        <button onClick={handleSave} disabled={saving} title="Save"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#22c55e", display: "flex", opacity: saving ? 0.5 : 1 }}>
                            <Save size={13} />
                        </button>
                        <button onClick={() => { setDraft(content); setEditing(false); }} title="Cancel"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#ef4444", display: "flex" }}>
                            <X size={13} />
                        </button>
                    </div>
                )}
            </div>
            {!expanded && cmd.description && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: "2px 0 0 24px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmd.description}</p>
            )}
            {expanded && !editing && (
                <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 8,
                    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)",
                    fontSize: 10, lineHeight: 1.5, color: "rgba(255,255,255,0.5)",
                    overflow: "auto", maxHeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>{content || "(empty)"}</pre>
            )}
            {expanded && editing && (
                <textarea value={draft} onChange={e => setDraft(e.target.value)}
                    style={{
                        marginTop: 8, padding: 12, borderRadius: 8, width: "100%",
                        background: "rgba(0,0,0,0.4)", border: `1px solid ${COLOR}40`,
                        fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                        minHeight: 200, maxHeight: 500, resize: "vertical",
                        fontFamily: "monospace", outline: "none",
                    }} />
            )}
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "4px 0 0", paddingLeft: 24, fontFamily: "monospace" }}>{cmd.path.replace(/.*\.claude\//, "~/.claude/")}</p>
        </div>
    );
}

type CmdFilter = "all" | "custom" | "builtin";

export default function CommandsSection() {
    const { machine } = useMachine();
    const [commands, setCommands] = useState<CommandInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<CmdFilter>("custom");

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.json())
            .then(d => { setCommands(d.commands ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [machine]);

    const filtered = useMemo(() => {
        let list = commands;
        if (filter === "custom") list = list.filter(c => c.source === "external");
        if (filter === "builtin") list = list.filter(c => c.source !== "external");
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(c => c.name.toLowerCase().includes(q) || c.plugin.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
        }
        return list;
    }, [commands, search, filter]);

    const customCount = commands.filter(c => c.source === "external").length;
    const builtinCount = commands.filter(c => c.source !== "external").length;

    if (loading) return <p className="text-white/30 text-center py-16">Scanning…</p>;

    const tabs: { label: string; value: CmdFilter; count: number; color: string }[] = [
        { label: "All", value: "all", count: commands.length, color: COLOR },
        { label: "Custom", value: "custom", count: customCount, color: "#22c55e" },
        { label: "Built-in", value: "builtin", count: builtinCount, color: "#94a3b8" },
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
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search commands…"
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{filtered.length} command{filtered.length !== 1 ? "s" : ""}</span>
            </div>
            {filtered.map(c => <CommandCard key={c.path} cmd={c} />)}
            {filtered.length === 0 && <p className="text-white/20 text-center py-8 text-sm">{search ? `No commands matching "${search}"` : "No commands found"}</p>}
        </div>
    );
}
