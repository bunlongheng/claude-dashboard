"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Puzzle, Zap, ChevronDown, ChevronRight, Send, Search, Pencil, Save, X, Check, Settings } from "lucide-react";
import { ACCENT } from "./shared";
import { useMachine, type MachineInfo } from "./MachineContext";
import { useToast } from "./ToastContext";

type PluginInfo = { name: string; description: string; path: string; type: "builtin" | "external" | "lsp" };
type SkillInfo = { name: string; plugin: string; description: string; path: string; source?: "builtin" | "external"; content?: string };

const COLORS = { skills: "#06b6d4", plugins: "#8b5cf6", external: "#22c55e", builtin: "#94a3b8" };

function Section({ title, icon: Icon, color, count, defaultOpen = true, children }: {
    title: string; icon: React.ElementType; color: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ marginBottom: 16 }}>
            <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left cursor-pointer mb-2">
                {open ? <ChevronDown size={14} style={{ color }} /> : <ChevronRight size={14} style={{ color }} />}
                <Icon size={14} style={{ color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{title}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>{count}</span>
            </button>
            {open && <div className="space-y-1">{children}</div>}
        </div>
    );
}

async function saveSkillFile(filePath: string, content: string): Promise<boolean> {
    try {
        const r = await fetch("/api/claude/skills", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath, content }),
        });
        return r.ok;
    } catch { return false; }
}

function SkillCard({ skill, currentMachine, otherMachines, showToast }: {
    skill: SkillInfo; currentMachine: string | null; otherMachines: MachineInfo[];
    showToast: (msg: string, color?: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(skill.content ?? "");
    const [draft, setDraft] = useState(skill.content ?? "");
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const handleSave = useCallback(async () => {
        setSaving(true);
        const ok = await saveSkillFile(skill.path, draft);
        setSaving(false);
        if (ok) {
            setContent(draft);
            setEditing(false);
            showToast("Saved");
        } else {
            showToast("Save failed", "#ef4444");
        }
    }, [skill.path, draft, showToast]);

    async function syncTo(targetId: string) {
        if (!currentMachine) return;
        setSyncing(true);
        setMenuOpen(false);
        try {
            const res = await fetch("/api/claude/sync-skill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from: currentMachine, to: targetId, plugin: skill.plugin, skill: skill.name }),
            });
            const data = await res.json();
            if (res.status === 409) {
                showToast(`"${skill.name}" already exists on target`, "#f59e0b");
            } else if (!res.ok) {
                showToast(data.error ?? "Sync failed", "#ef4444");
            } else {
                const target = otherMachines.find(m => m.id === targetId);
                showToast(`Copied "${skill.name}" to ${target?.hostname ?? targetId}`);
            }
        } catch {
            showToast("Sync failed", "#ef4444");
        } finally {
            setSyncing(false);
        }
    }

    return (
        <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${editing ? `${COLORS.skills}40` : "rgba(255,255,255,0.06)"}`,
            cursor: "pointer",
        }} onClick={() => { if (!editing) { setExpanded(!expanded); if (!expanded) setDraft(content); } }}>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{skill.name}</span>
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
                {otherMachines.length > 0 && (
                    <div style={{ position: "relative" }}>
                        <button onClick={() => setMenuOpen(!menuOpen)} disabled={syncing}
                            className="flex items-center text-[8px] font-bold p-1 rounded transition cursor-pointer hover:bg-white/10 disabled:opacity-30"
                            style={{ color: "rgba(255,255,255,0.35)" }}>
                            <Send size={8} />
                        </button>
                        {menuOpen && (
                            <div style={{
                                position: "absolute", top: "100%", right: 0, zIndex: 50, marginTop: 4,
                                background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 6, padding: 3, minWidth: 120, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                            }}>
                                <p style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", padding: "2px 6px", fontWeight: 700 }}>COPY TO</p>
                                {otherMachines.map(m => (
                                    <button key={m.id} onClick={() => syncTo(m.id)}
                                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-[10px] font-semibold transition-colors cursor-pointer hover:bg-white/10"
                                        style={{ color: "rgba(255,255,255,0.6)" }}>
                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                                        {m.hostname}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {!expanded && skill.description && skill.description !== skill.name && (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0 20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{skill.description}</p>
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
                        background: "rgba(0,0,0,0.4)", border: `1px solid ${COLORS.skills}40`,
                        fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                        minHeight: 200, maxHeight: 500, resize: "vertical",
                        fontFamily: "monospace", outline: "none",
                    }} />
            )}
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "4px 0 0", paddingLeft: 20, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {skill.path.replace(/.*\.claude\//, "~/.claude/")}
            </p>
        </div>
    );
}

function ItemCard({ name, description, badge, badgeColor }: {
    name: string; description: string; badge?: string; badgeColor?: string;
}) {
    return (
        <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        }}>
            <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{name}</span>
                {badge && (
                    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${badgeColor ?? ACCENT}20`, color: badgeColor ?? ACCENT }}>{badge}</span>
                )}
            </div>
            {description && description !== name && (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{description}</p>
            )}
        </div>
    );
}

type FilterTab = "all" | "custom" | "builtin";

export default function SkillsSection() {
    const { machine, machines } = useMachine();
    const { showToast } = useToast();
    const [skills, setSkills] = useState<SkillInfo[]>([]);
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
    const [localSettings, setLocalSettings] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter] = useState<FilterTab>("custom");
    const [search, setSearch] = useState("");

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.json())
            .then(d => {
                setSkills(d.skills ?? []);
                setPlugins(d.plugins ?? []);
                setSettings(d.settings ?? null);
                setLocalSettings(d.localSettings ?? null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [machine]);

    const otherMachines = machines.filter(m => m.id !== machine && m.online);

    const filteredSkills = useMemo(() => {
        let list = skills;
        if (filter === "custom") list = list.filter(s => s.source === "external");
        if (filter === "builtin") list = list.filter(s => s.source !== "external");
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(q) || s.plugin.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
        }
        return list;
    }, [skills, filter, search]);

    const customCount = skills.filter(s => s.source === "external").length;
    const builtinCount = skills.filter(s => s.source !== "external").length;

    if (loading) return <p className="text-white/30 text-center py-16">Scanning machine…</p>;

    const tabs: { label: string; value: FilterTab; count: number; color: string }[] = [
        { label: "All", value: "all", count: skills.length, color: COLORS.skills },
        { label: "Custom", value: "custom", count: customCount, color: COLORS.external },
        { label: "Built-in", value: "builtin", count: builtinCount, color: COLORS.builtin },
    ];

    return (
        <div>
            {/* Search bar */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-[10px] text-white/30">{customCount} custom skills</span>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search skills…"
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1"
                        style={{ outline: "none", border: "none" }}
                    />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
                    {filteredSkills.length} skill{filteredSkills.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Skills grid */}
            <Section title="Skills" icon={Zap} color={COLORS.skills} count={filteredSkills.length}>
                {filteredSkills.map(s => (
                    <SkillCard key={`${s.plugin}/${s.name}`} skill={s} currentMachine={machine} otherMachines={otherMachines} showToast={showToast} />
                ))}
                {filteredSkills.length === 0 && (
                    <p className="text-white/20 text-center py-8 text-[11px]">
                        {search ? `No skills matching "${search}"` : "No skills found"}
                    </p>
                )}
            </Section>

        </div>
    );
}
