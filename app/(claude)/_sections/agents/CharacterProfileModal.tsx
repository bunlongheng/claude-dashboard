"use client";

import { memo, useMemo } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { timeAgo } from "../shared";
import { getAgentChar, formatDuration } from "./lib";
import type { AgentChar, AgentInfo } from "./types";

function CharacterProfileModalImpl({ char, agents, onClose }: { char: AgentChar; agents: AgentInfo[]; onClose: () => void }) {
    // Same aggregation the roster's per-character stats Map does, scoped to
    // just this character so the modal only needs `char` + the full agent list.
    const { s, charMissions } = useMemo(() => {
        const list = agents.filter(a => getAgentChar(a).id === char.id);
        const stats = { missions: 0, wins: 0, fails: 0, totalMs: 0 };
        for (const a of list) {
            stats.missions++;
            if (a.status === "done") stats.wins++;
            if (a.status === "failed") stats.fails++;
            if (a.durationMs) stats.totalMs += a.durationMs;
        }
        const sorted = [...list].sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
        return { s: stats, charMissions: sorted };
    }, [agents, char.id]);

    const xp = s.wins * 100 + s.fails * 20;
    const level = Math.max(1, Math.floor(xp / 200) + 1);
    const avgMs = s.missions > 0 ? Math.round(s.totalMs / s.missions) : 0;
    const successRate = s.missions > 0 ? Math.round((s.wins / s.missions) * 100) : 0;

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} />
            <div style={{
                position: "relative", background: "#0c0d12", borderRadius: 24, padding: 0,
                maxWidth: 480, width: "90vw", maxHeight: "85vh", overflow: "hidden",
                border: `1px solid ${char.color}25`, boxShadow: `0 0 80px ${char.color}15`,
            }} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: "absolute", top: 16, right: 16, background: "none", border: "none",
                    color: "rgba(255,255,255,0.55)", cursor: "pointer", zIndex: 2,
                }}><X size={18} /></button>

                {/* Header */}
                <div style={{
                    background: `linear-gradient(180deg, ${char.color}18 0%, transparent 100%)`,
                    padding: "32px 32px 20px", textAlign: "center",
                }}>
                    <Image src={char.img} alt={char.name} width={100} height={100}
                        style={{ borderRadius: 24, objectFit: "cover", border: `3px solid ${char.color}40`, boxShadow: `0 0 40px ${char.color}25`, margin: "0 auto", display: "block" }} />
                    <h3 style={{ fontSize: 28, fontWeight: 900, color: char.color, marginTop: 12, letterSpacing: "0.05em" }}>{char.name}</h3>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{char.role}</p>
                    <div style={{ fontSize: 13, fontWeight: 800, color: char.color, marginTop: 8, opacity: 0.7 }}>LEVEL {level}</div>
                </div>

                {/* Stats */}
                <div style={{ padding: "0 24px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                        {[
                            { label: "Tasks", value: s.missions, color: char.color },
                            { label: "Wins", value: s.wins, color: "#34d399" },
                            { label: "Fails", value: s.fails, color: "#ef4444" },
                            { label: "Success", value: `${successRate}%`, color: "#3b82f6" },
                        ].map(st => (
                            <div key={st.label} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: st.color }}>{st.value}</div>
                                <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{st.label}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                        <div style={{ flex: 1, padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{formatDuration(avgMs)}</div>
                            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Avg Duration</div>
                        </div>
                        <div style={{ flex: 1, padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{formatDuration(s.totalMs)}</div>
                            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total Time</div>
                        </div>
                    </div>
                </div>

                {/* Mission timeline */}
                <div style={{ padding: "0 24px 24px", maxHeight: 250, overflow: "auto" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>History</div>
                    {charMissions.map((a, i) => {
                        const statusColor = a.status === "done" ? "#34d399" : a.status === "failed" ? "#ef4444" : "#f59e0b";
                        return (
                            <div key={a.id} style={{
                                display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                                borderBottom: i < charMissions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</div>
                                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{a.project}</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>{formatDuration(a.durationMs)}</div>
                                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)" }}>{a.startedAt ? timeAgo(a.startedAt) : ""}</div>
                                </div>
                            </div>
                        );
                    })}
                    {charMissions.length === 0 && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", padding: 16 }}>No tasks yet</p>}
                </div>
            </div>
        </div>
    );
}

export const CharacterProfileModal = memo(CharacterProfileModalImpl);
