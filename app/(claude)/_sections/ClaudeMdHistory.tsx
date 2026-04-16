"use client";

import { useState, useEffect, useCallback } from "react";
import { History, X, RotateCcw, ChevronRight, FileText } from "lucide-react";
import { ACCENT } from "./shared";

type VersionMeta = { id: number; hash: string; size: number; created_at: string };
type VersionFull = VersionMeta & { content: string };

function formatDate(iso: string) {
    const d = new Date(iso + "Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Simple line diff — returns segments of added/removed/unchanged lines */
function diffLines(oldText: string, newText: string) {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    const result: { type: "same" | "add" | "remove"; text: string }[] = [];

    // Simple LCS-based diff
    const m = oldLines.length;
    const n = newLines.length;

    // For very large files, fall back to a simpler approach
    if (m * n > 1_000_000) {
        // Line-by-line comparison with context
        let i = 0, j = 0;
        while (i < m || j < n) {
            if (i < m && j < n && oldLines[i] === newLines[j]) {
                result.push({ type: "same", text: oldLines[i] });
                i++; j++;
            } else if (j < n && (i >= m || oldLines[i] !== newLines[j])) {
                result.push({ type: "add", text: newLines[j] });
                j++;
            } else {
                result.push({ type: "remove", text: oldLines[i] });
                i++;
            }
        }
        return result;
    }

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Backtrack
    let i = m, j = n;
    const stack: { type: "same" | "add" | "remove"; text: string }[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            stack.push({ type: "same", text: oldLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            stack.push({ type: "add", text: newLines[j - 1] });
            j--;
        } else {
            stack.push({ type: "remove", text: oldLines[i - 1] });
            i--;
        }
    }
    return stack.reverse();
}

export default function ClaudeMdHistory({ onRestore }: { onRestore?: (content: string) => void }) {
    const [open, setOpen] = useState(false);
    const [versions, setVersions] = useState<VersionMeta[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<VersionFull | null>(null);
    const [currentContent, setCurrentContent] = useState("");
    const [showDiff, setShowDiff] = useState(false);
    const [dbAvailable, setDbAvailable] = useState<boolean | null>(null);

    const fetchVersions = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/claude/claude-md-history");
            if (r.status === 501) { setDbAvailable(false); return; }
            setDbAvailable(true);
            const data = await r.json();
            setVersions(data.versions ?? []);
            setTotal(data.total ?? 0);
            setCurrentContent(data.current?.content ?? "");
        } catch {
            setDbAvailable(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchVersions();
    }, [open, fetchVersions]);

    const loadVersion = useCallback(async (id: number) => {
        try {
            const r = await fetch(`/api/claude/claude-md-history?id=${id}`);
            const data = await r.json();
            if (data.version) {
                setSelectedVersion(data.version);
                setShowDiff(false);
            }
        } catch { /* ignore */ }
    }, []);

    const handleRestore = useCallback(async () => {
        if (!selectedVersion) return;
        if (onRestore) {
            onRestore(selectedVersion.content);
        } else {
            // Copy to clipboard as fallback
            await navigator.clipboard.writeText(selectedVersion.content);
        }
    }, [selectedVersion, onRestore]);

    // Don't render the button if DB is known unavailable
    if (dbAvailable === false) return null;

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${ACCENT}40`; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
            >
                <History size={12} /> History
            </button>
        );
    }

    const diffResult = showDiff && selectedVersion ? diffLines(selectedVersion.content, currentContent) : null;

    return (
        <div className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden mb-4">
            {/* Header */}
            <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex items-center gap-2">
                <History size={13} style={{ color: ACCENT }} />
                <span className="text-[11px] font-bold text-white/45">CLAUDE.md Version History</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: `${ACCENT}20`, color: ACCENT }}>
                    {total} version{total !== 1 ? "s" : ""}
                </span>
                <button onClick={() => { setOpen(false); setSelectedVersion(null); }} className="ml-auto"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.3)", display: "flex" }}>
                    <X size={13} />
                </button>
            </div>

            <div className="flex" style={{ minHeight: 300, maxHeight: 500 }}>
                {/* Version list */}
                <div className="border-r border-white/[0.06] overflow-y-auto" style={{ width: 260, flexShrink: 0 }}>
                    {loading && <p className="text-[10px] text-white/20 text-center py-8">Loading...</p>}
                    {!loading && versions.length === 0 && <p className="text-[10px] text-white/20 text-center py-8">No versions yet</p>}
                    {versions.map((v, i) => (
                        <button
                            key={v.id}
                            onClick={() => loadVersion(v.id)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "10px 14px",
                                background: selectedVersion?.id === v.id ? `${ACCENT}10` : "transparent",
                                border: "none",
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "background 0.1s",
                            }}
                            onMouseEnter={e => { if (selectedVersion?.id !== v.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                            onMouseLeave={e => { if (selectedVersion?.id !== v.id) e.currentTarget.style.background = "transparent"; }}
                        >
                            <FileText size={11} style={{ color: i === 0 ? "#22c55e" : "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, color: i === 0 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)", fontWeight: i === 0 ? 600 : 400 }}>
                                    {i === 0 ? "Latest" : `v${total - i}`}
                                </div>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                                    {formatDate(v.created_at)} - {formatSize(v.size)}
                                </div>
                            </div>
                            <ChevronRight size={10} style={{ color: "rgba(255,255,255,0.1)", marginLeft: "auto", flexShrink: 0 }} />
                        </button>
                    ))}
                </div>

                {/* Content / Diff panel */}
                <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
                    {!selectedVersion && (
                        <p className="text-[10px] text-white/20 text-center py-16">Select a version to view its content</p>
                    )}
                    {selectedVersion && (
                        <>
                            <div className="flex items-center gap-2 mb-3">
                                <button
                                    onClick={() => setShowDiff(!showDiff)}
                                    style={{
                                        fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                                        background: showDiff ? `${ACCENT}20` : "rgba(255,255,255,0.05)",
                                        color: showDiff ? ACCENT : "rgba(255,255,255,0.4)",
                                        border: `1px solid ${showDiff ? `${ACCENT}40` : "rgba(255,255,255,0.08)"}`,
                                    }}
                                >
                                    {showDiff ? "Raw" : "Diff vs Current"}
                                </button>
                                <button
                                    onClick={handleRestore}
                                    style={{
                                        fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                                        background: "rgba(34,197,94,0.1)", color: "#22c55e",
                                        border: "1px solid rgba(34,197,94,0.2)",
                                        display: "inline-flex", alignItems: "center", gap: 4,
                                    }}
                                >
                                    <RotateCcw size={10} /> {onRestore ? "Restore" : "Copy to Clipboard"}
                                </button>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginLeft: "auto" }}>
                                    {selectedVersion.hash.slice(0, 8)}
                                </span>
                            </div>

                            {!showDiff && (
                                <pre style={{
                                    fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.5)",
                                    fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
                                    background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 12,
                                    border: "1px solid rgba(255,255,255,0.04)", maxHeight: 380, overflow: "auto",
                                }}>
                                    {selectedVersion.content}
                                </pre>
                            )}

                            {showDiff && diffResult && (
                                <div style={{
                                    fontSize: 10, lineHeight: 1.6, fontFamily: "monospace",
                                    background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 12,
                                    border: "1px solid rgba(255,255,255,0.04)", maxHeight: 380, overflow: "auto",
                                }}>
                                    {diffResult.map((line, i) => (
                                        <div key={i} style={{
                                            padding: "0 4px",
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                            background: line.type === "add" ? "rgba(34,197,94,0.1)"
                                                : line.type === "remove" ? "rgba(239,68,68,0.1)" : "transparent",
                                            color: line.type === "add" ? "#4ade80"
                                                : line.type === "remove" ? "#f87171" : "rgba(255,255,255,0.35)",
                                        }}>
                                            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "} {line.text}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
