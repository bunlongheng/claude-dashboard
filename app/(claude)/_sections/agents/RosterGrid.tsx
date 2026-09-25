"use client";

import { memo } from "react";
import Image from "next/image";
import { getAgentChar } from "./lib";
import type { AgentChar, AgentInfo } from "./types";

function RosterGridImpl({ activeChars, agents, selectedChar, onSelect }: {
    activeChars: AgentChar[];
    agents: AgentInfo[];
    selectedChar: AgentChar | null;
    onSelect: (char: AgentChar | null) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2 md:grid md:grid-cols-12 md:gap-1.5" style={{ marginBottom: 16 }}>
            {activeChars.map((char, i) => {
                const isRunning = agents.some(a => getAgentChar(a).id === char.id && a.status === "running");
                return (
                    <div key={char.id} onClick={() => onSelect(selectedChar?.id === char.id ? null : char)}
                        className={`cursor-pointer shrink-0 rosterCard${selectedChar?.id === char.id ? " sel" : ""}`}
                        style={{
                        ["--cc" as never]: char.color,
                        animation: `rosterIn 0.5s ease ${i * 0.05}s both`,
                        transition: "transform 0.15s",
                    }}
                        onMouseEnter={e => { if (selectedChar?.id !== char.id) e.currentTarget.style.transform = "translateY(-3px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
                        {/* Avatar */}
                        <div style={{ position: "relative", padding: "8px 8px 0", textAlign: "center" }}>
                            <Image src={char.img} alt={char.name} width={48} height={48}
                                style={{
                                    borderRadius: 12, objectFit: "cover", margin: "0 auto",
                                    border: `2px solid ${char.color}40`,
                                    boxShadow: isRunning ? `0 0 20px ${char.color}40` : `0 2px 8px rgba(0,0,0,0.3)`,
                                    animation: isRunning ? "charBounce 1s ease infinite" : "none",
                                }} />
                            {isRunning && <span style={{ position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: "50%", background: "#34d399", border: "2px solid #0c0d12", animation: "pulse 1.5s infinite" }} />}
                        </div>
                        {/* Info */}
                        <div className="hidden md:block" style={{ padding: "4px 6px 6px", textAlign: "center" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: char.color, letterSpacing: "0.03em" }}>{char.name}</div>
                            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{char.role}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export const RosterGrid = memo(RosterGridImpl);
