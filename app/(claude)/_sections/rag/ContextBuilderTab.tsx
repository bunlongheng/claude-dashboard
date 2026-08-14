"use client";

import { memo, useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { ACCENT } from "./types";

// Context builder tab - paste a prompt, see the assembled RAG context.
// Lifted verbatim from RagSection.tsx's `tab === "context"` block.
function ContextBuilderTab({ apiBase }: { apiBase: (path: string) => string }) {
    const [contextPrompt, setContextPrompt] = useState("");
    const [contextResult, setContextResult] = useState("");
    const [contextLoading, setContextLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    async function buildContext() {
        if (!contextPrompt.trim()) return;
        setContextLoading(true);
        try {
            const res = await fetch(apiBase(`/api/rag/context`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: contextPrompt.trim() }),
            });
            const data = await res.json();
            setContextResult(data.context || "No relevant context found.");
        } catch { setContextResult("RAG server not reachable."); }
        setContextLoading(false);
    }

    function copyContext() {
        navigator.clipboard.writeText(contextResult);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.5 }}>
                Paste a prompt to see what context the RAG would inject. This is what Claude sees at session start.
            </p>
            <textarea value={contextPrompt} onChange={e => setContextPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) buildContext(); }}
                placeholder='e.g. "Build a login page with OAuth"'
                rows={3}
                style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.8)", fontSize: 12, outline: "none", resize: "vertical",
                    fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Cmd+Enter</span>
                <button onClick={buildContext} disabled={contextLoading || !contextPrompt.trim()}
                    style={{
                        padding: "6px 14px", borderRadius: 8, background: contextPrompt.trim() ? ACCENT : "rgba(255,255,255,0.05)",
                        color: contextPrompt.trim() ? "#fff" : "rgba(255,255,255,0.2)",
                        border: "none", fontSize: 11, fontWeight: 600, cursor: contextPrompt.trim() ? "pointer" : "default",
                    }}>{contextLoading ? "Building..." : "Build Context"}</button>
            </div>

            {contextResult && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>
                            <Sparkles size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                            Assembled Context
                        </span>
                        <button onClick={copyContext} style={{
                            padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                            background: copied ? "#22c55e" : "rgba(255,255,255,0.04)",
                            color: copied ? "#fff" : "rgba(255,255,255,0.52)",
                            fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        }}>
                            {copied ? <Check size={10} /> : <Copy size={10} />}
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <pre style={{
                        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 8, padding: "12px 14px", fontSize: 10, lineHeight: 1.7,
                        color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace",
                        whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflow: "auto",
                    }}>{contextResult}</pre>
                </div>
            )}
        </div>
    );
}

export default memo(ContextBuilderTab);
