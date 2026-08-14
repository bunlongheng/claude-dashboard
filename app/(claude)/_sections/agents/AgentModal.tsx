"use client";

import { memo } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { timeAgo } from "../shared";
import { getAgentChar, formatDuration } from "./lib";
import type { AgentInfo } from "./types";

function AgentModalImpl({ agent, onClose }: { agent: AgentInfo; onClose: () => void }) {
    const char = getAgentChar(agent);
    const statusColor = agent.status === "running" ? "#34d399" : agent.status === "failed" ? "#ef4444" : "#3b82f6";
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onClose}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} />
            <div style={{
                position: "relative", background: "#0c0d12", borderRadius: 24, padding: 0,
                maxWidth: 520, width: "90vw", maxHeight: "85vh", overflow: "hidden",
                border: `1px solid ${char.color}25`, boxShadow: `0 0 80px ${char.color}15`,
            }} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: "absolute", top: 16, right: 16, background: "none", border: "none",
                    color: "rgba(255,255,255,0.55)", cursor: "pointer", zIndex: 2,
                }}><X size={18} /></button>

                {/* Character header */}
                <div style={{
                    background: `linear-gradient(180deg, ${char.color}15 0%, transparent 100%)`,
                    padding: "32px 32px 24px", textAlign: "center",
                }}>
                    <Image src={char.img} alt={char.name} width={96} height={96}
                        style={{ borderRadius: 24, objectFit: "cover", border: `3px solid ${char.color}40`, boxShadow: `0 0 40px ${char.color}25`, margin: "0 auto", display: "block" }} />
                    <h3 style={{ fontSize: 24, fontWeight: 900, color: char.color, marginTop: 12, letterSpacing: "0.05em" }}>{char.name}</h3>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{char.role}</p>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                            {agent.status.toUpperCase()}
                        </span>
                    </div>
                </div>

                <div style={{ padding: "0 32px 32px", overflow: "auto", maxHeight: "50vh" }}>
                    {/* Mission brief */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, marginTop: 8 }}>Task</div>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 16 }}>{agent.description || "Agent task"}</p>

                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                        {[
                            { label: "Project", value: agent.project },
                            { label: "Duration", value: formatDuration(agent.durationMs) },
                            { label: "When", value: agent.startedAt ? timeAgo(agent.startedAt) : "-" },
                        ].map(s => (
                            <div key={s.label} style={{ padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.value}</div>
                                <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {agent.prompt && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Orders</div>
                            <pre style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflow: "auto", fontFamily: "'SF Mono', monospace" }}>{agent.prompt}</pre>
                        </div>
                    )}
                    {agent.result && (
                        <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Report</div>
                            <pre style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", fontFamily: "'SF Mono', monospace" }}>{agent.result}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export const AgentModal = memo(AgentModalImpl);
