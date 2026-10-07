"use client";

import { cardShell } from "@/lib/ui-tokens";
import { WindowBadge, type Window4 } from "../shared";
import type { DayBucket } from "./types";

// RIGHT 40% of the "Activity Heatmap + Stats" row - message/token/session
// totals for the selected interval plus a day-by-day bar chart (hour-by-hour
// rows for Today).
export function BreakdownCard({ dailyData, breakdownInterval, win, byDayHour, exact }: {
    dailyData: DayBucket[];
    breakdownInterval: "today" | "7d" | "30d" | "all";
    win: Window4;
    byDayHour?: Record<string, number[]>;
    exact?: { turns: number; tokens: number; sessions: number }; // window totals from the tokens route; falls back to the daily sums
}) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

    const intervalDays: Record<string, number> = { today: 1, "7d": 7, "30d": 30, all: Infinity };
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

    const totalTurns = exact?.turns ?? sum.turns;
    const totalTok = exact?.tokens ?? sum.input + sum.output;
    // Distinct sessions, not session-days: a session spanning 2 days counts once.
    const totalSessions = exact?.sessions ?? sum.sessions;
    function ft(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}k` : String(n); }

    // Bar chart rows - daily (week/month) or single row (today)
    const barRowsRaw = periodDays.slice().sort((a, b) => a.day.localeCompare(b.day));
    // Ensure today is always in the list - oldest on top, today on the bottom (matches heatmap order)
    if (!barRowsRaw.find(d => d.day === todayStr)) {
        barRowsRaw.push({ day: todayStr, turns: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, sessions: 0 });
    }
    // 30d: 30 day rows made the card 3x taller than its neighbours, so the days
    // roll up into Monday-start calendar weeks (Week 1 oldest, Week 5 this week).
    type BarRow = { key: string; label: string; sub?: string; turns: number; current: boolean };
    const short = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const weekStart = (d: string) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return ymd(dt); };
    const barRows: BarRow[] = win === "30d"
        ? [...barRowsRaw.reduce((m, d) => {
            const k = weekStart(d.day);
            const w = m.get(k) ?? { key: k, first: d.day, last: d.day, turns: 0, current: false };
            w.last = d.day; w.turns += d.turns; w.current ||= d.day === todayStr;
            return m.set(k, w);
        }, new Map<string, { key: string; first: string; last: string; turns: number; current: boolean }>()).values()]
            .map((w, i) => ({ key: w.key, label: `Week ${i + 1}`, sub: `${short(w.first)} - ${short(w.last)}`, turns: w.turns, current: w.current }))
        : barRowsRaw.map(d => ({ key: d.day, label: new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), turns: d.turns, current: d.day === todayStr }));
    const barMax = Math.max(...barRows.map(d => d.turns), 1);

    // Today: 24 columns, midnight to 11 PM, rising from a shared baseline
    // like a skyline. Hours still to come stay as empty stubs.
    const hourTurns = byDayHour?.[todayStr] ?? [];
    const hourNow = now.getHours();
    const hourCols = Array.from({ length: 24 }, (_, h) => ({ h, turns: hourTurns[h] ?? 0 }));
    const hourMax = Math.max(...hourCols.map(r => r.turns), 1);
    const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
    const hourTick = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
    // Red "now" line sits at the exact minute of the day; gridlines at quarter steps of the tallest hour.
    const nowPct = ((hourNow * 60 + now.getMinutes()) / 1440) * 100;
    const nowLabel = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const gridSteps = [0.25, 0.5, 0.75, 1];

    return (
        <div style={{ ...cardShell, flex: "0 0 40%", display: "flex", flexDirection: "column", gap: 14 }}>

            <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Breakdown</p>
                <WindowBadge win={win} />
            </div>

            {/* Big numbers */}
            <div className="flex items-end gap-5">
                <div>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Messages</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{totalTurns.toLocaleString()}</p>
                </div>
                <div>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tokens</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#00d9ff", lineHeight: 1 }}>{ft(totalTok)}</p>
                </div>
                <div>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sessions</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#a3e635", lineHeight: 1 }}>{totalSessions}</p>
                </div>
            </div>

            {/* Hour-by-hour columns (today) */}
            {win === "today" && (
                <div aria-label="Breakdown by hour" style={{ paddingTop: 14 }}>
                    <div className="flex items-end" style={{ gap: 3, height: 120, position: "relative" }}>
                        {gridSteps.map(f => (
                            <div key={f} aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: `${f * 100}%`, borderTop: "1px solid rgba(255,255,255,0.07)", pointerEvents: "none" }}>
                                <span style={{ position: "absolute", right: 0, top: -11, fontSize: 8, color: "rgba(255,255,255,0.22)" }}>{Math.round(hourMax * f)}</span>
                            </div>
                        ))}
                        <div aria-label={`Now ${nowLabel}`} title={nowLabel} style={{ position: "absolute", left: `${nowPct}%`, top: -4, bottom: 0, width: 1, background: "#FF3B30", boxShadow: "0 0 6px rgba(255,59,48,0.8)", zIndex: 2, pointerEvents: "none" }}>
                            <span style={{ position: "absolute", top: -12, left: 3, fontSize: 8, fontWeight: 700, color: "#FF3B30", whiteSpace: "nowrap" }}>{nowLabel}</span>
                        </div>
                        {hourCols.map(c => {
                            const isNow = c.h === hourNow;
                            const future = c.h > hourNow;
                            const pct = c.turns > 0 ? Math.max((c.turns / hourMax) * 100, 3) : 0;
                            return (
                                <div key={c.h} title={`${hourLabel(c.h)} - ${c.turns} messages`} className="flex flex-col items-center justify-end" style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", zIndex: 1 }}>
                                    {c.turns > 0 && <span style={{ fontSize: 8, lineHeight: "10px", marginBottom: 2, color: isNow ? "#fff" : "rgba(255,255,255,0.45)", fontWeight: isNow ? 700 : 400 }}>{c.turns}</span>}
                                    <div style={{ width: "100%", height: pct > 0 ? `${pct}%` : 2, borderRadius: "3px 3px 0 0", background: isNow ? "rgba(255,255,255,0.9)" : future ? "rgba(255,255,255,0.05)" : c.turns > 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)", transition: "height 0.6s" }} />
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex" style={{ gap: 3, marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 4 }}>
                        {hourCols.map(c => (
                            <span key={c.h} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 8, color: c.h === hourNow ? "#fff" : "rgba(255,255,255,0.25)", fontWeight: c.h === hourNow ? 700 : 400 }}>{c.h % 3 === 0 || c.h === hourNow ? hourTick(c.h) : ""}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Day-by-day bar rows (week / month) */}
            {win !== "today" && barRows.length > 0 && (
                <div className="space-y-1.5" aria-label="Breakdown by day">
                    {barRows.map(d => {
                        const pct = Math.max((d.turns / barMax) * 100, d.turns > 0 ? 2 : 0);
                        const isToday = d.current;
                        return (
                            <div key={d.key} className="flex items-center gap-2">
                                <span style={{ fontSize: 9, color: isToday ? "#fff" : "rgba(255,255,255,0.25)", width: 70, flexShrink: 0, fontWeight: isToday ? 700 : 400, lineHeight: 1.2 }}>
                                    {d.label}
                                    {d.sub && <span style={{ display: "block", fontSize: 8, fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>{d.sub}</span>}
                                </span>
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: isToday ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)", transition: "width 0.6s" }} />
                                </div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", width: 34, textAlign: "right", flexShrink: 0 }}>{d.turns.toLocaleString()}</span>
                            </div>
                        );
                    })}
                </div>
            )}

        </div>
    );
}
