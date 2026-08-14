"use client";

import { cardShell } from "@/lib/ui-tokens";
import AppIcon from "../AppIcon";
import type { CtxSession } from "./types";

export function ContextWindowCard({ ctxSessions }: { ctxSessions: CtxSession[] }) {
    return (
        <div style={cardShell}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0, marginBottom: 12 }}>Context Window</p>
            {ctxSessions.length > 0 ? (
                <div className="space-y-1.5">
                    {ctxSessions.slice(0, 8).map(s => {
                        const pct = Math.min((s.contextUsed / s.contextMax) * 100, 100);
                        const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#4ade80";
                        const label = s.customTitle || s.project;
                        const usedK = s.contextUsed >= 1e6 ? `${(s.contextUsed / 1e6).toFixed(1)}M` : `${(s.contextUsed / 1e3).toFixed(0)}K`;
                        const maxK = s.contextMax >= 1e6 ? `${(s.contextMax / 1e6).toFixed(0)}M` : `${(s.contextMax / 1e3).toFixed(0)}K`;
                        return (
                            <div key={s.sessionId} className="flex items-center justify-between" style={{ padding: "2px 0", gap: 8 }}>
                                <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
                                    <AppIcon project={s.project} size={14} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>{label}</span>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>{pct.toFixed(0)}% <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400, marginLeft: 4 }}>{usedK}/{maxK}</span></span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>No active sessions</p>
            )}
        </div>
    );
}
