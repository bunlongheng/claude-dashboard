"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Pencil, Save, X, Check, Eye, EyeOff } from "lucide-react";
import { marked } from "marked";
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
    const [preview, setPreview] = useState(false);

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
        <div style={{
            background: "#0f1117", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, overflow: "hidden", marginBottom: 8,
        }}>
            {/* Header */}
            <div style={{
                padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 6,
            }}>
                <FileText size={11} style={{ color: "rgba(255,255,255,0.3)" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)" }}>{item.name}</span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>{item.path}</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {saved && <Check size={12} style={{ color: "#22c55e" }} />}
                    {!editing && (
                        <button onClick={() => setPreview(p => !p)} title={preview ? "Show code" : "Preview"}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: preview ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", display: "flex" }}>
                            {preview ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                    )}
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

            {/* Content */}
            <div style={{ padding: "10px 14px" }}>
                {!editing && !content && (
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "12px 0" }}>No content</p>
                )}
                {!editing && content && !preview && (
                    <pre style={{
                        fontSize: 11, lineHeight: 1.4, color: "rgba(255,255,255,0.7)",
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                        fontWeight: 400,
                    }}>{content}</pre>
                )}
                {!editing && content && preview && (
                    <div className="gh-md"
                        dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }}
                    />
                )}
                <style>{`
                    .gh-md { font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.8); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
                    .gh-md h1 { font-size: 18px; font-weight: 600; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin: 16px 0 8px; }
                    .gh-md h2 { font-size: 15px; font-weight: 600; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px; margin: 14px 0 6px; }
                    .gh-md h3 { font-size: 13px; font-weight: 600; color: #fff; margin: 10px 0 4px; }
                    .gh-md p { margin: 4px 0; }
                    .gh-md ul, .gh-md ol { padding-left: 20px; margin: 4px 0; }
                    .gh-md li { margin-bottom: 2px; }
                    .gh-md code { font-size: 11px; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-family: "SF Mono", "Fira Code", monospace; color: rgba(255,255,255,0.75); }
                    .gh-md pre { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 6px 0; }
                    .gh-md pre code { background: none; padding: 0; font-size: 11px; }
                    .gh-md table { border-collapse: collapse; width: 100%; margin: 6px 0; }
                    .gh-md th, .gh-md td { border: 1px solid rgba(255,255,255,0.1); padding: 4px 8px; font-size: 11px; text-align: left; }
                    .gh-md th { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6); }
                    .gh-md blockquote { border-left: 3px solid rgba(255,255,255,0.12); padding-left: 12px; color: rgba(255,255,255,0.5); margin: 6px 0; }
                    .gh-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 10px 0; }
                    .gh-md a { color: #58a6ff; text-decoration: none; }
                    .gh-md strong { color: rgba(255,255,255,0.9); }
                `}</style>
                {editing && (
                    <textarea value={draft} onChange={e => setDraft(e.target.value)}
                        style={{
                            width: "100%", padding: 0, borderRadius: 0,
                            background: "transparent", border: "none",
                            fontSize: 11, lineHeight: 1.4, color: "rgba(255,255,255,0.7)",
                            minHeight: 400, resize: "vertical",
                            fontFamily: "'SF Mono', 'Fira Code', monospace", outline: "none",
                            boxSizing: "border-box", fontWeight: 400,
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

    if (loading) return <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "64px 0" }}>Loading...</p>;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    {claudeMdFiles.length} file{claudeMdFiles.length !== 1 ? "s" : ""}
                </span>
                <ClaudeMdHistory />
            </div>
            {claudeMdFiles.map(c => <ClaudeMdEditor key={c.path} item={c} />)}
            {claudeMdFiles.length === 0 && <p style={{ color: "rgba(255,255,255,0.2)", textAlign: "center", padding: 32, fontSize: 13 }}>No CLAUDE.md files found</p>}
        </div>
    );
}
