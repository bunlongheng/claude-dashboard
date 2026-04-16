"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, Pencil, Save, X, Check, FileText } from "lucide-react";
import { marked } from "marked";
import { ACCENT } from "./shared";
import { useMachine } from "./MachineContext";
import ClaudeMdHistory from "./ClaudeMdHistory";

type ClaudeMdInfo = { name: string; path: string; content: string; scope: "global" | "project" };

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

function ClaudeMdEditor({ item }: { item: ClaudeMdInfo }) {
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(item.content);
    const [draft, setDraft] = useState(item.content);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = useCallback(async () => {
        setSaving(true);
        const ok = await saveFile(item.path, draft);
        setSaving(false);
        if (ok) {
            setContent(draft);
            setEditing(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    }, [item.path, draft]);

    return (
        <div className="bg-[#0f1117] border rounded-xl overflow-hidden mb-4"
            style={{ borderColor: editing ? `${ACCENT}40` : "rgba(255,255,255,0.08)" }}>
            <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex items-center gap-2">
                <FileText size={13} style={{ color: item.scope === "global" ? ACCENT : "#22c55e" }} />
                <span className="text-[11px] font-bold text-white/45">{item.name}</span>
                <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                    background: item.scope === "global" ? `${ACCENT}20` : "rgba(34,197,94,0.15)",
                    color: item.scope === "global" ? ACCENT : "#22c55e",
                }}>{item.scope}</span>
                <span className="text-[9px] text-white/15 ml-1">{item.path}</span>

                <div className="ml-auto flex items-center gap-1">
                    {saved && <Check size={12} style={{ color: "#22c55e" }} />}
                    {!editing && (
                        <button onClick={() => { setEditing(true); setDraft(content); }} title="Edit"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.3)", display: "flex" }}>
                            <Pencil size={13} />
                        </button>
                    )}
                    {editing && (
                        <>
                            <button onClick={handleSave} disabled={saving} title="Save"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#22c55e", display: "flex", opacity: saving ? 0.5 : 1 }}>
                                <Save size={13} />
                            </button>
                            <button onClick={() => { setDraft(content); setEditing(false); }} title="Cancel"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#ef4444", display: "flex" }}>
                                <X size={13} />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className="px-6 py-5">
                {!editing && content && (
                    <div
                        className="claude-md-prose"
                        style={{ fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.55)" }}
                        dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }}
                    />
                )}
                {!editing && !content && (
                    <p className="text-[10px] text-white/20 text-center py-6">No content — click edit to add</p>
                )}
                {editing && (
                    <textarea value={draft} onChange={e => setDraft(e.target.value)}
                        style={{
                            width: "100%", padding: 12, borderRadius: 8,
                            background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}30`,
                            fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.7)",
                            minHeight: 300, maxHeight: 600, resize: "vertical",
                            fontFamily: "monospace", outline: "none",
                        }} />
                )}
            </div>
        </div>
    );
}

export default function GlobalSection() {
    const { machine } = useMachine();
    const [claudeMdFiles, setClaudeMdFiles] = useState<ClaudeMdInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/skills${q}`)
            .then(r => r.json())
            .then(d => { setClaudeMdFiles(d.claudeMd ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [machine]);

    if (loading) return <p className="text-white/30 text-center py-16">Loading…</p>;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>
                    {claudeMdFiles.length} CLAUDE.md file{claudeMdFiles.length !== 1 ? "s" : ""} — identity, rules, and instructions
                </span>
                <ClaudeMdHistory />
            </div>
            {claudeMdFiles.map(c => <ClaudeMdEditor key={c.path} item={c} />)}
            {claudeMdFiles.length === 0 && <p className="text-white/20 text-center py-8 text-sm">No CLAUDE.md files found</p>}
        </div>
    );
}
