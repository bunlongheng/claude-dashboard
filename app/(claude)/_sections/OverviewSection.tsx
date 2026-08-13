"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
    FolderOpen, Sparkles, Server, Coins, TerminalSquare,
    DatabaseZap, Brain, Blocks, BookOpen, Settings as SettingsIcon,
    CalendarDays, Flame, Zap, Star, Cpu,
} from "lucide-react";
import { CLI_ICON_MAP } from "./cliIcons";
import { RAG_ENABLED } from "@/lib/features";

const CLI_TOOL_COUNT = Object.keys(CLI_ICON_MAP).length;
import { useMachine } from "./MachineContext";
import { safeFetch, fmtCompact, type Token, type ProjectSessions } from "./shared";
import AppIcon from "./AppIcon";
import { MascotLoader } from "./MascotLoader";
import SkillUsagePanel from "./SkillUsagePanel";
import { cardShell, heatRamp } from "@/lib/ui-tokens";

// Local-time YYYY-MM-DD - keeps day keys aligned with /api/claude/token-stats/daily
// (which now buckets by local date too) so the grid doesn't show future hours.
function localYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Stats {
    sessions: number;
    activeSessions: number;
    skills: number;
    commands: number;
    hooks: number;
    mcp: number;
    mcpMine: number;
    mcpShipped: number;
    plugins: number;
    claudeMd: number;
    memory: number;
    memCategories: number;
    settings: number;
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

// Unified hero card: one line - icon + section name + the section's headline
// number (stats[0]). Extra stats in the array are intentionally not rendered
// here (the compact single-number look); color matches the left-nav color.
function HeroCard({ name, icon: Icon, color, href, stats }: {
    name: string; icon: React.ElementType; color: string; href: string;
    stats: { label: string; value: number | string; color?: string }[];
}) {
    return (
        <Link
            href={href}
            className="hover:shadow-lg"
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.boxShadow = `0 0 20px ${color}15`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}20`; e.currentTarget.style.boxShadow = "none"; }}
            style={{
                display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", borderRadius: 12,
                background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`,
                border: `1px solid ${color}20`,
                transition: "border-color 0.3s, box-shadow 0.3s",
                textDecoration: "none", cursor: "pointer",
            }}
        >
            {/* single line: icon + name + the one number */}
            <Icon size={22} style={{ color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
            <span className="font-light sm:font-normal md:font-semibold lg:font-extrabold" style={{ fontSize: 22, color: stats[0].color ?? color, lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}>
                {typeof stats[0].value === "number" ? <AnimatedNumber value={stats[0].value} /> : stats[0].value}
            </span>
        </Link>
    );
}

function DonutChart({ segments, size = 120 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;
    const r = (size - 20) / 2;
    const cx = size / 2, cy = size / 2;
    let startAngle = -Math.PI / 2;

    return (
        <div className="flex items-center justify-center gap-4 flex-wrap">
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
                <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontWeight="600">TOTAL</text>
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

// Isolated live clock - ticks every second (with seconds) so ONLY this tiny
// component re-renders each tick, not the whole 800-line Overview tree.
function LiveClock() {
    const [now, setNow] = useState<string>("");
    useEffect(() => {
        const tick = () => setNow(new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }));
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, []);
    if (!now) return null;
    return <span suppressHydrationWarning style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{now}</span>;
}

export default function OverviewSection() {
    const { machine, machines, apiBase } = useMachine();
    // Drill URLs carry the active machine so the /sessions page lands in the same
    // machine context (banner + per-row list query the same source, not the local
    // default when GV*'s cell was clicked).
    const drillMachine = (() => {
        const sel = machines.find(m => m.id === machine);
        return sel && !sel.isLocal ? `&machine=${encodeURIComponent(machine as string)}` : "";
    })();
    const lastFetchKey = useRef<string | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    // True when any headline fetch failed - surfaced as a banner so zeros from a
    // failed load are not mistaken for real zero activity.
    const [dataError, setDataError] = useState(false);
    const [allTokens, setAllTokens] = useState<Token[]>([]);
    const [allSessionProjects, setAllSessionProjects] = useState<ProjectSessions[]>([]);
    // Daily activity data
    interface DayBucket { day: string; turns: number; input: number; output: number; cache_read: number; cache_creation: number; sessions: number; }
    const [dailyData, setDailyData] = useState<DayBucket[]>([]);
    const [byDayHour, setByDayHour] = useState<Record<string, number[]>>({}); // ISO day -> turns per hour (last 7d)
    const [favoriteModel, setFavoriteModel] = useState("");
    // Shared interval used by Breakdown, Activity stats, and Top Sessions tabs.
    const [intervalTab, setIntervalTab] = useState<"24h" | "7d" | "30d" | "all">("7d");
    const breakdownInterval = intervalTab;
    const setBreakdownInterval = setIntervalTab;

    // Days-in-window for the current interval. Used by all three sections.
    const windowDays = intervalTab === "24h" ? 1 : intervalTab === "7d" ? 7 : intervalTab === "30d" ? 30 : 999999;
    const windowCutoff = Date.now() - windowDays * 86400_000;

    // Context window data
    interface CtxSession { sessionId: string; project: string; model: string; contextUsed: number; contextMax: number; inputTokens: number; cacheRead: number; cacheCreate: number; outputTokens: number; turns: number; lastActive: string; customTitle: string | null }
    const [ctxSessions, setCtxSessions] = useState<CtxSession[]>([]);


    // Context window data - refresh every 30s (fast)
    interface ContextResponse { sessions: CtxSession[] }
    useEffect(() => {
        const fetchCtx = () => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            safeFetch<ContextResponse>(apiBase("/api/claude/context"), { sessions: [] }, () => setDataError(true)).then(d => setCtxSessions(d.sessions ?? []));
        };
        fetchCtx();
        const ctxTimer = setInterval(fetchCtx, 30_000);
        return () => clearInterval(ctxTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    // Daily data - lazy load (slow endpoint, ~3s)
    interface DailyModelBucket { model: string; input: number; output: number; cache_read: number; cache_creation: number; turns: number }
    interface DailyStatsResponse { daily: DayBucket[]; byModel: DailyModelBucket[]; tools: { tool: string; calls: number }[]; byDayHour?: Record<string, number[]> }
    useEffect(() => {
        const t = setTimeout(() => {
            safeFetch<DailyStatsResponse>(apiBase("/api/claude/token-stats/daily"), { daily: [], byModel: [], tools: [] }, () => setDataError(true)).then(d => {
                setDailyData(d.daily ?? []);
                setByDayHour(d.byDayHour && typeof d.byDayHour === "object" ? d.byDayHour : {});
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

    // RAG stats - documents / chunks / preferences (replaces the Cost card).
    // Per-machine: each machine has its own RAG DB, so route through apiBase.
    interface RagStatsResponse { documents: number; chunks: number; preferences: number }
    const [ragStats, setRagStats] = useState<RagStatsResponse | null>(null);
    useEffect(() => {
        if (!RAG_ENABLED) return;
        safeFetch<RagStatsResponse | null>(apiBase("/api/rag/stats"), null, () => setDataError(true)).then(d => {
            if (d) setRagStats({ documents: d.documents ?? 0, chunks: d.chunks ?? 0, preferences: d.preferences ?? 0 });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);


    // Tool usage stats (last 24h) - for the new dynamic cards. Re-fetches when the
    // selected machine changes so the cards reflect the current machine's activity.
    interface ToolUsageStat { name: string; count: number; lastUsed: number; server?: string; tool?: string }
    interface ToolUsageResponse { mcp: ToolUsageStat[]; cli: ToolUsageStat[]; total: number }
    const [toolUsage, setToolUsage] = useState<ToolUsageResponse | null>(null);
    useEffect(() => {
        const fetchTU = () => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            safeFetch<ToolUsageResponse | null>(apiBase("/api/claude/tool-usage?hours=24"), null, () => setDataError(true)).then(d => { if (d) setToolUsage(d); });
        };
        fetchTU();
        const t = setInterval(fetchTU, 30_000);
        return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    useEffect(() => {
        // Fetch local data immediately on mount (no waterfall behind machine
        // resolution). machine=null and the local machine both resolve to the
        // local origin (q=""), so we dedupe on the effective query key to avoid
        // the double-fetch when MachineContext settles to the local default.
        const selected = machines.find(m => m.id === machine);
        const isRemote = !!selected && !selected.isLocal;
        // Dedup by the effective remote ID (or "local"), not by the legacy `?machine=`
        // query string. apiBase already routes to the right host, and remote endpoints
        // treat `?machine=` as a self-proxy directive that returns empty - so we drop it.
        const fetchKey = isRemote ? String(machine) : "local";
        if (lastFetchKey.current === fetchKey) return;
        lastFetchKey.current = fetchKey;
        setLoading(true);
        interface SessionsResponse { projects: ProjectSessions[] }
        interface SkillsMcpEntry { name: string; type: string; url?: string; command?: string; path: string; createdAt?: string | null; source?: "user" | "plugin" }
        interface SkillsSummary { skills?: number; commands?: number; hooks?: number; mcp?: number; plugins?: number; claudeMd?: number; settings?: number }
        interface SkillsResponse { mcp?: SkillsMcpEntry[]; summary?: SkillsSummary }
        interface BrainGlobalRule { id: string; category: string; title: string; instruction: string; confidence: number; source: string }
        interface BrainResponse { memoryFiles?: unknown[]; categoryCounts?: Record<string, number>; totalFiles?: number; globalRules?: BrainGlobalRule[] }
        interface TokenStatsTotals { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; total_cost?: number }
        interface TokenStatsResponse { tokens?: Token[]; byProject?: unknown[]; byModel?: unknown[]; totals?: TokenStatsTotals }
        const flagErr = () => setDataError(true);
        Promise.all([
            safeFetch<SessionsResponse>(apiBase("/api/claude/sessions"), { projects: [] }, flagErr),
            safeFetch<SkillsResponse>(apiBase("/api/claude/skills"), { summary: {} }, flagErr),
            safeFetch<BrainResponse>(apiBase("/api/claude/brain"), { memoryFiles: [], globalRules: [], categoryCounts: {} }, flagErr),
            safeFetch<TokenStatsResponse>(apiBase("/api/claude/token-stats"), { tokens: [], byProject: [], byModel: [], totals: {} }, flagErr),
        ]).then(([sessions, skills, brain, tokenData]) => {
            try {
                const allSessions = (sessions.projects ?? []).flatMap((p: { sessions: { updatedAt: string }[] }) => p.sessions ?? []);
                const cutoff = Date.now() - 60 * 60 * 1000;
                const activeSessions = allSessions.filter((s: { updatedAt: string }) => new Date(s.updatedAt).getTime() > cutoff);
                const mcpList = skills?.mcp ?? [];
                const mcpShipped = mcpList.filter((m) => m.source === "plugin").length;
                const settingsCount = skills?.summary?.settings ?? 0;
                setStats({
                    sessions: allSessions.length,
                    activeSessions: activeSessions.length,
                    skills: skills?.summary?.skills ?? 0,
                    commands: skills?.summary?.commands ?? 0,
                    hooks: skills?.summary?.hooks ?? 0,
                    mcp: skills?.summary?.mcp ?? 0,
                    mcpMine: (skills?.summary?.mcp ?? mcpList.length) - mcpShipped,
                    mcpShipped,
                    plugins: skills?.summary?.plugins ?? 0,
                    claudeMd: skills?.summary?.claudeMd ?? 0,
                    memory: brain?.categoryCounts?.memory ?? brain?.totalFiles ?? 0,
                    memCategories: Object.keys(brain?.categoryCounts ?? {}).length,
                    settings: settingsCount,
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
    }, [machine, machines, apiBase]);

    // Top sessions by token usage - sort all sessions; windowing happens below.
    const tokensBySession = useMemo(() => {
        return [...allTokens]
            .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens));
    }, [allTokens]);

    // Memoized heatmap computation - lookback follows the interval tab.
    const heatmapData = useMemo(() => {
        if (dailyData.length === 0) return null;
        const today = new Date();
        const dayMap = new Map(dailyData.map(d => [d.day, d.turns]));
        const cells: { date: string; turns: number; weekIndex: number; dayOfWeek: number }[] = [];
        const lookbackDays =
            intervalTab === "24h" ? 1 :
            intervalTab === "7d"  ? 7 :
            intervalTab === "30d" ? 30 :
            13 * 7; // "all" caps at 13 weeks for visual sanity
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - lookbackDays + 1);
        startDate.setDate(startDate.getDate() - startDate.getDay()); // align to Sunday
        for (let i = 0; ; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            if (d > today) break;
            const iso = localYMD(d);
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
        const todayStr = localYMD(today);
        const yesterdayDate = new Date(today); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = localYMD(yesterdayDate);
        const streakStart = dayMap.has(todayStr) ? todayStr : dayMap.has(yesterdayStr) ? yesterdayStr : null;
        if (streakStart) {
            currentStreak = 1;
            const d = new Date(streakStart);
            while (true) { d.setDate(d.getDate() - 1); if (dayMap.has(localYMD(d))) currentStreak++; else break; }
        }
        // Build cell lookup map for O(1) access in render
        const cellMap = new Map<string, typeof cells[0]>();
        for (const c of cells) cellMap.set(`${c.weekIndex}-${c.dayOfWeek}`, c);
        const weeksCount = cells.length > 0 ? Math.max(...cells.map(c => c.weekIndex)) + 1 : 0;
        // Month labels
        const months: { label: string; weekIndex: number }[] = [];
        let lastMonth = -1, lastLabelWeek = -99;
        for (const c of cells) {
            const m = new Date(c.date + "T12:00:00").getMonth();
            if (m !== lastMonth) {
                lastMonth = m;
                // Skip a label that would overlap the previous one (need ~3 weeks of room)
                if (c.weekIndex - lastLabelWeek >= 3) {
                    months.push({ label: new Date(c.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" }), weekIndex: c.weekIndex });
                    lastLabelWeek = c.weekIndex;
                }
            }
        }
        return { cells, cellMap, weeksCount, months, maxTurns, activeDays, totalDays, mostActiveLabel, longestStreak, currentStreak, dayMap };
    }, [dailyData, intervalTab]);

    if (loading || !stats) return <MascotLoader label="Loading dashboard" />;

    // Colors mirror the left-nav palette (greens for skills/commands/hooks,
    // MCP yellow, plugins indigo).
    const configSegments = [
        { value: stats.skills, color: "#8AC249", label: "Skills" },
        { value: stats.commands, color: "#34C759", label: "Commands" },
        { value: stats.hooks, color: "#30D158", label: "Hooks" },
        { value: stats.mcp, color: "#FFCC00", label: "MCP" },
        { value: stats.plugins, color: "#5856D6", label: "Plugins" },
    ];

    // Reusable tab control - same UX in Breakdown / Activity / Top Sessions.
    const intervalTabsEl = (
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2 }}>
            {([["7d","7d"],["30d","30d"],["all","ALL"]] as const).map(([k, l]) => {
                const active = intervalTab === k;
                return (
                    <button key={k} onClick={() => setIntervalTab(k)} style={{
                        fontSize: 9, fontWeight: 700, padding: "4px 9px", borderRadius: 4,
                        background: active ? "rgba(255,255,255,0.14)" : "transparent",
                        color: active ? "#fff" : "rgba(255,255,255,0.52)",
                        border: "none", cursor: "pointer", letterSpacing: 0.5,
                    }}>{l}</button>
                );
            })}
        </div>
    );

    // Windowed stats for the Activity section
    const winDays = dailyData.filter(d => new Date(d.day + "T12:00:00").getTime() >= windowCutoff);
    const winActiveDays = winDays.filter(d => d.turns > 0).length;
    const winTotalDays = intervalTab === "all" ? (heatmapData?.totalDays ?? winDays.length) : windowDays;
    const winMostActive = winDays.reduce((best, d) => d.turns > best.turns ? d : best, winDays[0] || { day: "", turns: 0 });
    const winMostActiveLabel = winMostActive?.day ? new Date(winMostActive.day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
    const winTotalTokens = winDays.reduce((s, d) => s + d.input + d.output, 0);

    // Windowed top sessions by joining tokens with each session's updatedAt.
    const sessionDateMap = new Map<string, number>();
    for (const p of allSessionProjects) for (const s of (p.sessions ?? [])) sessionDateMap.set(s.id, new Date(s.updatedAt).getTime());
    // Filter to window THEN take top. Dedupe by project (the displayed name) so
    // two sessions from the same project don't render as duplicate rows - keep
    // the highest-token session per project (list is already sorted desc).
    const tokensBySessionWindowed = (() => {
        const windowed = intervalTab === "all"
            ? tokensBySession
            : tokensBySession.filter((t) => {
                const ts = sessionDateMap.get(t.session_id);
                return ts == null ? false : ts >= windowCutoff;
            });
        const seenProject = new Set<string>();
        const out: Token[] = [];
        for (const t of windowed) {
            const proj = t.project?.split("/").pop() || "unknown";
            if (seenProject.has(proj)) continue;
            seenProject.add(proj);
            out.push(t);
        }
        return out.slice(0, 10);
    })();


    const liveSessions = allSessionProjects.flatMap((p) => (p.sessions || []).filter((s) => s.live)).length;
    const totalTokens = dailyData.reduce((s, d) => s + (d.input ?? 0) + (d.output ?? 0), 0);

    return (
        <div className="space-y-6">
            {dataError && (
                <div role="alert" style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10,
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#fca5a5", fontSize: 12, fontWeight: 600,
                }}>
                    <span>Some data failed to load - the numbers below may be incomplete.</span>
                    <button onClick={() => { setDataError(false); lastFetchKey.current = null; }} style={{
                        marginLeft: "auto", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                        color: "#fca5a5", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>Retry</button>
                </div>
            )}
            {/* Hero metrics - 10 boxes, 5 per row. Each: headline + 2-stat breakdown.
                Order + colors mirror the left nav gradient (red -> indigo, no white). */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {RAG_ENABLED && (
                    <>
                        <HeroCard name="RAG" icon={DatabaseZap} color="#FF3B30" href="/rag" stats={[
                            { label: "Docs", value: ragStats?.documents ?? 0 },
                            { label: "Prefs", value: ragStats?.preferences ?? 0 },
                            { label: "Chunks", value: ragStats?.chunks ?? 0 },
                        ]} />
                        <HeroCard name="Context" icon={Brain} color="#FF6347" href="/context" stats={[
                            { label: "Prefs", value: ragStats?.preferences ?? 0 },
                            { label: "Categories", value: stats.memCategories },
                        ]} />
                    </>
                )}
                <HeroCard name="Rules" icon={BookOpen} color="#FF9500" href="/global" stats={[
                    { label: "Rules", value: stats.rules },
                    { label: "CLAUDE.md", value: stats.claudeMd },
                ]} />
                <HeroCard name="MCP" icon={Server} color="#FFCC00" href="/mcp" stats={[
                    { label: "Servers", value: stats.mcp },
                    { label: "Mine", value: stats.mcpMine },
                    { label: "Shipped", value: stats.mcpShipped },
                ]} />
                <HeroCard name="Skills" icon={Sparkles} color="#8AC249" href="/skills" stats={[
                    { label: "Skills", value: stats.skills },
                    { label: "Commands", value: stats.commands },
                ]} />
                <HeroCard name="CLI" icon={TerminalSquare} color="#34C759" href="/cli" stats={[
                    { label: "Tools", value: CLI_TOOL_COUNT },
                ]} />
                <HeroCard name="Extensions" icon={Blocks} color="#30D158" href="/extensions" stats={[
                    { label: "Extensions", value: stats.hooks + stats.commands + stats.plugins },
                    { label: "Hooks", value: stats.hooks },
                    { label: "Cmds", value: stats.commands },
                    { label: "Plugins", value: stats.plugins },
                ]} />
                <HeroCard name="Settings" icon={SettingsIcon} color="#5AC8FA" href="/settings" stats={[
                    { label: "Keys", value: stats.settings },
                ]} />
                <HeroCard name="Sessions" icon={FolderOpen} color="#007AFF" href="/sessions" stats={[
                    { label: "Total", value: stats.sessions },
                    { label: "Active", value: stats.activeSessions },
                    { label: "Live", value: liveSessions },
                ]} />
                <HeroCard name="Tokens" icon={Coins} color="#5856D6" href="/tokens" stats={[
                    { label: "Total", value: fmtCompact(totalTokens) },
                    { label: "In", value: fmtCompact(stats.tokens.input) },
                    { label: "Out", value: fmtCompact(stats.tokens.output) },
                ]} />
            </div>

            {/* Row 4 — 4 columns: config, top sessions, context window, skill usage */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Config donut - content vertically centered so it fills the
                    card height (matches the taller siblings) and stays responsive. */}
                <div style={{ ...cardShell, display: "flex", flexDirection: "column" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>Configuration</p>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                        <DonutChart segments={configSegments} size={156} />
                    </div>
                </div>
                {/* Top sessions by tokens */}
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
                {/* Context Window */}
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
                {/* Skill usage - compact col next to Context Window */}
                <SkillUsagePanel />
            </div>

            {/* Activity Heatmap + Stats */}
            {heatmapData && (() => {
                const { cellMap, weeksCount, months, maxTurns, activeDays, totalDays, mostActiveLabel, longestStreak, currentStreak, dayMap } = heatmapData;
                const cellSize = 11, gap = 2;
                function getColor(turns: number): string {
                    return heatRamp(turns === 0 ? 0 : Math.min(turns / (maxTurns * 0.6), 1));
                }
                return (
                    <div className="flex gap-3 flex-col lg:flex-row">

                        {/* ── LEFT 60% — Activity heatmap (all time) ── */}
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

                        {/* ── RIGHT 40% — Usage breakdown ── */}
                        {(() => {
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
                        })()}

                    </div>
                );
            })()}

        </div>
    );
}
