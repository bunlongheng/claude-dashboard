"use client";

import { useEffect, useState } from "react";

interface ProjectHealth {
    name: string;
    folder: string;
    score: number;
    has: {
        claudeMd: boolean;
        memory: boolean;
        recentSessions: boolean;
        instructions: boolean;
        settings: boolean;
    };
    memoryCount: number;
    sessionCount: number;
    lastActive: string | null;
}

function scoreColor(score: number): string {
    if (score >= 70) return "#22c55e";
    if (score >= 40) return "#eab308";
    return "#ef4444";
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function Check({ ok }: { ok: boolean }) {
    return (
        <span style={{ color: ok ? "#22c55e" : "rgba(255,255,255,0.15)", fontSize: 13 }}>
            {ok ? "✓" : "✗"}
        </span>
    );
}

export default function HealthPage() {
    const [projects, setProjects] = useState<ProjectHealth[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/claude/health")
            .then(r => r.json())
            .then(data => setProjects(data.projects ?? []))
            .catch(() => setProjects([]))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{ padding: 32, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                Loading health scores...
            </div>
        );
    }

    return (
        <div style={{ padding: "24px 28px", maxWidth: 900 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                Health Score
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>
                Project readiness scored 0-100 based on CLAUDE.md, memory, sessions, instructions, and settings.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {projects.map(p => {
                    const color = scoreColor(p.score);
                    return (
                        <div
                            key={p.folder}
                            style={{
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.06)",
                                borderRadius: 10,
                                padding: "14px 18px",
                            }}
                        >
                            {/* Top row: name + score */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{p.name}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, padding: "2px 8px", borderRadius: 6 }}>
                                        {p.score}
                                    </span>
                                </div>
                                {p.lastActive && (
                                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                                        {timeAgo(p.lastActive)}
                                    </span>
                                )}
                            </div>

                            {/* Score bar */}
                            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", marginBottom: 12 }}>
                                <div style={{ height: "100%", borderRadius: 3, width: `${p.score}%`, background: color, transition: "width 0.4s ease" }} />
                            </div>

                            {/* Checks row */}
                            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    <Check ok={p.has.claudeMd} /> CLAUDE.md
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    <Check ok={p.has.memory} /> Memory
                                    {p.memoryCount > 0 && <span style={{ color: "rgba(255,255,255,0.25)" }}>({p.memoryCount})</span>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    <Check ok={p.has.recentSessions} /> Sessions
                                    {p.sessionCount > 0 && <span style={{ color: "rgba(255,255,255,0.25)" }}>({p.sessionCount})</span>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    <Check ok={p.has.instructions} /> Instructions
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    <Check ok={p.has.settings} /> Settings
                                </div>
                            </div>
                        </div>
                    );
                })}

                {projects.length === 0 && (
                    <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                        No projects found.
                    </div>
                )}
            </div>
        </div>
    );
}
