"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Flame, Zap, Star, Cpu, Coins } from "lucide-react";
import { cardShell, heatRamp } from "@/lib/ui-tokens";
import { localYMD } from "./utils";
import { LiveClock } from "./LiveClock";
import type { HeatmapData } from "./types";

// LEFT 60% of the "Activity Heatmap + Stats" row - the punchcard/calendar
// heatmap, today's hourly rhythm, and the summary stat grid to its right.
export function ActivityHeatmapCard({
    heatmapData, byDayHour, intervalTab, drillMachine,
    winActiveDays, winTotalDays, winMostActiveLabel, winTotalTokens, favoriteModel,
    intervalTabsEl,
}: {
    heatmapData: HeatmapData;
    byDayHour: Record<string, number[]>;
    intervalTab: "24h" | "7d" | "30d" | "all";
    drillMachine: string;
    winActiveDays: number;
    winTotalDays: number;
    winMostActiveLabel: string;
    winTotalTokens: number;
    favoriteModel: string;
    intervalTabsEl: ReactNode;
}) {
    const { cellMap, weeksCount, months, maxTurns, longestStreak, currentStreak, dayMap } = heatmapData;
    const cellSize = 11, gap = 2;
    function getColor(turns: number): string {
        return heatRamp(turns === 0 ? 0 : Math.min(turns / (maxTurns * 0.6), 1));
    }
    return (
        <div style={{ ...cardShell, flex: "0 0 60%", minWidth: 0 }}>
            <div className="mb-3 flex items-center justify-between" style={{ gap: 8, flexWrap: "wrap" }}>
                <div className="flex items-center" style={{ gap: 10, minWidth: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Activity</p>
                    <LiveClock />
                </div>
                {intervalTabsEl}
            </div>

            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Heatmap / strip + by-hour — capped width keeps cells small squares; stats sit to its right */}
            <div style={{ minWidth: 0, flex: "7 1 0" }}>
            {/* 7d → clean 7-cell day strip; longer windows → calendar grid */}
            {intervalTab === "7d" ? (() => {
                // Each day = a horizontal 24h strip (hour 0 left -> 23 right). 7 rows, oldest on top -> TODAY on bottom.
                const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
                const isos = days.map(d => localYMD(d));
                const hourMax = Math.max(1, ...isos.flatMap(iso => byDayHour[iso] ?? []));
                const fmtH = (h: number) => h === 12 ? "NOON" : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "AM" : "PM"}`;
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
                                                <Link key={h} href={`/sessions?date=${iso}&hour=${h}&turn=${n}${drillMachine}`} title={`${iso} ${fmtH(h)}: ${n} turns${isNow ? " (now)" : ""} - click to drill down`} aria-label={`${iso} ${fmtH(h)}: ${n} turns, open sessions`} className="group"
                                                    style={{ ...sharedStyle, cursor: "pointer", textDecoration: "none" }}>
                                                    {label}
                                                </Link>
                                            ) : (
                                                <div key={h} title={`${iso} ${fmtH(h)}: 0 turns${isNow ? " (now)" : ""}`} className="group" style={sharedStyle}>{label}</div>
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
                                    <span key={idx}>{fmtH(idx)}</span>
                                ))}
                            </div>
                            <span style={{ width: 32, flexShrink: 0 }} />
                        </div>
                    </div>
                );
            })() : (
            <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                <div style={{ display: "flex", marginLeft: 26, marginBottom: 2, position: "relative", height: 14 }}>
                    {months.map((m, i) => (
                        <span key={i} style={{ position: "absolute", left: m.weekIndex * (cellSize + gap), fontSize: 9, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{m.label}</span>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap, width: 26, flexShrink: 0 }}>
                        {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                            <span key={i} style={{ height: cellSize, fontSize: 8, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center" }}>{d}</span>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap }}>
                        {Array.from({ length: weeksCount }, (_, wi) => (
                            <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
                                {Array.from({ length: 7 }, (_, di) => {
                                    const cell = cellMap.get(`${wi}-${di}`);
                                    const todayStr = localYMD(new Date());
                                    const isToday = cell?.date === todayStr;
                                    return (
                                        <div key={di}
                                            title={cell ? `${cell.date}: ${cell.turns} turns` : ""}
                                            role={cell ? "img" : undefined}
                                            aria-label={cell ? `${cell.date}: ${cell.turns} turns` : undefined}
                                            style={{
                                                width: cellSize, height: cellSize, borderRadius: 2,
                                                background: cell ? (isToday && cell.turns > 0 ? "rgba(255,255,255,0.95)" : getColor(cell.turns)) : "transparent",
                                                boxShadow: isToday && cell?.turns ? "0 0 6px rgba(255,255,255,0.3)" : "none",
                                                outline: isToday ? "1px solid rgba(255,255,255,0.4)" : "none",
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            )}

            {/* Today's hourly rhythm - calendar order, aligned with the per-day punchcard above.
                Cells past the current hour are genuinely empty (not yet happened today).
                Hidden on 7d: the top row already shows today's hourly strip with a highlight, so this would duplicate it. */}
            {intervalTab !== "7d" && Object.keys(byDayHour).length > 0 && (() => {
                const todayIso = localYMD(new Date());
                const todayHours = byDayHour[todayIso] ?? new Array(24).fill(0);
                const maxHour = Math.max(...todayHours, 1);
                const peakHour = todayHours.indexOf(maxHour);
                const fmtHour = (h: number) => h === 12 ? "NOON" : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "AM" : "PM"}`;
                const nowHour = new Date().getHours();
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
                            <div style={{ flex: 1, display: "flex", gap: 2 }}>
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

            {/* Stats — label left, colored value right-aligned, stacked to the right of the heatmap */}
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
