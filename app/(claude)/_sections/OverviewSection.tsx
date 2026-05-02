"use client";

import { useState, useEffect, useMemo } from "react";
import {
    FolderOpen, Sparkles, Terminal, Webhook, Server, BookOpen,
    Brain, ShieldCheck, Puzzle, Coins, Activity,
} from "lucide-react";
import { useMachine } from "./MachineContext";
import { safeFetch } from "./shared";

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
    const { machine, apiBase } = useMachine();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [allTokens, setAllTokens] = useState<any[]>([]);
    const [allSessionProjects, setAllSessionProjects] = useState<any[]>([]);
    // Daily activity data
    interface DayBucket { day: string; turns: number; input: number; output: number; cache_read: number; cache_creation: number; sessions: number; }
    const [dailyData, setDailyData] = useState<DayBucket[]>([]);
    const [favoriteModel, setFavoriteModel] = useState("");
    const [totalTokensAll, setTotalTokensAll] = useState(0);

    // Context window data
    interface CtxSession { sessionId: string; project: string; model: string; contextUsed: number; contextMax: number; inputTokens: number; cacheRead: number; cacheCreate: number; outputTokens: number; turns: number; lastActive: string; customTitle: string | null }
    const [ctxSessions, setCtxSessions] = useState<CtxSession[]>([]);

    // Context window data - refresh every 30s (fast)
    useEffect(() => {
        const fetchCtx = () => safeFetch<any>(apiBase("/api/claude/context"), { sessions: [] }).then(d => setCtxSessions(d.sessions ?? []));
        fetchCtx();
        const ctxTimer = setInterval(fetchCtx, 30_000);
        return () => clearInterval(ctxTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    // Daily data - lazy load (slow endpoint, ~3s)
    useEffect(() => {
        const t = setTimeout(() => {
            safeFetch<any>(apiBase("/api/claude/token-stats/daily"), { daily: [], byModel: [], tools: [] }).then(d => {
                setDailyData(d.daily ?? []);
                setTotalTokensAll((d.daily ?? []).reduce((s: number, b: { input: number; output: number }) => s + b.input + b.output, 0));
                const models = d.byModel ?? [];
                if (models.length > 0) {
                    const top = models.sort((a: { turns: number }, b: { turns: number }) => b.turns - a.turns)[0];
                    const name = (top.model || "").replace("claude-", "").replace(/-\d+$/, "").replace(/-/g, " ");
                    setFavoriteModel(name.charAt(0).toUpperCase() + name.slice(1));
                }
            }).catch(() => {});
        }, 100); // defer so page renders first
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        Promise.all([
            safeFetch<any>(apiBase(`/api/claude/sessions${q}`), { projects: [] }),
            safeFetch<any>(apiBase(`/api/claude/skills${q}`), { summary: {} }),
            safeFetch<any>(apiBase("/api/claude/brain"), { memoryFiles: [], globalRules: [], categoryCounts: {} }),
            safeFetch<any>(apiBase("/api/claude/token-stats"), { tokens: [], byProject: [], byModel: [], totals: {} }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [machine, apiBase]);

    // Top sessions by token usage
    const tokensBySession = useMemo(() => {
        return [...allTokens]
            .sort((a: any, b: any) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
            .slice(0, 10);
    }, [allTokens]);

    // Memoized heatmap computation
    const heatmapData = useMemo(() => {
        if (dailyData.length === 0) return null;
        const today = new Date();
        const dayMap = new Map(dailyData.map(d => [d.day, d.turns]));
        const cells: { date: string; turns: number; weekIndex: number; dayOfWeek: number }[] = [];
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 13 * 7 + 1);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        for (let i = 0; ; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            if (d > today) break;
            const iso = d.toISOString().slice(0, 10);
            cells.push({ date: iso, turns: dayMap.get(iso) ?? 0, weekIndex: Math.floor(i / 7), dayOfWeek: d.getDay() });
        }
        const allCells = dailyData.map(d => ({ date: d.day, turns: d.turns }));
        const activeDays = allCells.filter(c => c.turns > 0).length;
        const totalDays = allCells.length;
        const maxTurns = Math.max(...cells.map(c => c.turns), 1);
        const mostActive = allCells.reduce((best, c) => c.turns > best.turns ? c : best, allCells[0] ?? { date: "", turns: 0 });
        const mostActiveLabel = mostActive?.date ? new Date(mostActive.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";
        let longestStreak = 0, currentStreak = 0, tempStreak = 0;
        const sortedDays = allCells.filter(c => c.turns > 0).map(c => c.date).sort();
        for (let i = 0; i < sortedDays.length; i++) {
            if (i === 0) tempStreak = 1;
            else {
                const diff = (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86400000;
                tempStreak = diff === 1 ? tempStreak + 1 : 1;
            }
            longestStreak = Math.max(longestStreak, tempStreak);
        }
        const todayStr = today.toISOString().slice(0, 10);
        const yesterdayDate = new Date(today); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
        const streakStart = dayMap.has(todayStr) ? todayStr : dayMap.has(yesterdayStr) ? yesterdayStr : null;
        if (streakStart) {
            currentStreak = 1;
            const d = new Date(streakStart);
            while (true) { d.setDate(d.getDate() - 1); if (dayMap.has(d.toISOString().slice(0, 10))) currentStreak++; else break; }
        }
        // Build cell lookup map for O(1) access in render
        const cellMap = new Map<string, typeof cells[0]>();
        for (const c of cells) cellMap.set(`${c.weekIndex}-${c.dayOfWeek}`, c);
        const weeksCount = cells.length > 0 ? Math.max(...cells.map(c => c.weekIndex)) + 1 : 0;
        // Month labels
        const months: { label: string; weekIndex: number }[] = [];
        let lastMonth = -1;
        for (const c of cells) {
            const m = new Date(c.date + "T12:00:00").getMonth();
            if (m !== lastMonth) { months.push({ label: new Date(c.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" }), weekIndex: c.weekIndex }); lastMonth = m; }
        }
        return { cells, cellMap, weeksCount, months, maxTurns, activeDays, totalDays, mostActiveLabel, longestStreak, currentStreak, dayMap };
    }, [dailyData]);

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
            {/* Row 1 — 6 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Sessions" value={stats.sessions} icon={FolderOpen} color="#22c55e"
                    sub={`${stats.activeSessions} active now`} />
                <StatCard label="Skills" value={stats.skills} icon={Sparkles} color="#06b6d4" />
                <StatCard label="Commands" value={stats.commands} icon={Terminal} color="#f472b6" />
                <StatCard label="MCP Servers" value={stats.mcp} icon={Server} color="#10b981" />
                <StatCard label="Hooks" value={stats.hooks} icon={Webhook} color="#a3e635" />
                <StatCard label="Plugins" value={stats.plugins} icon={Puzzle} color="#8b5cf6" />
            </div>
            {/* Row 2 — 6 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Memory" value={stats.memory} icon={Brain} color="#eab308"
                    sub="across all projects" />
                <StatCard label="Rules" value={stats.rules} icon={ShieldCheck} color="#14b8a6" />
                <StatCard label="Tokens" value={Math.round(totalTokensAll / 1000)} icon={Coins} color="#4A9EFF"
                    sub={`${favoriteModel || 'Opus'} primary`} />
                <StatCard label="CLAUDE.md" value={stats.claudeMd} icon={BookOpen} color="#8b5cf6" />
                <StatCard label="Active" value={stats.activeSessions} icon={Activity} color="#22c55e"
                    sub="sessions now" />
                <StatCard label="Projects" value={allSessionProjects.length} icon={FolderOpen} color="#f97316" />
            </div>

            {/* Row 4 — 3 columns: config, top sessions, context window */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Config donut */}
                <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Configuration</p>
                    <DonutChart segments={configSegments} />
                </div>
                {/* Top sessions by tokens */}
                <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>Top Sessions by Tokens</h3>
                    <div className="space-y-2">
                        {tokensBySession.slice(0, 6).map((t: any, i: number) => {
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
                {/* Context Window */}
                <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between mb-3">
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", margin: 0 }}>Context Window</p>
                        <div className="flex items-center gap-2">
                            {[{ l: "Cache", c: "#3FB68B" }, { l: "Input", c: "#4A9EFF" }, { l: "Create", c: "#E8A23B" }].map(s => (
                                <div key={s.l} className="flex items-center gap-0.5"><span style={{ width: 4, height: 4, borderRadius: 1, background: s.c, display: "inline-block" }} /><span style={{ fontSize: 7, color: "rgba(255,255,255,0.2)" }}>{s.l}</span></div>
                            ))}
                        </div>
                    </div>
                    {ctxSessions.length > 0 ? (
                        <div className="space-y-2">
                            {ctxSessions.slice(0, 6).map(s => {
                                const pct = Math.min((s.contextUsed / s.contextMax) * 100, 100);
                                const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#4ade80";
                                const label = s.customTitle || s.project;
                                const usedK = s.contextUsed >= 1e6 ? `${(s.contextUsed / 1e6).toFixed(1)}m` : `${(s.contextUsed / 1e3).toFixed(0)}k`;
                                const maxK = s.contextMax >= 1e6 ? `${(s.contextMax / 1e6).toFixed(0)}m` : `${(s.contextMax / 1e3).toFixed(0)}k`;
                                const segs = [{ v: s.cacheRead, c: "#3FB68B" }, { v: s.inputTokens, c: "#4A9EFF" }, { v: s.cacheCreate, c: "#E8A23B" }];
                                const totalSeg = segs.reduce((sum, seg) => sum + seg.v, 0);
                                return (
                                    <div key={s.sessionId}>
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{label}</span>
                                            <span style={{ fontSize: 9, fontWeight: 700, color }}>{pct.toFixed(0)}% <span style={{ color: "rgba(255,255,255,0.15)", fontWeight: 400 }}>{usedK}/{maxK}</span></span>
                                        </div>
                                        <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", display: "flex", borderRadius: 3, overflow: "hidden" }}>
                                                {segs.map((seg, i) => { const sp = totalSeg > 0 ? (seg.v / totalSeg) * 100 : 0; return sp > 0.5 ? <div key={i} style={{ width: `${sp}%`, height: "100%", background: seg.c, opacity: 0.7 }} /> : null; })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>No active sessions</p>
                    )}
                </div>
            </div>

            {/* Activity Heatmap + Stats */}
            {heatmapData && (() => {
                const { cellMap, weeksCount, months, maxTurns, activeDays, totalDays, mostActiveLabel, longestStreak, currentStreak } = heatmapData;
                const cellSize = 11, gap = 2;
                function getColor(turns: number): string {
                    if (turns === 0) return "rgba(255,255,255,0.04)";
                    const intensity = Math.min(turns / (maxTurns * 0.6), 1);
                    if (intensity < 0.25) return "rgba(249,115,22,0.2)";
                    if (intensity < 0.5) return "rgba(249,115,22,0.4)";
                    if (intensity < 0.75) return "rgba(249,115,22,0.65)";
                    return "rgba(249,115,22,0.9)";
                }
                return (
                    <div className="flex gap-3 flex-col lg:flex-row">

                        {/* ── LEFT 60% — Activity heatmap (all time) ── */}
                        <div style={{ flex: "0 0 60%", padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 0 }}>
                            <div className="mb-3">
                                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", margin: 0 }}>Activity — Last 3 Months</p>
                            </div>

                            {/* All-time heatmap grid */}
                            <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                                <div style={{ display: "flex", marginLeft: 26, marginBottom: 2, position: "relative", height: 14 }}>
                                    {months.map((m, i) => (
                                        <span key={i} style={{ position: "absolute", left: m.weekIndex * (cellSize + gap), fontSize: 9, color: "rgba(255,255,255,0.2)", whiteSpace: "nowrap" }}>{m.label}</span>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 0 }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap, width: 26, flexShrink: 0 }}>
                                        {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                                            <span key={i} style={{ height: cellSize, fontSize: 8, color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center" }}>{d}</span>
                                        ))}
                                    </div>
                                    <div style={{ display: "flex", gap }}>
                                        {Array.from({ length: weeksCount }, (_, wi) => (
                                            <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
                                                {Array.from({ length: 7 }, (_, di) => {
                                                    const cell = cellMap.get(`${wi}-${di}`);
                                                    const todayStr = new Date().toISOString().slice(0, 10);
                                                    const isToday = cell?.date === todayStr;
                                                    return (
                                                        <div key={di}
                                                            title={cell ? `${cell.date}: ${cell.turns} turns` : ""}
                                                            style={{
                                                                width: cellSize, height: cellSize, borderRadius: 2,
                                                                background: cell ? (isToday && cell.turns > 0 ? "#f97316" : getColor(cell.turns)) : "transparent",
                                                                boxShadow: isToday && cell?.turns ? "0 0 6px rgba(249,115,22,0.5)" : "none",
                                                                outline: isToday ? "1px solid rgba(249,115,22,0.4)" : "none",
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Stats - inline right of heatmap */}
                            <div className="flex gap-4 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                {[
                                    { label: "Active days",    value: `${activeDays}/${totalDays}`, color: "#4ade80" },
                                    { label: "Longest streak", value: `${longestStreak}d`,           color: "#f472b6" },
                                    { label: "Current streak", value: `${currentStreak}d`,           color: "#7C5CFF" },
                                    { label: "Most active",    value: mostActiveLabel,               color: "#f97316" },
                                    { label: "Total tokens",   value: totalTokensAll >= 1e6 ? `${(totalTokensAll/1e6).toFixed(1)}m` : `${(totalTokensAll/1e3).toFixed(0)}k`, color: "#4A9EFF" },
                                    { label: "Top model",      value: favoriteModel || "—",          color: "#f97316" },
                                ].map(s => (
                                    <div key={s.label} style={{ minWidth: 70 }}>
                                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: s.color, marginTop: 1 }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── RIGHT 40% — Usage breakdown ── */}
                        {(() => {
                            const now = new Date();
                            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
                            const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); const weekStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,"0")}-${String(weekStart.getDate()).padStart(2,"0")}`;
                            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

                            const periodDays = dailyData.filter(d =>
                                d.day >= weekStr ? true :
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
                            const barRowsRaw = periodDays.slice().sort((a, b) => b.day.localeCompare(a.day));
                            // Ensure today is always in the list
                            if (!barRowsRaw.find(d => d.day === todayStr)) {
                                barRowsRaw.unshift({ day: todayStr, turns: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, sessions: 0 });
                            }
                            const barRows = barRowsRaw;
                            const barMax = Math.max(...barRows.map(d => d.turns), 1);

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
                                                const label = true
                                                    ? new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                                                    : new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

                                </div>
                            );
                        })()}

                    </div>
                );
            })()}

        </div>
    );
}
