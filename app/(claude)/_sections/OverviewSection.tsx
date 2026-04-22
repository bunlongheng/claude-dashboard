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
    interface DayBucket { day: string; turns: number; input: number; output: number; cache_read: number; cache_creation: number; sessions: number; }
    const [dailyData, setDailyData] = useState<DayBucket[]>([]);
    const [favoriteModel, setFavoriteModel] = useState("");
    const [totalTokensAll, setTotalTokensAll] = useState(0);
    const [usagePeriod, setUsagePeriod] = useState<"today" | "week" | "month">("week");

    // Usage windows (5h / 7d)
    interface WindowBucket { messages: number; input: number; output: number; cache_read: number; cache_creation: number; cost: number; }
    interface WindowQuota { five_hour_pct: number | null; seven_day_pct: number | null; updated_at: string | null; }
    const [windows, setWindows] = useState<{ five_hour: WindowBucket; seven_day: WindowBucket; resets: { five_hour_at: string; seven_day_at: string }; quota: WindowQuota } | null>(null);

    useEffect(() => {
        function loadWindows() {
            fetch("/api/claude/token-stats/windows").then(r => r.json()).then(d => setWindows(d)).catch(() => {});
        }
        loadWindows();
        const t = setInterval(loadWindows, 60_000);
        return () => clearInterval(t);
    }, []);

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
            {/* Usage Status — 5h session + 7d week windows */}
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
                // Build heatmap data for last 30 days
                const today = new Date();
                const dayMap = new Map(dailyData.map(d => [d.day, d.turns]));
                const cells: { date: string; turns: number; weekIndex: number; dayOfWeek: number }[] = [];

                // Align to Sunday so weeks line up in columns
                const startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 29);
                // Go back to the preceding Sunday
                startDate.setDate(startDate.getDate() - startDate.getDay());

                for (let i = 0; ; i++) {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + i);
                    if (d > today) break;
                    const iso = d.toISOString().slice(0, 10);
                    // Only include days within last 30
                    const diffMs = today.getTime() - d.getTime();
                    if (diffMs > 30 * 86400000) { cells.push({ date: iso, turns: -1, weekIndex: Math.floor(i / 7), dayOfWeek: d.getDay() }); continue; }
                    cells.push({ date: iso, turns: dayMap.get(iso) ?? 0, weekIndex: Math.floor(i / 7), dayOfWeek: d.getDay() });
                }

                // Stats (from all dailyData for accurate lifetime stats)
                const allCells = dailyData.map(d => ({ date: d.day, turns: d.turns }));
                const activeDays = allCells.filter(c => c.turns > 0).length;
                const totalDays = allCells.length;
                const maxTurns = Math.max(...cells.filter(c => c.turns > 0).map(c => c.turns), 1);

                // Most active day (all time)
                const mostActive = allCells.reduce((best, c) => c.turns > best.turns ? c : best, allCells[0] ?? { date: "", turns: 0 });
                const mostActiveLabel = mostActive?.date ? new Date(mostActive.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";

                // Streaks (all time)
                let longestStreak = 0, currentStreak = 0, tempStreak = 0;
                const sortedDays = allCells.filter(c => c.turns > 0).map(c => c.date).sort();
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

                function getColor(turns: number): string {
                    if (turns === 0) return "rgba(255,255,255,0.04)";
                    const intensity = Math.min(turns / (maxTurns * 0.6), 1);
                    if (intensity < 0.25) return "rgba(249,115,22,0.2)";
                    if (intensity < 0.5) return "rgba(249,115,22,0.4)";
                    if (intensity < 0.75) return "rgba(249,115,22,0.65)";
                    return "rgba(249,115,22,0.9)";
                }

                // Quota helpers (inline, uses `windows` from outer scope)
                function fmtResetQ(iso: string) {
                    return new Date(iso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric", timeZoneName: "short" });
                }
                const quotaCols = windows ? [
                    { label: "Session", sub: "5h", data: windows.five_hour, reset: windows.resets.five_hour_at, accent: "#f97316", pct: windows.quota.five_hour_pct },
                    { label: "Week", sub: "7d", data: windows.seven_day, reset: windows.resets.seven_day_at, accent: "#00d9ff", pct: windows.quota.seven_day_pct },
                ] : [];

                return (
                    <div className="flex gap-3 flex-col lg:flex-row">

                        {/* ── LEFT 60% — Activity heatmap (last 30 days) ── */}
                        <div style={{ flex: "0 0 60%", padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 0 }}>
                            <div className="flex items-center justify-between mb-3">
                                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", margin: 0 }}>Activity — Last 30 Days</p>
                                <div className="flex items-center gap-1">
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>Less</span>
                                    {[0, 0.2, 0.4, 0.65, 0.9].map((o, i) => (
                                        <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: o === 0 ? "rgba(255,255,255,0.04)" : `rgba(249,115,22,${o})`, display: "inline-block" }} />
                                    ))}
                                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>More</span>
                                </div>
                            </div>

                            {/* 30-day heatmap grid — columns = weeks, rows = days of week */}
                            {(() => {
                                const weeksCount = Math.max(...cells.map(c => c.weekIndex)) + 1;
                                const cellSize = 14;
                                const gap = 3;
                                const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
                                return (
                                    <div style={{ display: "flex", gap: 0 }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap, width: 16, flexShrink: 0, marginTop: 2 }}>
                                            {dayLabels.map((d, i) => (
                                                <span key={i} style={{ height: cellSize, fontSize: 8, color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center" }}>{d}</span>
                                            ))}
                                        </div>
                                        <div style={{ display: "flex", gap }}>
                                            {Array.from({ length: weeksCount }, (_, wi) => (
                                                <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
                                                    {Array.from({ length: 7 }, (_, di) => {
                                                        const cell = cells.find(c => c.weekIndex === wi && c.dayOfWeek === di);
                                                        const isToday = cell?.date === todayStr;
                                                        const faded = !cell || cell.turns < 0;
                                                        return (
                                                            <div key={di}
                                                                title={cell && cell.turns >= 0 ? `${cell.date}: ${cell.turns} turns` : ""}
                                                                style={{
                                                                    width: cellSize, height: cellSize, borderRadius: 3,
                                                                    background: faded ? "transparent" : isToday && cell!.turns > 0 ? "#f97316" : getColor(cell?.turns ?? 0),
                                                                    boxShadow: isToday && cell?.turns ? `0 0 6px rgba(249,115,22,0.5)` : "none",
                                                                    outline: isToday ? "1px solid rgba(249,115,22,0.5)" : "none",
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Stats row */}
                            <div className="grid grid-cols-3 gap-3 mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                {[
                                    { label: "Active days",    value: `${activeDays}/${totalDays}`, color: "#4ade80" },
                                    { label: "Longest streak", value: `${longestStreak}d`,           color: "#f472b6" },
                                    { label: "Current streak", value: `${currentStreak}d`,           color: "#7C5CFF" },
                                    { label: "Most active",    value: mostActiveLabel,               color: "#f97316" },
                                    { label: "Total tokens",   value: totalTokensAll >= 1e6 ? `${(totalTokensAll/1e6).toFixed(1)}m` : `${(totalTokensAll/1e3).toFixed(0)}k`, color: "#4A9EFF" },
                                    { label: "Top model",      value: favoriteModel || "—",          color: "#f97316" },
                                ].map(s => (
                                    <div key={s.label}>
                                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── RIGHT 40% — Usage breakdown ── */}
                        {(() => {
                            const todayStr = new Date().toISOString().slice(0, 10);
                            const now = new Date();
                            const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); const weekStr = weekStart.toISOString().slice(0, 10);
                            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

                            const periodDays = dailyData.filter(d =>
                                usagePeriod === "today"  ? d.day === todayStr :
                                usagePeriod === "week"   ? d.day >= weekStr :
                                d.day.startsWith(monthStr)
                            );

                            const sum = periodDays.reduce((acc, d) => ({
                                turns:    acc.turns    + d.turns,
                                input:    acc.input    + d.input,
                                output:   acc.output   + d.output,
                                sessions: acc.sessions + d.sessions,
                            }), { turns: 0, input: 0, output: 0, sessions: 0 });

                            const totalTok = sum.input + sum.output;
                            function ft(n: number) { return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}k` : String(n); }

                            // Bar chart rows — daily (week/month) or single row (today)
                            const barRows = usagePeriod === "today" ? [] : periodDays.slice().sort((a, b) => a.day.localeCompare(b.day));
                            const barMax = Math.max(...barRows.map(d => d.turns), 1);

                            // Quota bars
                            const qCols = quotaCols;

                            return (
                                <div style={{ flex: "0 0 40%", padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 14 }}>

                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", margin: 0 }}>Breakdown — Last 7 Days</p>
                                    </div>

                                    {/* Big numbers */}
                                    <div className="flex items-end gap-5">
                                        <div>
                                            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Messages</p>
                                            <p style={{ fontSize: 28, fontWeight: 800, color: "#f97316", lineHeight: 1 }}>{sum.turns.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tokens</p>
                                            <p style={{ fontSize: 28, fontWeight: 800, color: "#00d9ff", lineHeight: 1 }}>{ft(totalTok)}</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sessions</p>
                                            <p style={{ fontSize: 28, fontWeight: 800, color: "#a3e635", lineHeight: 1 }}>{sum.sessions}</p>
                                        </div>
                                    </div>

                                    {/* Day-by-day bar rows (week / month) */}
                                    {barRows.length > 0 && (
                                        <div className="space-y-1.5">
                                            {barRows.map(d => {
                                                const pct = Math.max((d.turns / barMax) * 100, d.turns > 0 ? 2 : 0);
                                                const label = usagePeriod === "week"
                                                    ? new Date(d.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                                                    : new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                                const isToday = d.day === todayStr;
                                                return (
                                                    <div key={d.day} className="flex items-center gap-2">
                                                        <span style={{ fontSize: 9, color: isToday ? "#f97316" : "rgba(255,255,255,0.25)", width: 70, flexShrink: 0, fontWeight: isToday ? 700 : 400 }}>{label}</span>
                                                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: isToday ? "#f97316" : "rgba(249,115,22,0.45)", transition: "width 0.6s" }} />
                                                        </div>
                                                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", width: 28, textAlign: "right", flexShrink: 0 }}>{d.turns}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Quota bars */}
                                    {qCols.length > 0 && (
                                        <div className="flex flex-col gap-2 mt-auto pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                            {qCols.map(({ label, sub, reset, accent, pct }) => {
                                                const hasPct = pct !== null && pct !== undefined;
                                                const barColor = hasPct && pct! > 80 ? "#ef4444" : hasPct && pct! > 60 ? "#f59e0b" : accent;
                                                return (
                                                    <div key={label}>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)" }}>
                                                                {label} <span style={{ color: "rgba(255,255,255,0.18)", fontWeight: 400 }}>{sub}</span>
                                                            </span>
                                                            <span style={{ fontSize: 12, fontWeight: 800, color: hasPct ? barColor : "rgba(255,255,255,0.2)" }}>
                                                                {hasPct ? `${pct}% used` : "— %"}
                                                            </span>
                                                        </div>
                                                        <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 3 }}>
                                                            <div style={{
                                                                width: hasPct ? `${Math.min(pct!, 100)}%` : "0%",
                                                                height: "100%", borderRadius: 3, background: barColor,
                                                                boxShadow: hasPct ? `0 0 8px ${barColor}50` : "none",
                                                                transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
                                                            }} />
                                                        </div>
                                                        <p style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>resets {fmtResetQ(reset)}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

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
