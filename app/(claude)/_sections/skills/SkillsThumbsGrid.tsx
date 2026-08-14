"use client";

import { memo } from "react";
import { getSkillIcon, cleanName, isNewSkill } from "./skillIcons";
import type { SkillInfo } from "./types";

// Thumbs grid - desktop
function SkillsThumbsGridImpl({ skills, onSelect }: { skills: SkillInfo[]; onSelect: (s: SkillInfo) => void }) {
    return (
        <div className="hidden md:grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
            {skills.map((s, i) => {
                const hue = Math.round((i / skills.length) * 360);
                const color = `hsl(${hue}, 85%, 55%)`;
                const Icon = getSkillIcon(s.name);
                const isNew = isNewSkill(s.createdAt);
                return (
                    <div key={`t-${s.plugin}/${s.name}`}
                        onClick={() => onSelect(s)}
                        className="cursor-pointer group"
                        style={{
                            borderRadius: 16, overflow: "hidden", position: "relative",
                            background: `linear-gradient(135deg, hsl(${hue}, 85%, 55%), hsl(${hue + 15}, 85%, 50%))`, aspectRatio: "1",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                            boxShadow: "none",
                            transition: "transform 0.2s, box-shadow 0.2s",
                            animation: `thumbIn 0.4s ease ${i * 0.02}s both`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = `0 4px 16px hsla(${hue}, 85%, 55%, 0.3)`; const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement; if (icon) icon.style.animation = "navShake 0.4s ease"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; const icon = e.currentTarget.querySelector(".thumb-icon") as HTMLElement; if (icon) icon.style.animation = "none"; }}>
                        {isNew && (
                            <span style={{
                                position: "absolute", top: 8, right: 8,
                                fontSize: 7, fontWeight: 800, color: "#fff",
                                background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 6,
                            }}>NEW</span>
                        )}
                        <Icon size={24} className="thumb-icon" style={{ color: "rgba(255,255,255,0.9)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }} />
                        <span style={{
                            fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                            textTransform: "uppercase", letterSpacing: "0.03em",
                            textAlign: "center", padding: "0 4px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
                        }}>{cleanName(s.name)}</span>
                    </div>
                );
            })}
        </div>
    );
}

export const SkillsThumbsGrid = memo(SkillsThumbsGridImpl);
