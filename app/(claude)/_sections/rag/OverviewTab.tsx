"use client";

import { memo } from "react";
import { DatabaseZap, Layers, Brain, FolderOpen } from "lucide-react";
import type { Stats, RagTab } from "./types";
import { Sparkline } from "../McpLogPanel";

// Static import, not next/dynamic: a lazy chunk left the space empty, so the
// Documents section rendered first and then got pushed down by the charts.
import RagCharts from "../RagCharts";

// Overview tab - stat cards on top, chart.js panels below.
function OverviewTab({ stats, onNavigate }: { stats: Stats; onNavigate: (tab: RagTab) => void }) {
    return (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: 16 }}>
                {[
                    // Big number is what was added in the hero window, the small one is everything stored.
                    { label: "Documents", value: stats.windowed?.docs, total: stats.documents, icon: DatabaseZap, color: "#FF3B30", tab: "documents" as RagTab, trend: "docs" as const },
                    { label: "Chunks", value: stats.windowed?.chunks, total: stats.chunks, icon: Layers, color: "#FF6347", tab: "documents" as RagTab, trend: "chunks" as const },
                    // Preferences are learned once and kept, so this card is all-time on every window.
                    { label: "Preferences", value: stats.preferences, total: undefined, icon: Brain, color: "#FF9500", tab: "preferences" as RagTab, trend: "prefs" as const },
                    { label: "Projects", value: stats.windowed?.projects, total: stats.projects, icon: FolderOpen, color: "#f97316", tab: "documents" as RagTab, trend: "projects" as const },
                ].map(c => (
                    <div key={c.label} onClick={() => onNavigate(c.tab)}
                        className="cursor-pointer"
                        style={{
                            padding: "16px 18px", borderRadius: 12,
                            background: `linear-gradient(135deg, ${c.color}08 0%, rgba(255,255,255,0.02) 100%)`,
                            border: `1px solid ${c.color}20`,
                            transition: "border-color 0.3s, box-shadow 0.3s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${c.color}40`; e.currentTarget.style.boxShadow = `0 0 20px ${c.color}15`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = `${c.color}20`; e.currentTarget.style.boxShadow = "none"; }}>
                        <div className="flex items-center gap-2 mb-2">
                            <c.icon size={16} style={{ color: c.color }} />
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>{c.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <span style={{ fontSize: 28, fontWeight: 800, color: c.color, lineHeight: 1 }}>{(c.value ?? 0).toLocaleString()}</span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{c.total === undefined ? "all time" : `of ${c.total.toLocaleString()}`}</span>
                        </div>
                        {(stats.trend?.length ?? 0) > 1 && <Sparkline values={stats.trend!.map(t => t[c.trend])} color={c.color} />}
                    </div>
                ))}
            </div>

            <RagCharts days={stats.windowed?.days ?? 0} />
        </div>
    );
}

export default memo(OverviewTab);
