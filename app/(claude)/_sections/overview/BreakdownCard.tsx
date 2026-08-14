"use client";

import type { ReactNode } from "react";
import { cardShell } from "@/lib/ui-tokens";
import type { DayBucket } from "./types";

// RIGHT 40% of the "Activity Heatmap + Stats" row - message/token/session
// totals for the selected interval plus a day-by-day bar chart.
export function BreakdownCard({ dailyData, breakdownInterval, intervalTabsEl }: {
    dailyData: DayBucket[];
    breakdownInterval: "24h" | "7d" | "30d" | "all";
    intervalTabsEl: ReactNode;
}) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

    const intervalDays: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "all": Infinity };
    const windowDays = intervalDays[breakdownInterval] ?? 7;
    const cutoffDate = new Date(now);
    cutoffDate.setDate(now.getDate() - (windowDays === Infinity ? 9999 : windowDays - 1));
    const cutoffStr = ymd(cutoffDate);

    const periodDays = dailyData.filter(d => d.day >= cutoffStr);

    const sum = periodDays.reduce((acc, d) => ({
        turns:    acc.turns    + d.turns,
        input:    acc.input    + d.input,
        output:   acc.output   + d.output,
        sessions: acc.sessions + d.sessions,
    }), { turns: 0, input: 0, output: 0, sessions: 0 });

    const totalTok = sum.input + sum.output;
    function ft(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}k` : String(n); }

    // Bar chart rows — daily (week/month) or single row (today)
    const barRowsRaw = periodDays.slice().sort((a, b) => a.day.localeCompare(b.day));
    // Ensure today is always in the list — oldest on top, today on the bottom (matches heatmap order)
    if (!barRowsRaw.find(d => d.day === todayStr)) {
        barRowsRaw.push({ day: todayStr, turns: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, sessions: 0 });
    }
    const barRows = barRowsRaw;
    const barMax = Math.max(...barRows.map(d => d.turns), 1);

    return (
        <div style={{ ...cardShell, flex: "0 0 40%", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Header + interval tabs */}
            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Breakdown</p>
                {intervalTabsEl}
            </div>

            {/* Big numbers */}
            <div className="flex items-end gap-5">
                <div>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Messages</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{sum.turns.toLocaleString()}</p>
                </div>
                <div>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tokens</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#00d9ff", lineHeight: 1 }}>{ft(totalTok)}</p>
                </div>
                <div>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sessions</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#a3e635", lineHeight: 1 }}>{sum.sessions}</p>
                </div>
            </div>

            {/* Day-by-day bar rows (week / month) */}
            {barRows.length > 0 && (
                <div className="space-y-1.5">
                    {barRows.map(d => {
                        const pct = Math.max((d.turns / barMax) * 100, d.turns > 0 ? 2 : 0);
                        const label = new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                        const isToday = d.day === todayStr;
                        return (
                            <div key={d.day} className="flex items-center gap-2">
                                <span style={{ fontSize: 9, color: isToday ? "#fff" : "rgba(255,255,255,0.25)", width: 70, flexShrink: 0, fontWeight: isToday ? 700 : 400 }}>{label}</span>
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: isToday ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)", transition: "width 0.6s" }} />
                                </div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", width: 28, textAlign: "right", flexShrink: 0 }}>{d.turns}</span>
                            </div>
                        );
                    })}
                </div>
            )}

        </div>
    );
}
