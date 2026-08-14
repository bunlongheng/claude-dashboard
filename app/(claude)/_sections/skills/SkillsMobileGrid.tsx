"use client";

import { memo } from "react";
import { getSkillIcon, cleanName, ORB_COLORS } from "./skillIcons";
import type { SkillInfo } from "./types";

// Mobile grid fallback
function SkillsMobileGridImpl({ skills, onSelect }: { skills: SkillInfo[]; onSelect: (s: SkillInfo) => void }) {
    return (
        <div className="md:hidden grid grid-cols-3 gap-3">
            {skills.map((s, i) => {
                const color = ORB_COLORS[i % ORB_COLORS.length];
                return (
                    <div key={`m-${s.plugin}/${s.name}`}
                        onClick={() => onSelect(s)}
                        className="flex flex-col items-center gap-2 cursor-pointer py-3"
                        style={{ animation: `thumbIn 0.4s ease ${i * 0.03}s both` }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: "50%",
                            background: `linear-gradient(135deg, ${color}, ${color}80)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: `0 2px 8px ${color}20`,
                        }}>
                            {(() => { const Icon = getSkillIcon(s.name); return <Icon size={18} style={{ color: "rgba(255,255,255,0.9)" }} />; })()}
                        </div>
                        <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.45)", textAlign: "center", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {cleanName(s.name)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export const SkillsMobileGrid = memo(SkillsMobileGridImpl);
