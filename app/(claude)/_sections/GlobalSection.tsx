"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code2, Pencil, Save, X, Check, Eye, EyeOff } from "lucide-react";
import { marked } from "marked";
import { useMachine } from "./MachineContext";
import ClaudeMdHistory from "./ClaudeMdHistory";
import { MascotLoader } from "./MascotLoader";

type ClaudeMdInfo = { name: string; path: string; content: string; scope: "global" | "project" };

async function saveFile(apiBase: (p: string) => string, filePath: string, content: string): Promise<boolean> {
    try {
        const r = await fetch(apiBase("/api/claude/skills"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath, content }),
        });
        return r.ok;
    } catch { return false; }
}

function ClaudeMdEditor({ item }: { item: ClaudeMdInfo }) {
    const { apiBase } = useMachine();
    const [content, setContent] = useState(item.content);
    const [draft, setDraft] = useState(item.content);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [preview, setPreview] = useState(false);
    const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSave = useCallback(async (text: string) => {
        if (text === content) return;
        setSaving(true);
        const ok = await saveFile(apiBase, item.path, text);
        setSaving(false);
        if (ok) {
            setContent(text);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    }, [item.path, apiBase, content]);

    const onDraftChange = useCallback((text: string) => {
        setDraft(text);
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(() => handleSave(text), 5000);
    }, [handleSave]);

    const onBlur = useCallback(() => {
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        handleSave(draft);
    }, [draft, handleSave]);

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
                <Code2 size={11} style={{ color: "#FF9500", filter: "drop-shadow(0 0 4px rgba(255,149,0,0.4))" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)" }}>{item.name}</span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{item.path}</span>
                <span style={{
                    fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                    background: content.split("\n").length > 200 ? "rgba(239,68,68,0.15)" : "rgba(255,149,0,0.15)",
                    color: content.split("\n").length > 200 ? "#ef4444" : "#FF9500",
                }}>{content.split("\n").length} lines</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {saving && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>saving...</span>}
                    {saved && <Check size={12} style={{ color: "#22c55e" }} />}
                    {!preview && draft !== content && (
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} title="Unsaved changes" />
                    )}
                    <button onClick={() => setPreview(p => !p)} title={preview ? "Edit" : "Preview"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: preview ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", display: "flex" }}>
                        {preview ? <Eye size={13} /> : <Pencil size={13} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: "10px 14px" }}>
                {!preview && (
                    <div style={{ display: "flex", gap: 0, margin: 0 }}>
                        <div style={{
                            padding: "0 10px 0 0", textAlign: "right", userSelect: "none",
                            borderRight: "1px solid rgba(255,255,255,0.06)", marginRight: 0,
                            flexShrink: 0, minWidth: 32,
                        }}>
                            {draft.split("\n").map((_, i) => (
                                <div key={i} style={{
                                    fontSize: 11, lineHeight: "18.2px", color: "rgba(255,255,255,0.45)",
                                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                                }}>{i + 1}</div>
                            ))}
                        </div>
                        <textarea value={draft} onChange={e => onDraftChange(e.target.value)} onBlur={onBlur}
                            spellCheck={false}
                            style={{
                                width: "100%", padding: "0 0 0 12px", borderRadius: 0,
                                background: "transparent", border: "none",
                                fontSize: 11, lineHeight: "18.2px", color: "rgba(255,255,255,0.7)",
                                minHeight: 400, resize: "vertical",
                                fontFamily: "'SF Mono', 'Fira Code', monospace", outline: "none",
                                boxSizing: "border-box", fontWeight: 400, flex: 1,
                            }} />
                    </div>
                )}
                {preview && content && (
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
            </div>

        </div>
    );
}

export default function GlobalSection() {
    const { machine, apiBase } = useMachine();

    const q = machine ? `?machine=${machine}` : "";
    const skillsUrl = apiBase(`/api/claude/skills${q}`);
    const { data, isFetching: loading } = useQuery({
        queryKey: ["claude-md-files", skillsUrl],
        queryFn: async () => {
            const r = await fetch(skillsUrl);
            return r.json();
        },
    });
    const claudeMdFiles: ClaudeMdInfo[] = data?.claudeMd ?? [];

    if (loading) return <MascotLoader label="Loading" />;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    {claudeMdFiles.length} file{claudeMdFiles.length !== 1 ? "s" : ""}
                </span>
                <ClaudeMdHistory />
            </div>
            {claudeMdFiles.map(c => <ClaudeMdEditor key={c.path} item={c} />)}
            {claudeMdFiles.length === 0 && <p style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", padding: 32, fontSize: 13 }}>No CLAUDE.md files found</p>}
        </div>
    );
}
