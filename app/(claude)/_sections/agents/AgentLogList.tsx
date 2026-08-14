"use client";

import { memo } from "react";
import Image from "next/image";
import { Shield } from "lucide-react";
import AppIcon from "../AppIcon";
import { getAgentChar, formatDuration, isRecentCompletion } from "./lib";
import type { AgentInfo } from "./types";

function AgentLogListImpl({ agents, onSelect }: { agents: AgentInfo[]; onSelect: (agent: AgentInfo) => void }) {
    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {agents.map((a, i) => {
                    const char = getAgentChar(a);
                    const isRunning = a.status === "running";
                    const isRecent = isRecentCompletion(a.completedAt);
                    const isActive = isRunning || isRecent;
                    const statusColor = isRunning ? "#34d399" : a.status === "failed" ? "#ef4444" : "rgba(255,255,255,0.15)";
                    return (
                        <div key={a.id} onClick={() => onSelect(a)}
                            className="cursor-pointer"
                            style={{
                                padding: "10px 14px", borderRadius: 12,
                                background: isRunning ? `${char.color}10` : isRecent ? `${char.color}06` : "rgba(255,255,255,0.015)",
                                border: isRunning ? `1px solid ${char.color}50` : isRecent ? `1px solid ${char.color}25` : "1px solid rgba(255,255,255,0.04)",
                                display: "flex", alignItems: "center", gap: 12,
                                transition: "all 0.3s",
                                animation: isActive ? `recentGlow 2s ease infinite, agentIn 0.3s ease both` : `agentIn 0.3s ease ${i * 0.02}s both`,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${char.color}08`; e.currentTarget.style.borderColor = `${char.color}30`; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isRunning ? `${char.color}10` : isRecent ? `${char.color}06` : "rgba(255,255,255,0.015)"; e.currentTarget.style.borderColor = isRunning ? `${char.color}50` : isRecent ? `${char.color}25` : "rgba(255,255,255,0.04)"; }}>
                            <div style={{ position: "relative", flexShrink: 0 }}>
                                <Image src={char.img} alt={char.name} width={32} height={32}
                                    style={{ borderRadius: 8, objectFit: "cover", border: `1.5px solid ${char.color}${isActive ? "80" : "30"}`, animation: isRunning ? "charBounce 1s ease infinite" : "none" }} />
                                {a.status !== "done" && (
                                    <div style={{
                                        position: "absolute", bottom: -2, right: -2,
                                        width: 10, height: 10, borderRadius: "50%",
                                        background: statusColor, border: "2px solid #0c0d12",
                                        boxShadow: a.status === "running" ? `0 0 8px ${statusColor}` : "none",
                                    }} />
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: char.color }}>{char.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {a.description || "task"}
                                </span>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{formatDuration(a.durationMs)}</span>
                            {a.project && (
                                <AppIcon project={a.project} size={18} />
                            )}
                        </div>
                    );
                })}
            </div>
            {agents.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <Shield size={32} style={{ color: "rgba(255,255,255,0.08)", margin: "0 auto 12px" }} />
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>No agents in the log</p>
                </div>
            )}
        </>
    );
}

export const AgentLogList = memo(AgentLogListImpl);
