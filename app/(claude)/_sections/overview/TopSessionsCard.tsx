"use client";

import type { ReactNode } from "react";
import { cardShell } from "@/lib/ui-tokens";
import type { Token } from "../shared";
import AppIcon from "../AppIcon";

const OV_COLORS = ["#ff3b5c", "#ff6347", "#f97316", "#ffb800", "#cddc39", "#00c853", "#00bfa5", "#4fc3f7", "#2962ff", "#5c4db1", "#ab47bc", "#ff1667"];

// Top sessions by tokens - windowed list is computed by the parent (it needs
// the full allTokens + allSessionProjects join), this just renders it.
export function TopSessionsCard({ tokensBySessionWindowed, intervalTabsEl }: {
    tokensBySessionWindowed: Token[]; intervalTabsEl: ReactNode;
}) {
    return (
        <div style={cardShell}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", margin: 0 }}>Top Sessions by Tokens</h3>
                {intervalTabsEl}
            </div>
            <div className="space-y-2">
                {tokensBySessionWindowed.slice(0, 6).map((t, i: number) => {
                    const total = t.input_tokens + t.output_tokens;
                    const maxTotal = tokensBySessionWindowed[0] ? tokensBySessionWindowed[0].input_tokens + tokensBySessionWindowed[0].output_tokens : 1;
                    const pct = Math.min((total / maxTotal) * 100, 100);
                    const project = t.project?.split("/").pop() || "unknown";
                    const color = OV_COLORS[i % OV_COLORS.length];
                    return (
                        <a key={t.session_id || i} href={`/${t.session_id}`} target="_blank" rel="noopener noreferrer"
                            className="block transition hover:bg-white/[0.03] cursor-pointer" style={{ textDecoration: "none" }}>
                            <div className="flex items-center justify-between mb-1">
                                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase" }}><AppIcon project={project} size={14} />{project}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color }}>{(total / 1000).toFixed(0)}K</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.8s", transitionDelay: `${i * 0.05}s` }} />
                            </div>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
