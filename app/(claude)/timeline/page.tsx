"use client";

import { useEffect, useState } from "react";

interface TimelineEntry {
    file: string;
    project: string;
    createdAt: string;
    updatedAt: string;
    size: number;
    type: string | null;
}

const TYPE_COLORS: Record<string, string> = {
    user: "#f97316",
    feedback: "#22c55e",
    project: "#06b6d4",
    reference: "#8b5cf6",
};

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function TimelinePage() {
    const [entries, setEntries] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/claude/memory-timeline")
            .then(r => r.json())
            .then(data => setEntries(data.timeline ?? []))
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{ padding: 32, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                Loading memory timeline...
            </div>
        );
    }

    return (
        <div style={{ padding: "24px 28px", maxWidth: 700 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                Memory Timeline
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>
                All memory files across projects, newest first.
            </p>

            {entries.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No memory files found.
                </div>
            )}

            {/* Vertical timeline */}
            <div style={{ position: "relative", paddingLeft: 24 }}>
                {/* Vertical line */}
                {entries.length > 0 && (
                    <div style={{
                        position: "absolute", left: 7, top: 8, bottom: 8,
                        width: 2, background: "rgba(255,255,255,0.06)", borderRadius: 1,
                    }} />
                )}

                {entries.map((entry, i) => {
                    const typeColor = entry.type ? TYPE_COLORS[entry.type] ?? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)";
                    return (
                        <div key={`${entry.project}-${entry.file}-${i}`} style={{ position: "relative", marginBottom: 6 }}>
                            {/* Dot */}
                            <div style={{
                                position: "absolute", left: -20, top: 14,
                                width: 10, height: 10, borderRadius: "50%",
                                background: typeColor, border: "2px solid #08090d",
                            }} />

                            <div style={{
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 10,
                                padding: "12px 16px",
                            }}>
                                {/* Top row */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{entry.file}</span>
                                    {entry.type && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 600,
                                            padding: "1px 7px", borderRadius: 6,
                                            background: `${typeColor}18`, color: typeColor,
                                        }}>
                                            {entry.type}
                                        </span>
                                    )}
                                </div>
                                {/* Bottom row */}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                                    <span>{entry.project}</span>
                                    <span>{timeAgo(entry.updatedAt)}</span>
                                    <span>{formatSize(entry.size)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
