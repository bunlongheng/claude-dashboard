"use client";

import { memo, useState } from "react";
import { FileText, X } from "lucide-react";
import AppIcon from "../AppIcon";
import { ACCENT, type DocInfo } from "./types";

// Documents tab - type/project breakdown bars, browsable file list, and the
// slide-in doc content panel. Lifted verbatim from RagSection.tsx's
// `tab === "documents"` block (was an inline IIFE).
function DocumentsTab({ docs, apiBase }: { docs: DocInfo[]; apiBase: (path: string) => string }) {
    const [docFilter, setDocFilter] = useState<string>("all");
    const [docProjectFilter, setDocProjectFilter] = useState<string>("all");
    const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null);
    const [docContent, setDocContent] = useState<string>("");
    const [loadingDoc, setLoadingDoc] = useState(false);

    const typeColors: Record<string, string> = { conversation: "#22c55e", insight: "#10b981", memory: "#eab308", claude_md: "#8b5cf6", global_rules: "#a855f7", article: "#06b6d4" };

    // Type breakdown
    const typeCounts: Record<string, number> = {};
    const typeSize: Record<string, number> = {};
    for (const d of docs) {
        typeCounts[d.source_type] = (typeCounts[d.source_type] || 0) + 1;
        typeSize[d.source_type] = (typeSize[d.source_type] || 0) + d.size;
    }
    const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const maxTypeCount = Math.max(...Object.values(typeCounts), 1);

    // Project breakdown
    const projectCounts: Record<string, number> = {};
    const projectSize: Record<string, number> = {};
    for (const d of docs) {
        projectCounts[d.project] = (projectCounts[d.project] || 0) + 1;
        projectSize[d.project] = (projectSize[d.project] || 0) + d.size;
    }
    const projectEntries = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]);
    const maxProjectCount = Math.max(...Object.values(projectCounts), 1);
    const projectColors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444", "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#6366f1"];

    // Total size
    const totalSize = docs.reduce((s, d) => s + d.size, 0);
    const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0);

    return (
        <>
        <div>
            {/* Summary row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{docs.length}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Documents</div>
                </div>
                <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{totalChunks.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Chunks</div>
                </div>
                <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{(totalSize / 1024).toFixed(0)}KB</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total Size</div>
                </div>
            </div>

            {/* Type distribution - horizontal bar chart */}
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.52)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>By Type</div>
            <div style={{ marginBottom: 20 }}>
                {typeEntries.map(([type, count]) => {
                    const color = typeColors[type] || "#6b7280";
                    const pct = (count / maxTypeCount) * 100;
                    const sizeKb = ((typeSize[type] || 0) / 1024).toFixed(0);
                    return (
                        <div key={type} onClick={() => setDocFilter(docFilter === type ? "all" : type)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, cursor: "pointer" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.45)", minWidth: 75, textAlign: "right" }}>{type}</span>
                            <div style={{ flex: 1, height: 20, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                                <div style={{
                                    width: `${pct}%`, height: "100%", background: `${color}30`, borderRadius: 4,
                                    borderRight: `2px solid ${color}`,
                                    animation: "barGrow 0.8s ease-out both",
                                }} />
                                <span style={{ position: "absolute", left: 8, top: 3, fontSize: 9, fontWeight: 700, color }}>{count}</span>
                            </div>
                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", minWidth: 35, textAlign: "right" }}>{sizeKb}KB</span>
                        </div>
                    );
                })}
            </div>

            {/* Stacked bar - type composition */}
            <div style={{ height: 24, borderRadius: 6, overflow: "hidden", display: "flex", marginBottom: 20 }}>
                {typeEntries.map(([type, count]) => {
                    const color = typeColors[type] || "#6b7280";
                    const pct = (count / docs.length) * 100;
                    return (
                        <div key={type} title={`${type}: ${count} (${pct.toFixed(0)}%)`}
                            style={{ width: `${pct}%`, background: `${color}50`, borderRight: "1px solid rgba(0,0,0,0.3)", animation: "barGrow 0.8s ease-out both", position: "relative" }}>
                            {pct > 8 && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color }}>{type}</span>}
                        </div>
                    );
                })}
            </div>

            {/* Project breakdown - horizontal bars */}
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.52)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>By Project ({Object.keys(projectCounts).length})</div>
            <div style={{ marginBottom: 16 }}>
                {projectEntries.slice(0, 15).map(([project, count], i) => {
                    const color = projectColors[i % projectColors.length];
                    const pct = (count / maxProjectCount) * 100;
                    return (
                        <div key={project} onClick={() => setDocProjectFilter(docProjectFilter === project ? "all" : project)}
                            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, cursor: "pointer" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.45)", minWidth: 75, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project}</span>
                            <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.03)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                                <div style={{
                                    width: `${pct}%`, height: "100%", background: `${color}25`, borderRadius: 3,
                                    borderRight: `2px solid ${color}`,
                                    animation: "barGrow 0.8s ease-out both",
                                }} />
                                <span style={{ position: "absolute", left: 6, top: 2, fontSize: 9, fontWeight: 700, color }}>{count}</span>
                            </div>
                        </div>
                    );
                })}
                {projectEntries.length > 15 && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: 4 }}>+{projectEntries.length - 15} more projects</div>
                )}
            </div>

            {/* File list */}
            <details open style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "8px 0", userSelect: "none" }}>
                    Browse all {docs.length} documents
                </summary>
                <div style={{ marginTop: 8 }}>
                    {(() => {
                        let filtered = docs;
                        if (docFilter !== "all") filtered = filtered.filter(d => d.source_type === docFilter);
                        if (docProjectFilter !== "all") filtered = filtered.filter(d => d.project === docProjectFilter);
                        const grouped: Record<string, DocInfo[]> = {};
                        for (const d of filtered) { if (!grouped[d.project]) grouped[d.project] = []; grouped[d.project].push(d); }
                        return Object.entries(grouped).sort().map(([project, items]) => (
                            <div key={project} style={{ marginBottom: 8 }}>
                                <div style={{ padding: "4px 8px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
                                    <AppIcon project={project} size={12} /> <span style={{ textTransform: "uppercase" }}>{project}</span> <span style={{ fontSize: 8, color: "rgba(255,255,255,0.12)" }}>({items.length})</span>
                                </div>
                                {items.map(d => {
                                    const color = typeColors[d.source_type] || "#6b7280";
                                    return (
                                        <div key={d.id} onClick={async () => {
                                            setSelectedDoc(d); setLoadingDoc(true);
                                            try { const res = await fetch(apiBase(`/api/rag/docs/${d.id}`)); const data = await res.json(); setDocContent(data.content || ""); } catch { setDocContent("Failed to load"); }
                                            setLoadingDoc(false);
                                        }} style={{
                                            padding: "6px 10px 6px 24px", marginBottom: 1, borderRadius: 4,
                                            background: selectedDoc?.id === d.id ? `${ACCENT}10` : "rgba(255,255,255,0.01)",
                                            border: selectedDoc?.id === d.id ? `1px solid ${ACCENT}25` : "1px solid transparent",
                                            display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                                        }}>
                                            <FileText size={10} style={{ color, flexShrink: 0 }} />
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                                            <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: `${color}12`, color }}>{d.source_type}</span>
                                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{d.chunk_count}ch</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ));
                    })()}
                </div>
            </details>
        </div>

        {/* Doc content panel */}
        {selectedDoc && (
            <div style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
                display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)",
            }} onClick={() => { setSelectedDoc(null); setDocContent(""); }}>
                <div onClick={e => e.stopPropagation()} style={{
                    width: 560, maxWidth: "90vw", background: "#0f1117",
                    borderLeft: "1px solid rgba(255,255,255,0.08)",
                    display: "flex", flexDirection: "column",
                    animation: "sd-slide-in-right 0.15s ease-out",
                }}>
                    <div style={{
                        padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                    }}>
                        <FileText size={12} style={{ color: ACCENT }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedDoc.title}</span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{selectedDoc.project}</span>
                        <button onClick={() => { setSelectedDoc(null); setDocContent(""); }}
                            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer", display: "flex", padding: 2 }}>
                            <X size={14} />
                        </button>
                    </div>
                    <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
                        {loadingDoc ? (
                            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>Loading...</p>
                        ) : (
                            <pre style={{
                                fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.7)",
                                fontFamily: "'SF Mono', 'Fira Code', monospace",
                                whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                            }}>{docContent}</pre>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

export default memo(DocumentsTab);
