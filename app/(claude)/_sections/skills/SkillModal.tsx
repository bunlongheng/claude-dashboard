"use client";

import { memo, useState, useMemo, useCallback, useEffect, createElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Save, X, Send, Copy, Eye, Code2, Download } from "lucide-react";
import { safeMarkdown } from "@/lib/safe-markdown";
import { useMachine, type MachineInfo } from "../MachineContext";
import { getSkillIcon, cleanName } from "./skillIcons";
import type { SkillInfo } from "./types";

async function saveSkillFile(apiBase: (p: string) => string, filePath: string, content: string): Promise<boolean> {
    try {
        const r = await fetch(apiBase("/api/claude/skills"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePath, content }),
        });
        return r.ok;
    } catch { return false; }
}

// ── Skill Modal ─────────────────────────────────────────────────────────────
function SkillModalImpl({ skill, color, onClose, currentMachine, otherMachines, showToast }: {
    skill: SkillInfo; color: string; onClose: () => void;
    currentMachine: string | null; otherMachines: MachineInfo[];
    showToast: (msg: string, color?: string) => void;
}) {
    const { apiBase } = useMachine();
    const [tab, setTab] = useState<"preview" | "code">("preview");
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    // Set once a Save succeeds, so the modal keeps showing the freshly-saved
    // text instead of whatever the (now-stale) fetched content was.
    const [savedContent, setSavedContent] = useState<string | null>(null);

    // The skill list endpoint is called with ?slim=1, which strips `content` to keep the
    // payload small. When the modal opens for a skill without inline content, fetch the
    // single file from the same machine via /api/claude/skills?path=...
    const needsContent = !skill.content && !!skill.path;
    const contentQuery = useQuery({
        queryKey: ["skill-content", skill.path],
        queryFn: async (): Promise<string> => {
            try {
                const r = await fetch(apiBase(`/api/claude/skills?path=${encodeURIComponent(skill.path)}`), { cache: "no-store" });
                const d = r.ok ? await r.json() : { content: "" };
                return d.content ?? "";
            } catch { return ""; }
        },
        enabled: needsContent,
    });
    const content = savedContent ?? skill.content ?? contentQuery.data ?? "";
    const contentLoading = needsContent && contentQuery.isLoading;

    const [draft, setDraft] = useState(content);

    const handleSave = useCallback(async () => {
        setSaving(true);
        const ok = await saveSkillFile(apiBase, skill.path, draft);
        setSaving(false);
        if (ok) { setSavedContent(draft); setEditing(false); showToast("Saved"); }
        else showToast("Save failed", "#ef4444");
    }, [skill.path, draft, showToast, apiBase]);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        showToast("Copied to clipboard");
    };

    const handleDownload = () => {
        const filename = (skill.path?.split("/").pop()) || `${skill.name}.md`;
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        showToast(`Downloaded ${filename}`);
    };

    // Strip the YAML frontmatter before rendering markdown (don't show '---' blocks).
    const bodyMd = useMemo(() => {
        const m = content.match(/^---\n[\s\S]*?\n---\n?/);
        return m ? content.slice(m[0].length) : content;
    }, [content]);
    const previewHtml = useMemo(() => safeMarkdown(bodyMd, { breaks: false, gfm: true }), [bodyMd]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function syncTo(targetId: string) {
        try {
            const res = await fetch(apiBase("/api/claude/sync-skill"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from: currentMachine, to: targetId, plugin: skill.plugin, skill: skill.name }),
            });
            if (res.ok) {
                const target = otherMachines.find(m => m.id === targetId);
                showToast(`Copied to ${target?.hostname ?? targetId}`);
            } else showToast("Sync failed", "#ef4444");
        } catch { showToast("Sync failed", "#ef4444"); }
    }

    // Rendered via createElement (not JSX <Icon />) so picking one of a fixed
    // set of existing Lucide components doesn't read as "creating a component
    // during render" to the react-hooks/static-components lint check.
    const skillIconEl = createElement(getSkillIcon(skill.name), { size: 16, style: { color: "#fff" } });

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
        }} onClick={onClose} role="dialog" aria-modal="true">
            <div onClick={e => e.stopPropagation()} style={{
                // Wider modal so multi-page skill READMEs actually
                // breathe instead of word-wrapping every other token.
                width: "100%", maxWidth: 960, maxHeight: "90vh",
                background: "#12131a", borderRadius: 16,
                border: `1px solid ${color}30`,
                boxShadow: `0 0 60px ${color}15, 0 20px 60px rgba(0,0,0,0.5)`,
                display: "flex", flexDirection: "column", overflow: "hidden",
                animation: "modalIn 0.3s ease",
            }}>
                {/* Header */}
                <div style={{
                    padding: "16px 20px", borderBottom: `1px solid ${color}20`,
                    display: "flex", alignItems: "center", gap: 12,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${color}, ${color}80)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 20px ${color}40`,
                    }}>
                        {skillIconEl}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{cleanName(skill.name)}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>/{skill.name.replace(/^\//, "")}</div>
                    </div>
                    <button onClick={onClose} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "rgba(255,255,255,0.55)", padding: 4,
                    }}><X size={18} /></button>
                </div>

                {/* Toolbar */}
                <div style={{
                    padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", gap: 6,
                }}>
                    <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2 }}>
                        <button onClick={() => { setTab("preview"); setEditing(false); }}
                            style={{
                                background: tab === "preview" ? `${color}20` : "transparent",
                                border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer",
                                color: tab === "preview" ? color : "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                            }}><Eye size={11} /> Preview</button>
                        <button onClick={() => setTab("code")}
                            style={{
                                background: tab === "code" ? `${color}20` : "transparent",
                                border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer",
                                color: tab === "code" ? color : "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
                            }}><Code2 size={11} /> Code</button>
                    </div>
                    <div style={{ flex: 1 }} />
                    {tab === "code" && !editing && (
                        <button onClick={() => { setEditing(true); setDraft(content); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex" }}>
                            <Pencil size={13} />
                        </button>
                    )}
                    {editing && (
                        <>
                            <button onClick={handleSave} disabled={saving}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e", padding: 4, display: "flex", opacity: saving ? 0.5 : 1 }}>
                                <Save size={13} />
                            </button>
                            <button onClick={() => { setDraft(content); setEditing(false); }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 4, display: "flex" }}>
                                <X size={13} />
                            </button>
                        </>
                    )}
                    <button onClick={handleCopy} title="Copy to clipboard"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex" }}>
                        <Copy size={13} />
                    </button>
                    <button onClick={handleDownload} title="Download .md"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex" }}>
                        <Download size={13} />
                    </button>
                    {otherMachines.map(m => (
                        <button key={m.id} onClick={() => syncTo(m.id)} title={`Copy to ${m.hostname}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", padding: 4, display: "flex", fontSize: 9, gap: 3, alignItems: "center" }}>
                            <Send size={10} /> {m.hostname}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
                    {tab === "preview" && (
                        contentLoading && !content
                            ? <p style={{ opacity: 0.3, fontSize: 12 }}>Loading...</p>
                            : <div className="skill-md"
                                style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.78)" }}
                                // Sanitized by safeMarkdown (DOMPurify) - skill files can carry
                                // markdown pulled from anywhere.
                                dangerouslySetInnerHTML={{ __html: previewHtml || "<p style=\"opacity:.3\">(empty)</p>" }} />
                    )}
                    {tab === "code" && !editing && (
                        <pre style={{
                            fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                            whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                            padding: "16px 18px", borderRadius: 10,
                            background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)",
                            fontFamily: "'SF Mono', 'Fira Code', monospace",
                        }}>{content || (contentLoading ? "Loading..." : "(empty)")}</pre>
                    )}
                    {tab === "code" && editing && (
                        <textarea value={draft} onChange={e => setDraft(e.target.value)}
                            style={{
                                width: "100%", minHeight: 420, padding: "16px 18px",
                                background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 10, outline: "none",
                                fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.85)",
                                fontFamily: "'SF Mono', 'Fira Code', monospace", resize: "vertical",
                            }} />
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "8px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "monospace",
                }}>
                    {skill.path.replace(/.*\.claude\//, "~/.claude/")}
                </div>
            </div>

            <style>{`
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.9) rotate(-2deg); }
                    to { opacity: 1; transform: scale(1) rotate(0deg); }
                }
                /* Markdown body inside the SkillModal preview. Headings break out
                   of the muted body color, code blocks get a dark surface, tables
                   match the rest of the dashboard chrome. */
                .skill-md h1 { font-size: 22px; font-weight: 800; color: #fff; margin: 4px 0 14px; }
                .skill-md h2 { font-size: 17px; font-weight: 700; color: #fff; margin: 22px 0 10px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); }
                .skill-md h3 { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.92); margin: 18px 0 8px; }
                .skill-md h4 { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.85); margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
                .skill-md p { margin: 8px 0 12px; }
                .skill-md ul, .skill-md ol { margin: 8px 0 12px; padding-left: 22px; }
                .skill-md li { margin: 4px 0; }
                .skill-md a { color: ${color}; text-decoration: underline; text-underline-offset: 2px; }
                .skill-md strong { color: #fff; font-weight: 700; }
                .skill-md code { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; font-family: 'SF Mono','Fira Code',monospace; color: ${color}; }
                .skill-md pre { background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; margin: 12px 0; overflow: auto; }
                .skill-md pre code { background: transparent; border: none; padding: 0; color: rgba(255,255,255,0.78); font-size: 11.5px; line-height: 1.6; }
                .skill-md table { border-collapse: collapse; margin: 12px 0; font-size: 12px; width: 100%; }
                .skill-md th, .skill-md td { border: 1px solid rgba(255,255,255,0.08); padding: 6px 10px; text-align: left; }
                .skill-md th { background: rgba(255,255,255,0.04); color: #fff; font-weight: 700; }
                .skill-md blockquote { border-left: 3px solid ${color}55; padding: 4px 0 4px 14px; margin: 12px 0; color: rgba(255,255,255,0.55); }
                .skill-md hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 18px 0; }
            `}</style>
        </div>
    );
}

export const SkillModal = memo(SkillModalImpl);
