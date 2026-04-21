"use client";

import { useState, useEffect, useMemo } from "react";
import {
    FolderOpen, Sparkles, Terminal, Webhook, Server, BookOpen,
    Brain, ShieldCheck, Puzzle, Coins, Activity, Zap, Settings,
} from "lucide-react";
import { useMachine } from "./MachineContext";

interface Stats {
    sessions: number;
    activeSessions: number;
    skills: number;
    commands: number;
    hooks: number;
    mcp: number;
    plugins: number;
    claudeMd: number;
    memory: number;
    rules: number;
    tokens: { input: number; output: number; cacheRead: number; cost: number };
}

function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const start = display;
        const diff = value - start;
        if (diff === 0) return;
        const startTime = performance.now();
        const animate = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + diff * ease));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, duration]);
    return <>{display.toLocaleString()}</>;
}

function StatCard({ label, value, icon: Icon, color, sub }: {
    label: string; value: number; icon: React.ElementType; color: string;
    sub?: string;
}) {
    return (
        <div style={{
            padding: "16px 18px", borderRadius: 12,
            background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`,
            border: `1px solid ${color}20`,
            transition: "border-color 0.3s, box-shadow 0.3s",
        }}
            className="hover:shadow-lg"
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.boxShadow = `0 0 20px ${color}15`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${color}20`; e.currentTarget.style.boxShadow = "none"; }}
        >
            <div className="flex items-center gap-2 mb-2">
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={14} style={{ color }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)" }}>{label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, marginBottom: sub ? 6 : 0 }}>
                <AnimatedNumber value={value} />
            </div>
            {sub && <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", margin: 0 }}>{sub}</p>}
        </div>
    );
}

function DonutChart({ segments, size = 120 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;
    const r = (size - 20) / 2;
    const cx = size / 2, cy = size / 2;
    let startAngle = -Math.PI / 2;

    return (
        <div className="flex items-center gap-4">
            <svg width={size} height={size}>
                {segments.map((seg, i) => {
                    const pct = seg.value / total;
                    const angle = pct * Math.PI * 2;
                    const endAngle = startAngle + angle;
                    const largeArc = angle > Math.PI ? 1 : 0;
                    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
                    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
                    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                    startAngle = endAngle;
                    return <path key={i} d={path} fill={seg.color} opacity={0.7} style={{ transition: "d 0.5s" }}>
                        <animate attributeName="opacity" from="0" to="0.7" dur="0.5s" begin={`${i * 0.1}s`} fill="freeze" />
                    </path>;
                })}
                <circle cx={cx} cy={cy} r={r * 0.55} fill="#08090d" />
                <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="16" fontWeight="800">{total}</text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontWeight="600">TOTAL</text>
            </svg>
            <div className="space-y-1">
                {segments.filter(s => s.value > 0).map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: s.color, marginLeft: "auto" }}>{s.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const OV_COLORS = ["#ff3b5c", "#ff6347", "#f97316", "#ffb800", "#cddc39", "#00c853", "#00bfa5", "#4fc3f7", "#2962ff", "#5c4db1", "#ab47bc", "#ff1667"];

export default function OverviewSection() {
    const { machine } = useMachine();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [allTokens, setAllTokens] = useState<any[]>([]);
    const [allSessionProjects, setAllSessionProjects] = useState<any[]>([]);
    const [chartPeriod, setChartPeriod] = useState<"today" | "7d" | "30d" | "all">("today");

    // Daily activity data
    const [dailyData, setDailyData] = useState<{ day: string; turns: number }[]>([]);
    const [favoriteModel, setFavoriteModel] = useState("");
    const [totalTokensAll, setTotalTokensAll] = useState(0);

    useEffect(() => {
        fetch("/api/claude/token-stats/daily").then(r => r.json()).then(d => {
            setDailyData(d.daily ?? []);
            setTotalTokensAll((d.daily ?? []).reduce((s: number, b: { input: number; output: number }) => s + b.input + b.output, 0));
            const models = d.byModel ?? [];
            if (models.length > 0) {
                const top = models.sort((a: { turns: number }, b: { turns: number }) => b.turns - a.turns)[0];
                const name = (top.model || "").replace("claude-", "").replace(/-\d+$/, "").replace(/-/g, " ");
                setFavoriteModel(name.charAt(0).toUpperCase() + name.slice(1));
            }
        }).catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        Promise.all([
            fetch(`/api/claude/sessions${q}`).then(r => r.json()).catch(() => ({ projects: [] })),
            fetch(`/api/claude/skills${q}`).then(r => r.json()).catch(() => ({ summary: {} })),
            fetch("/api/claude/brain").then(r => r.json()).catch(() => ({ memoryFiles: [], globalRules: [] })),
            fetch("/api/claude/token-stats").then(r => r.json()).catch(() => ({ tokens: [], byProject: [], byModel: [], totals: {} })),
        ]).then(([sessions, skills, brain, tokenData]) => {
            try {
                const allSessions = (sessions.projects ?? []).flatMap((p: { sessions: { updatedAt: string }[] }) => p.sessions ?? []);
                const cutoff = Date.now() - 60 * 60 * 1000;
                const activeSessions = allSessions.filter((s: { updatedAt: string }) => new Date(s.updatedAt).getTime() > cutoff);
                setStats({
                    sessions: allSessions.length,
                    activeSessions: activeSessions.length,
                    skills: skills?.summary?.skills ?? 0,
                    commands: skills?.summary?.commands ?? 0,
                    hooks: skills?.summary?.hooks ?? 0,
                    mcp: skills?.summary?.mcp ?? 0,
                    plugins: skills?.summary?.plugins ?? 0,
                    claudeMd: skills?.summary?.claudeMd ?? 0,
                    memory: brain?.categoryCounts?.memory ?? brain?.totalFiles ?? 0,
                    rules: (brain?.globalRules ?? []).length,
                    tokens: {
                        input: tokenData?.totals?.input_tokens ?? 0,
                        output: tokenData?.totals?.output_tokens ?? 0,
                        cacheRead: tokenData?.totals?.cache_read_tokens ?? 0,
                        cost: tokenData?.totals?.total_cost ?? 0,
                    },
                });
                setAllTokens(tokenData?.tokens ?? []);
                setAllSessionProjects(sessions.projects ?? []);
            } catch { /* prevent crash */ }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [machine]);

    // Filter data by time period
    const periodCutoff = useMemo(() => {
        if (chartPeriod === "today") return Date.now() - 24 * 60 * 60 * 1000;
        if (chartPeriod === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (chartPeriod === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
        return 0;
    }, [chartPeriod]);

    // Build a set of session IDs within the time period
    const periodSessionIds = useMemo(() => {
        if (periodCutoff === 0) return null; // null = no filter
        const ids = new Set<string>();
        for (const p of allSessionProjects) {
            for (const s of p.sessions ?? []) {
                if (new Date(s.updatedAt).getTime() > periodCutoff) ids.add(s.id);
            }
        }
        return ids;
    }, [allSessionProjects, periodCutoff]);

    const filteredTokens = useMemo(() => {
        if (!periodSessionIds) return allTokens;
        return allTokens.filter((t: any) => periodSessionIds.has(t.session_id));
    }, [allTokens, periodSessionIds]);

    const tokensBySession = useMemo(() => {
        return filteredTokens
            .sort((a: any, b: any) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
            .slice(0, 10);
    }, [filteredTokens]);

    const sessionProjects = useMemo(() => {
        if (periodCutoff === 0) return allSessionProjects;
        return allSessionProjects.map((p: any) => ({
            ...p,
            sessions: (p.sessions ?? []).filter((s: any) => new Date(s.updatedAt).getTime() > periodCutoff),
        })).filter((p: any) => p.sessions.length > 0);
    }, [allSessionProjects, periodCutoff]);

    const tokensByProject = useMemo(() => {
        const grouped = new Map<string, { total: number; cost: number }>();
        for (const t of filteredTokens) {
            const name = t.project?.split("/").pop() || "unknown";
            const prev = grouped.get(name) ?? { total: 0, cost: 0 };
            const cost = ((t.input_tokens ?? 0) / 1_000_000 * 3) + ((t.output_tokens ?? 0) / 1_000_000 * 15);
            grouped.set(name, { total: prev.total + (t.input_tokens ?? 0) + (t.output_tokens ?? 0), cost: prev.cost + cost });
        }
        return [...grouped.entries()]
            .map(([project, data]) => ({ project, ...data }))
            .sort((a, b) => b.cost - a.cost);
    }, [filteredTokens]);

    if (loading || !stats) return <p className="text-white/30 text-center py-16">Loading dashboard...</p>;

    const configSegments = [
        { value: stats.skills, color: "#06b6d4", label: "Skills" },
        { value: stats.commands, color: "#f472b6", label: "Commands" },
        { value: stats.hooks, color: "#a3e635", label: "Hooks" },
        { value: stats.mcp, color: "#10b981", label: "MCP" },
        { value: stats.plugins, color: "#8b5cf6", label: "Plugins" },
    ];


    return (
        <div className="space-y-6">
            {/* Top row - key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <StatCard label="Sessions" value={stats.sessions} icon={FolderOpen} color="#22c55e"
                    sub={`${stats.activeSessions} active now`} />
                <StatCard label="Skills" value={stats.skills} icon={Sparkles} color="#06b6d4" />
                <StatCard label="Commands" value={stats.commands} icon={Terminal} color="#f472b6" />
                <StatCard label="Plugins" value={stats.plugins} icon={Puzzle} color="#8b5cf6" />
                <StatCard label="MCP Servers" value={stats.mcp} icon={Server} color="#10b981" />
                <StatCard label="Hooks" value={stats.hooks} icon={Webhook} color="#a3e635" />
                <StatCard label="Memory" value={stats.memory} icon={Brain} color="#eab308"
                    sub="across all projects" />
                <StatCard label="Rules" value={stats.rules} icon={ShieldCheck} color="#14b8a6" />
            </div>

            {/* Activity Heatmap + Stats */}
            {dailyData.length > 0 && (() => {
                // Build heatmap data for last 365 days
                const today = new Date();
                const dayMap = new Map(dailyData.map(d => [d.day, d.turns]));
                const cells: { date: string; turns: number; dayOfWeek: number; weekIndex: number }[] = [];
                const totalWeeks = 53;

                // Find the start: go back to the Sunday that is ~52 weeks ago
                const startDate = new Date(today);
                startDate.setDate(startDate.getDate() - (totalWeeks * 7 - 1) - startDate.getDay());

                for (let i = 0; i < totalWeeks * 7; i++) {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + i);
                    if (d > today) break;
                    const iso = d.toISOString().slice(0, 10);
                    cells.push({
                        date: iso,
                        turns: dayMap.get(iso) ?? 0,
                        dayOfWeek: d.getDay(),
                        weekIndex: Math.floor(i / 7),
                    });
                }

                // Stats
                const activeDays = cells.filter(c => c.turns > 0).length;
                const totalDays = cells.length;
                const maxTurns = Math.max(...cells.map(c => c.turns), 1);

                // Most active day
                const mostActive = cells.reduce((best, c) => c.turns > best.turns ? c : best, cells[0]);
                const mostActiveLabel = mostActive ? new Date(mostActive.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";

                // Streaks
                let longestStreak = 0, currentStreak = 0, tempStreak = 0;
                const sortedDays = cells.filter(c => c.turns > 0).map(c => c.date).sort();
                for (let i = 0; i < sortedDays.length; i++) {
                    if (i === 0) { tempStreak = 1; }
                    else {
                        const prev = new Date(sortedDays[i - 1]);
                        const curr = new Date(sortedDays[i]);
                        const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
                        tempStreak = diffDays === 1 ? tempStreak + 1 : 1;
                    }
                    longestStreak = Math.max(longestStreak, tempStreak);
                }
                // Current streak (count backwards from today)
                const todayStr = today.toISOString().slice(0, 10);
                const yesterdayDate = new Date(today); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
                let streakStart = dayMap.has(todayStr) ? todayStr : dayMap.has(yesterdayStr) ? yesterdayStr : null;
                if (streakStart) {
                    currentStreak = 1;
                    const d = new Date(streakStart);
                    while (true) {
                        d.setDate(d.getDate() - 1);
                        if (dayMap.has(d.toISOString().slice(0, 10))) currentStreak++;
                        else break;
                    }
                }

                // Month labels
                const months: { label: string; weekIndex: number }[] = [];
                let lastMonth = -1;
                for (const c of cells) {
                    const m = new Date(c.date).getMonth();
                    if (m !== lastMonth) {
                        months.push({ label: new Date(c.date).toLocaleDateString("en-US", { month: "short" }), weekIndex: c.weekIndex });
                        lastMonth = m;
                    }
                }

                function getColor(turns: number): string {
                    if (turns === 0) return "rgba(255,255,255,0.04)";
                    const intensity = Math.min(turns / (maxTurns * 0.6), 1);
                    if (intensity < 0.25) return "rgba(249,115,22,0.2)";
                    if (intensity < 0.5) return "rgba(249,115,22,0.4)";
                    if (intensity < 0.75) return "rgba(249,115,22,0.65)";
                    return "rgba(249,115,22,0.9)";
                }

                const cellSize = 11;
                const gap = 2;
                const weeksCount = Math.max(...cells.map(c => c.weekIndex)) + 1;

                return (
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", margin: 0 }}>
                                Activity
                            </p>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>Less</span>
                                    {[0, 0.2, 0.4, 0.65, 0.9].map((o, i) => (
                                        <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: o === 0 ? "rgba(255,255,255,0.04)" : `rgba(249,115,22,${o})`, display: "inline-block" }} />
                                    ))}
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>More</span>
                                </div>
                            </div>
                        </div>

                        {/* Heatmap */}
                        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                            {/* Month labels */}
                            <div style={{ display: "flex", marginLeft: 28, marginBottom: 2, gap: 0, position: "relative", height: 14 }}>
                                {months.map((m, i) => (
                                    <span key={i} style={{
                                        position: "absolute",
                                        left: m.weekIndex * (cellSize + gap),
                                        fontSize: 9,
                                        color: "rgba(255,255,255,0.2)",
                                    }}>{m.label}</span>
                                ))}
                            </div>
                            <div style={{ display: "flex", gap: 0 }}>
                                {/* Day labels */}
                                <div style={{ display: "flex", flexDirection: "column", gap, width: 24, flexShrink: 0 }}>
                                    {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                                        <span key={i} style={{ height: cellSize, fontSize: 8, color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center" }}>{d}</span>
                                    ))}
                                </div>
                                {/* Grid */}
                                <div style={{ display: "flex", gap }}>
                                    {Array.from({ length: weeksCount }, (_, wi) => (
                                        <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
                                            {Array.from({ length: 7 }, (_, di) => {
                                                const cell = cells.find(c => c.weekIndex === wi && c.dayOfWeek === di);
                                                return (
                                                    <div key={di}
                                                        title={cell ? `${cell.date}: ${cell.turns} turns` : ""}
                                                        style={{
                                                            width: cellSize, height: cellSize, borderRadius: 2,
                                                            background: cell ? getColor(cell.turns) : "transparent",
                                                        }} />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                            <div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Favorite model</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginTop: 2 }}>{favoriteModel || "-"}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total tokens</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#4A9EFF", marginTop: 2 }}>{totalTokensAll >= 1e6 ? (totalTokensAll / 1e6).toFixed(1) + "m" : (totalTokensAll / 1e3).toFixed(0) + "k"}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Active days</span>
                                <div style={{ marginTop: 2 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>{activeDays}</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>/{totalDays}</span></div>
                            </div>
                            <div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Most active day</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", marginTop: 2 }}>{mostActiveLabel}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Longest streak</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#f472b6", marginTop: 2 }}>{longestStreak} days</div>
                            </div>
                            <div>
                                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current streak</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#7C5CFF", marginTop: 2 }}>{currentStreak} days</div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Bottom row - charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Config donut */}
                <div style={{
                    padding: "20px 24px", borderRadius: 14,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>
                        Configuration Breakdown
                    </p>
                    <DonutChart segments={configSegments} />
                </div>

                {/* Quick stats */}
                <div style={{
                    padding: "20px 24px", borderRadius: 14,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>
                        System
                    </p>
                    <div className="space-y-3">
                        {[
                            { label: "CLAUDE.md files", value: stats.claudeMd, icon: BookOpen, color: "#8b5cf6" },
                            { label: "Memory files", value: stats.memory, icon: Brain, color: "#eab308" },
                            { label: "Global rules", value: stats.rules, icon: ShieldCheck, color: "#14b8a6" },
                            { label: "Active sessions", value: stats.activeSessions, icon: Activity, color: "#22c55e" },
                        ].map(row => (
                            <div key={row.label} className="flex items-center gap-3">
                                <row.icon size={14} style={{ color: row.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", flex: 1 }}>{row.label}</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: row.color }}>
                                    <AnimatedNumber value={row.value} />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Token charts */}
            {tokensBySession.length > 0 && (<>
                {/* Time filter */}
                <div className="flex items-center gap-2">
                    {(["today", "7d", "30d", "all"] as const).map(p => (
                        <button key={p} onClick={() => setChartPeriod(p)}
                            className="px-3 py-1 rounded-full text-[10px] font-bold transition"
                            style={{
                                background: chartPeriod === p ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.03)",
                                border: chartPeriod === p ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.06)",
                                color: chartPeriod === p ? "#f97316" : "rgba(255,255,255,0.35)",
                                cursor: "pointer",
                            }}>
                            {p === "today" ? "Today" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Top sessions by token usage */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Top Sessions by Tokens</h3>
                        <div className="space-y-2">
                            {tokensBySession.slice(0, 8).map((t: any, i: number) => {
                                const total = t.input_tokens + t.output_tokens;
                                const maxTotal = tokensBySession[0] ? tokensBySession[0].input_tokens + tokensBySession[0].output_tokens : 1;
                                const pct = Math.min((total / maxTotal) * 100, 100);
                                const project = t.project?.split("/").pop() || "unknown";
                                const color = OV_COLORS[i % OV_COLORS.length];
                                return (
                                    <a key={t.session_id || i} href={`/${t.session_id}`} target="_blank" rel="noopener noreferrer"
                                        className="block transition hover:bg-white/[0.03] cursor-pointer" style={{ textDecoration: "none" }}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{project}</span>
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

                    {/* Sessions per app */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Sessions per App</h3>
                        <div className="space-y-2">
                            {(() => {
                                const grouped = new Map<string, number>();
                                for (const p of sessionProjects) {
                                    const name = p.project?.replace(/-/g, "/").split("/").pop() || "unknown";
                                    grouped.set(name, (grouped.get(name) ?? 0) + (p.sessions?.length ?? 0));
                                }
                                const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
                                const maxCount = sorted[0]?.[1] ?? 1;
                                return sorted.map(([name, count], i) => {
                                    const color = OV_COLORS[i % OV_COLORS.length];
                                    return (
                                    <div key={name}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{name}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color }}>{count}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${Math.min((count / maxCount) * 100, 100)}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.8s", transitionDelay: `${i * 0.05}s` }} />
                                        </div>
                                    </div>
                                )});
                            })()}
                        </div>
                    </div>

                    {/* Token cost by app */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Cost by App</h3>
                        <div className="space-y-2">
                            {tokensByProject.slice(0, 8).map((p: any, i: number) => {
                                const name = p.project || "unknown";
                                const maxCost = tokensByProject[0]?.cost ?? 1;
                                const pct = Math.min(((p.cost ?? 0) / maxCost) * 100, 100);
                                const color = OV_COLORS[i % OV_COLORS.length];
                                return (
                                    <div key={name}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{name}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color }}>${(p.cost ?? 0).toFixed(2)}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.8s", transitionDelay: `${i * 0.05}s` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {tokensByProject.length > 0 && (
                            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: "#f97316" }}>Total: ${tokensByProject.reduce((s: number, p: any) => s + (p.cost ?? 0), 0).toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </>)}
        </div>
    );
}
