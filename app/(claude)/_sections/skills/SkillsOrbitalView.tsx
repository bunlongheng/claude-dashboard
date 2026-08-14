"use client";

import { memo, useState } from "react";
import { getSkillIcon, cleanName, isNewSkill, ORB_COLORS } from "./skillIcons";
import type { SkillInfo } from "./types";

// Orbital circle - desktop
function SkillsOrbitalViewImpl({ skills, filter, onSelect }: {
    skills: SkillInfo[]; filter: string; onSelect: (s: SkillInfo) => void;
}) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    return (
        <div className="hidden md:block" style={{ position: "relative", width: "100%", aspectRatio: "1", maxWidth: 900, margin: "0 auto" }}>
            {/* Center label */}
            <div style={{
                position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                textAlign: "center", pointerEvents: "none", zIndex: 0,
            }}>
                <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {filter === "all" ? "ALL SKILLS" : filter.toUpperCase()}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.06)", marginTop: 4 }}>
                    {skills.length}
                </div>
            </div>
            {/* Cards in circle */}
            {skills.map((s, i) => {
                const n = skills.length;
                const angle = (2 * Math.PI * i / n) - Math.PI / 2;
                const r = 42; // % from center
                const x = 50 + r * Math.cos(angle);
                const y = 50 + r * Math.sin(angle);
                const color = ORB_COLORS[i % ORB_COLORS.length];
                const isHovered = hoveredIdx === i;
                return (
                    <div key={`${s.plugin}/${s.name}`}
                        onClick={() => onSelect(s)}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        style={{
                            position: "absolute",
                            left: `${x}%`, top: `${y}%`,
                            transform: `translate(-50%, -50%) scale(${isHovered ? 1.12 : 1})`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                            cursor: "pointer", zIndex: isHovered ? 2 : 1,
                            transition: "transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.4s",
                            animation: `orbitalIn 0.7s cubic-bezier(.34,1.56,.64,1) ${i * 0.04}s both`,
                        }}>
                        <div style={{ position: "relative" }}>
                            {isNewSkill(s.createdAt) && (
                                <span style={{
                                    position: "absolute", top: -4, right: -8, zIndex: 3,
                                    fontSize: 7, fontWeight: 800, letterSpacing: "0.05em",
                                    color: "#fff", background: "#22c55e",
                                    padding: "1px 5px", borderRadius: 6,
                                    boxShadow: "0 1px 4px rgba(34,197,94,0.5)",
                                }}>NEW</span>
                            )}
                            <div style={{
                                width: isHovered ? 72 : 60, height: isHovered ? 72 : 60, borderRadius: "50%",
                                background: `linear-gradient(135deg, ${color}, ${color}80)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: isHovered ? `0 0 30px ${color}60` : `0 2px 10px ${color}25`,
                                transition: "all 0.3s",
                            }}>
                                {(() => { const Icon = getSkillIcon(s.name); return <Icon size={isHovered ? 24 : 20} style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />; })()}
                            </div>
                        </div>
                        <span style={{
                            fontSize: 9, fontWeight: 600,
                            color: isHovered ? "#fff" : "rgba(255,255,255,0.45)",
                            textAlign: "center", maxWidth: 80, lineHeight: 1.2,
                            transition: "color 0.2s",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {cleanName(s.name)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export const SkillsOrbitalView = memo(SkillsOrbitalViewImpl);
