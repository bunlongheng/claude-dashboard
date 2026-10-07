"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Flame, Zap, Star, Cpu, Coins } from "lucide-react";
import { cardShell, heatRamp } from "@/lib/ui-tokens";
import { WindowBadge, safeFetch } from "../shared";
import { useMachine } from "../MachineContext";
import { localYMD } from "./utils";
import { LiveClock } from "./LiveClock";
import type { HeatmapData } from "./types";

// 12-hour label e.g. "6AM", "NOON", "11PM" - shared by the 7d strip, the
// hourly rhythm row, and the minute grid below.
function fmtHour(h: number): string {
    return h === 12 ? "NOON" : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "AM" : "PM"}`;
}

type MinuteStats = { date: string; slotMinutes: number; buckets: number[]; total: number };
const EMPTY_MINUTE_STATS: MinuteStats = { date: "", slotMinutes: 5, buckets: new Array(288).fill(0), total: 0 };

// LEFT 60% of the "Activity Heatmap + Stats" row - the punchcard/calendar
// heatmap, today's hourly rhythm, and the summary stat grid to its right.
export function ActivityHeatmapCard({
    heatmapData, byDayHour, intervalTab, drillMachine,
    winActiveDays, winTotalDays, winMostActiveLabel, winTotalTokens, favoriteModel,
}: {
    heatmapData: HeatmapData;
    byDayHour: Record<string, number[]>;
    intervalTab: "today" | "7d" | "30d" | "all";
    drillMachine: string;
    winActiveDays: number;
    winTotalDays: number;
    winMostActiveLabel: string;
    winTotalTokens: number;
    favoriteModel: string;
}) {
    const { maxTurns, longestStreak, currentStreak, dayMap } = heatmapData;
    function getColor(turns: number): string {
        return heatRamp(turns === 0 ? 0 : Math.min(turns / (maxTurns * 0.6), 1));
    }
    const { apiBase } = useMachine();
    const todayIso = localYMD(new Date());
    const minuteUrl = `${apiBase("/api/claude/turns-by-minute")}?date=${todayIso}`;
    const minuteQ = useQuery<MinuteStats>({
        queryKey: ["turns-by-minute", todayIso, minuteUrl],
        queryFn: () => safeFetch<MinuteStats>(minuteUrl, EMPTY_MINUTE_STATS),
        refetchInterval: 30_000,
        enabled: intervalTab === "today",
    });
    return (
        <div style={{ ...cardShell, flex: "0 0 60%", minWidth: 0 }}>
            <div className="mb-3 flex items-center justify-between" style={{ gap: 8, flexWrap: "wrap" }}>
                <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Activity</p>
                    <LiveClock />
                </div>
                <WindowBadge win={intervalTab} />
            </div>

            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Heatmap / strip + by-hour - capped width keeps cells small squares; stats sit to its right */}
            <div style={{ minWidth: 0, flex: "7 1 0" }}>
            {/* 7d → 7 hour strips; 30d → month grid by week; all → 1 row per month. Today → 30-minute grid over the hour strip, same 24h axis. */}
            {intervalTab === "7d" ? (() => {
                // Each day = a horizontal 24h strip (hour 0 left -> 23 right). 7 rows, oldest on top -> TODAY on bottom.
                const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
                const isos = days.map(d => localYMD(d));
                const hourMax = Math.max(1, ...isos.flatMap(iso => byDayHour[iso] ?? []));
                const cellColor = (n: number) => heatRamp(!n ? 0 : Math.min(n / (hourMax * 0.7), 1));
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {days.map((d, i) => {
                            const iso = isos[i];
                            const hours = byDayHour[iso] ?? [];
                            const turns = dayMap.get(iso) ?? 0;
                            const isToday = i === days.length - 1;
                            return (
                                <div key={iso} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 8, color: isToday ? "#fff" : "rgba(255,255,255,0.5)", width: 26, textAlign: "right", flexShrink: 0, fontWeight: isToday ? 700 : 500 }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                                    <div title={`${iso}: ${turns} turns`} style={{
                                        flex: 1, display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, borderRadius: 2,
                                        outline: isToday ? "1px solid rgba(255,255,255,0.4)" : "none",
                                        boxShadow: isToday && turns > 0 ? "0 0 6px rgba(255,255,255,0.2)" : "none",
                                    }}>
                                        {Array.from({ length: 24 }, (_, h) => {
                                            const n = hours[h] ?? 0;
                                            // Current hour on today's row: soft 5s breathing glow so "now" pulses live.
                                            const isNow = isToday && h === new Date().getHours();
                                            const nowStyle = isNow ? { background: "rgba(255,255,255,0.9)", outline: "1px solid rgba(255,255,255,0.85)", outlineOffset: -1, animation: "cellBreathe 5s ease-in-out infinite" } : null;
                                            const sharedStyle = { aspectRatio: "1", minWidth: 0, borderRadius: 2, background: cellColor(n), display: "flex", alignItems: "center", justifyContent: "center", ...nowStyle } as const;
                                            const label = <span className="opacity-0 group-hover:opacity-100" style={{ fontSize: 7, fontWeight: 700, color: "#000", lineHeight: 1, textShadow: "0 0 2px rgba(255,255,255,0.6)", transition: "opacity 100ms", pointerEvents: "none" }}>{n > 0 ? n : ""}</span>;
                                            return n > 0 ? (
                                                <Link key={h} href={`/sessions?date=${iso}&hour=${h}&turn=${n}${drillMachine}`} title={`${iso} ${fmtHour(h)}: ${n} turns${isNow ? " (now)" : ""} - click to drill down`} aria-label={`${iso} ${fmtHour(h)}: ${n} turns, open sessions`} className="group"
                                                    style={{ ...sharedStyle, cursor: "pointer", textDecoration: "none" }}>
                                                    {label}
                                                </Link>
                                            ) : (
                                                <div key={h} title={`${iso} ${fmtHour(h)}: 0 turns${isNow ? " (now)" : ""}`} className="group" style={sharedStyle}>{label}</div>
                                            );
                                        })}
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: turns > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)", width: 32, textAlign: "right", flexShrink: 0 }}>{turns}</span>
                                </div>
                            );
                        })}
                        {/* Hour guide under the strip - matches the 26px weekday + 32px total column widths so labels align with the cells above. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                            <span style={{ width: 26, flexShrink: 0 }} />
                            <div className="flex justify-between" style={{ flex: 1, fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
                                {[0, 6, 12, 18, 23].map(idx => (
                                    <span key={idx}>{fmtHour(idx)}</span>
                                ))}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                    </div>
                );
            })() : intervalTab === "30d" ? (() => {
                // 30d: a month grid - 1 row per Monday-start week, 7 day cells across, so all
                // 30 days read at a glance and the rows line up with the Breakdown card's weeks.
                const today = new Date();
                const start = new Date(today); start.setDate(today.getDate() - 29);
                const first = new Date(start); first.setDate(start.getDate() - ((start.getDay() + 6) % 7));
                const startIso = localYMD(start);
                const weeks: Date[][] = [];
                for (const d = new Date(first); d <= today; d.setDate(d.getDate() + 7)) {
                    weeks.push(Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }));
                }
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 40, flexShrink: 0 }} />
                            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
                                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d} style={{ textAlign: "center" }}>{d}</span>)}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                        {weeks.map((w, wi) => {
                            const isos = w.map(x => localYMD(x));
                            const total = isos.reduce((sum, iso) => sum + (iso >= startIso && iso <= todayIso ? dayMap.get(iso) ?? 0 : 0), 0);
                            const isCur = isos.includes(todayIso);
                            return (
                                <div key={wi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 8, color: isCur ? "#fff" : "rgba(255,255,255,0.5)", width: 40, textAlign: "right", flexShrink: 0, fontWeight: isCur ? 700 : 500 }}>Week {wi + 1}</span>
                                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                                        {w.map((x, i) => {
                                            const iso = isos[i];
                                            const inWin = iso >= startIso && iso <= todayIso;
                                            const n = inWin ? dayMap.get(iso) ?? 0 : 0;
                                            const isToday = iso === todayIso;
                                            const lit = isToday && n > 0;
                                            // Ramp tops out near white, so the busiest cells need dark text.
                                            const dark = lit || n >= maxTurns * 0.3;
                                            const style = {
                                                height: 22, borderRadius: 3, minWidth: 0, overflow: "hidden", padding: "0 5px", textDecoration: "none",
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                background: !inWin ? "transparent" : lit ? "rgba(255,255,255,0.95)" : getColor(n),
                                                outline: isToday ? "1px solid rgba(255,255,255,0.5)" : !inWin ? "1px dashed rgba(255,255,255,0.06)" : "none", outlineOffset: -1,
                                                boxShadow: lit ? "0 0 6px rgba(255,255,255,0.25)" : "none",
                                            } as const;
                                            const inner = <>
                                                <span style={{ fontSize: 8, fontWeight: 700, lineHeight: 1, color: !inWin ? "rgba(255,255,255,0.12)" : dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.55)" }}>{x.getDate()}</span>
                                                {n > 0 && <span style={{ fontSize: 8, fontWeight: 600, lineHeight: 1, color: dark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.75)" }}>{n.toLocaleString()}</span>}
                                            </>;
                                            return n > 0 ? (
                                                <Link key={iso} href={`/sessions?date=${iso}${drillMachine}`} title={`${iso}: ${n} turns - click to drill down`} aria-label={`${iso}: ${n} turns, open sessions`} style={{ ...style, cursor: "pointer" }}>{inner}</Link>
                                            ) : (
                                                <div key={iso} title={inWin ? `${iso}: 0 turns` : undefined} style={style}>{inner}</div>
                                            );
                                        })}
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: total > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)", width: 32, textAlign: "right", flexShrink: 0 }}>{total.toLocaleString()}</span>
                                </div>
                            );
                        })}
                    </div>
                );
            })() : intervalTab === "all" ? (() => {
                // All: 1 row per calendar month from the first recorded day to today, 31 day
                // columns, so the rows line up with the Breakdown card's month rollup.
                const days = [...dayMap.keys()].sort();
                const firstIso = days[0] ?? todayIso;
                const today = new Date();
                const months: Date[] = [];
                for (const m = new Date(firstIso.slice(0, 4) + "-" + firstIso.slice(5, 7) + "-01T12:00:00"); m <= today; m.setMonth(m.getMonth() + 1)) months.push(new Date(m));
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 52, flexShrink: 0 }} />
                            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(31, 1fr)", gap: 2, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>
                                {Array.from({ length: 31 }, (_, i) => <span key={i} style={{ textAlign: "center" }}>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</span>)}
                            </div>
                            <span style={{ width: 36, flexShrink: 0 }} />
                        </div>
                        {months.map(m => {
                            const y = m.getFullYear(), mo = m.getMonth();
                            const len = new Date(y, mo + 1, 0).getDate();
                            const isCur = y === today.getFullYear() && mo === today.getMonth();
                            const isos = Array.from({ length: 31 }, (_, i) => i < len ? localYMD(new Date(y, mo, i + 1, 12)) : null);
                            const total = isos.reduce((sum, iso) => sum + (iso ? dayMap.get(iso) ?? 0 : 0), 0);
                            return (
                                <div key={`${y}-${mo}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 8, color: isCur ? "#fff" : "rgba(255,255,255,0.5)", width: 52, textAlign: "right", flexShrink: 0, fontWeight: isCur ? 700 : 500 }}>{m.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(31, 1fr)", gap: 2 }}>
                                        {isos.map((iso, i) => {
                                            if (!iso) return <div key={i} />;
                                            const inWin = iso >= firstIso && iso <= todayIso;
                                            const n = inWin ? dayMap.get(iso) ?? 0 : 0;
                                            const isToday = iso === todayIso;
                                            const lit = isToday && n > 0;
                                            const style = {
                                                height: 20, borderRadius: 2, minWidth: 0, display: "block",
                                                background: !inWin ? "transparent" : lit ? "rgba(255,255,255,0.95)" : getColor(n),
                                                outline: isToday ? "1px solid rgba(255,255,255,0.5)" : !inWin ? "1px dashed rgba(255,255,255,0.06)" : "none", outlineOffset: -1,
                                            } as const;
                                            return n > 0 ? (
                                                <Link key={iso} href={`/sessions?date=${iso}${drillMachine}`} title={`${iso}: ${n} turns - click to drill down`} aria-label={`${iso}: ${n} turns, open sessions`} style={{ ...style, cursor: "pointer" }} />
                                            ) : (
                                                <div key={iso} title={inWin ? `${iso}: 0 turns` : undefined} style={style} />
                                            );
                                        })}
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: total > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)", width: 36, textAlign: "right", flexShrink: 0 }}>{total.toLocaleString()}</span>
                                </div>
                            );
                        })}
                    </div>
                );
            })() : intervalTab === "today" ? (() => {
                // 30-minute grid for today only - column = hour (0-23 left to right), row = half hour
                // (:00 on top, :30 below). The route returns 5-minute buckets, so 6 are summed per cell.
                const raw = minuteQ.data?.buckets ?? EMPTY_MINUTE_STATS.buckets;
                const buckets = Array.from({ length: 48 }, (_, i) => raw.slice(i * 6, i * 6 + 6).reduce((a, b) => a + b, 0));
                const max = Math.max(1, ...buckets);
                const now = new Date();
                const curSlot = now.getHours() * 2 + Math.floor(now.getMinutes() / 30);
                const cellColor = (n: number) => heatRamp(n === 0 ? 0 : Math.min(n / (max * 0.7), 1));
                return (
                    <div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ display: "grid", gridTemplateRows: "repeat(2, 1fr)", gap: 2, width: 26, flexShrink: 0 }}>
                                {Array.from({ length: 2 }, (_, row) => (
                                    <span key={row} style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                        {row === 0 ? ":00" : ":30"}
                                    </span>
                                ))}
                            </div>
                            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
                                {Array.from({ length: 2 }, (_, row) => (
                                    Array.from({ length: 24 }, (_, h) => {
                                        const idx = h * 2 + row;
                                        const n = buckets[idx] ?? 0;
                                        const isFuture = idx > curSlot;
                                        const isNow = idx === curSlot;
                                        const mm = String(row * 30).padStart(2, "0");
                                        const mm2 = String(row * 30 + 30).padStart(2, "0");
                                        const sharedStyle = {
                                            // Square cells; the grid shares the row with the hour strip.
                                            aspectRatio: "1", minWidth: 0, borderRadius: 2,
                                            background: isFuture ? "rgba(255,255,255,0.02)" : isNow ? "rgba(255,255,255,0.9)" : cellColor(n),
                                            outline: isNow ? "1px solid rgba(255,255,255,0.85)" : "none",
                                            outlineOffset: isNow ? -1 : undefined,
                                            animation: isNow ? "cellBreathe 5s ease-in-out infinite" : undefined,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        } as const;
                                        const label = <span className="opacity-0 group-hover:opacity-100" style={{ fontSize: 7, fontWeight: 700, color: "#000", lineHeight: 1, textShadow: "0 0 2px rgba(255,255,255,0.6)", transition: "opacity 100ms", pointerEvents: "none" }}>{n > 0 ? n : ""}</span>;
                                        return (!isFuture && n > 0) ? (
                                            <Link key={idx} href={`/sessions?date=${todayIso}&hour=${h}&turn=${n}${drillMachine}`} title={`${fmtHour(h)} :${mm}-:${mm2}: ${n} turns${isNow ? " (now)" : ""} - click to drill down`} className="group"
                                                style={{ ...sharedStyle, cursor: "pointer", textDecoration: "none" }}>
                                                {label}
                                            </Link>
                                        ) : (
                                            <div key={idx} title={`${fmtHour(h)} :${mm}-:${mm2}: ${n} turns${isNow ? " (now)" : isFuture ? " (not yet)" : ""}`} className="group" style={sharedStyle}>
                                                {label}
                                            </div>
                                        );
                                    })
                                ))}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                        {/* Hour guide under the grid - matches the 26px left + 32px right spacers used elsewhere so labels line up with the cells above. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                            <span style={{ width: 26, flexShrink: 0 }} />
                            <div className="flex justify-between" style={{ flex: 1, fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
                                {[0, 6, 12, 18, 23].map(idx => (
                                    <span key={idx}>{fmtHour(idx)}</span>
                                ))}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                    </div>
                );
            })() : null}

            {/* Today's hourly rhythm under the 30-minute grid. Today view only: 7d already has
                today's hour strip as its bottom row, and 30d / all are day grids where it would be noise. */}
            {intervalTab === "today" && Object.keys(byDayHour).length > 0 && (() => {
                const todayIso = localYMD(new Date());
                const todayHours = byDayHour[todayIso] ?? new Array(24).fill(0);
                const maxHour = Math.max(...todayHours, 1);
                const peakHour = todayHours.indexOf(maxHour);
                const nowHour = new Date().getHours();
                // Red now line at the exact minute, same as the Breakdown hour chart.
                const nowPct = ((nowHour * 60 + new Date().getMinutes()) / 1440) * 100;
                const nowLabel = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                const hourColor = (n: number) => heatRamp(n === 0 ? 0 : Math.min(n / (maxHour * 0.7), 1));
                return (
                    <div style={{ marginTop: 14 }}>
                        {/* Spacers (26px / 32px) match the per-day weekday + total columns so cells line up exactly. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ width: 26, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.55)", textAlign: "right", flexShrink: 0 }}>Today</span>
                            <div style={{ flex: 1 }} />
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 26, flexShrink: 0 }} />
                            <div style={{ flex: 1, display: "flex", gap: 2, position: "relative" }}>
                                <div aria-label={`Now ${nowLabel}`} title={nowLabel} style={{ position: "absolute", left: `${nowPct}%`, top: -4, bottom: -4, width: 1, background: "#FF3B30", boxShadow: "0 0 6px rgba(255,59,48,0.8)", zIndex: 2, pointerEvents: "none" }}>
                                    <span style={{ position: "absolute", top: -12, left: 3, fontSize: 8, fontWeight: 700, color: "#FF3B30", whiteSpace: "nowrap" }}>{nowLabel}</span>
                                </div>
                                {todayHours.map((n, h) => {
                                    const isFuture = h > nowHour;
                                    const sharedStyle = {
                                        flex: 1, height: 18, borderRadius: 2,
                                        background: isFuture ? "rgba(255,255,255,0.02)" : hourColor(n),
                                        outline: h === nowHour ? "1.5px solid rgba(255,255,255,0.75)" : (h === peakHour && n > 0) ? "1px solid rgba(255,255,255,0.45)" : "none",
                                        boxShadow: h === nowHour ? "0 0 4px rgba(255,255,255,0.35)" : "none",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                    } as const;
                                    const label = <span className="opacity-0 group-hover:opacity-100" style={{ fontSize: 9, fontWeight: 700, color: "#fff", lineHeight: 1, textShadow: "0 0 2px rgba(0,0,0,0.85)", transition: "opacity 100ms", pointerEvents: "none" }}>{(isFuture || n === 0) ? "" : n}</span>;
                                    return !isFuture && n > 0 ? (
                                        <Link key={h} href={`/sessions?date=${todayIso}&hour=${h}&turn=${n}${drillMachine}`} title={`${fmtHour(h)}: ${n} turns${h === nowHour ? " (now)" : ""} - click to drill down`} className="group"
                                            style={{ ...sharedStyle, cursor: "pointer", textDecoration: "none" }}>
                                            {label}
                                        </Link>
                                    ) : (
                                        <div key={h} title={`${fmtHour(h)}: ${n} turns${h === nowHour ? " (now)" : isFuture ? " (not yet)" : ""}`} className="group" style={sharedStyle}>
                                            {label}
                                        </div>
                                    );
                                })}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                            <span style={{ width: 26, flexShrink: 0 }} />
                            <div className="flex justify-between" style={{ flex: 1, fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
                                {[0, 6, 12, 18, 23].map(idx => (
                                    <span key={idx}>{fmtHour(idx)}</span>
                                ))}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                    </div>
                );
            })()}
            </div>

            {/* Stats - label left, colored value right-aligned, stacked to the right of the heatmap */}
            <div className="border-t border-white/[0.06] pt-3 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-6" style={{ flex: "3 1 0", minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24, rowGap: 12, alignContent: "center" }}>
                {[
                    { label: "Active days",    Icon: CalendarDays, value: `${winActiveDays}/${winTotalDays}`, color: "#4ade80" },
                    { label: "Longest streak", Icon: Flame,        value: `${longestStreak}d`,           color: "#f472b6" },
                    { label: "Current streak", Icon: Zap,          value: `${currentStreak}d`,           color: "#7C5CFF" },
                    { label: "Most active",    Icon: Star,         value: winMostActiveLabel,            color: "#22d3ee" },
                    { label: "Total tokens",   Icon: Coins,        value: winTotalTokens >= 1e6 ? `${(winTotalTokens/1e6).toFixed(1)}M` : `${(winTotalTokens/1e3).toFixed(0)}K`, color: "#4A9EFF" },
                    { label: "Top model",      Icon: Cpu,          value: favoriteModel || "-",          color: "#a3e635" },
                ].map(s => (
                    <div key={s.label} className="flex items-center justify-between" style={{ gap: 10, minWidth: 0 }} title={s.label}>
                        <span className="flex items-center" style={{ gap: 6, minWidth: 0, color: "rgba(255,255,255,0.55)" }}>
                            <s.Icon size={13} style={{ flexShrink: 0 }} />
                            <span className="hidden min-[2100px]:inline" style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{s.label}</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: s.color, whiteSpace: "nowrap", flexShrink: 0 }}>{s.value}</span>
                    </div>
                ))}
            </div>
            </div>
        </div>
    );
}
