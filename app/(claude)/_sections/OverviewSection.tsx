"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RAG_ENABLED } from "@/lib/features";
import { useMachine } from "./MachineContext";
import { safeFetch, type Token, type ProjectSessions } from "./shared";
import { MascotLoader } from "./MascotLoader";
import SkillUsagePanel from "./SkillUsagePanel";
import { HeroCardsGrid } from "./overview/HeroCardsGrid";
import { ConfigDonutCard } from "./overview/ConfigDonutCard";
import { TopSessionsCard } from "./overview/TopSessionsCard";
import { JevCard } from "./overview/JevCard";
import { ActivityHeatmapCard } from "./overview/ActivityHeatmapCard";
import { BreakdownCard } from "./overview/BreakdownCard";
import { localYMD } from "./overview/utils";
import type { Stats, RagStats, DayBucket } from "./overview/types";

// Small local clock for the recent-activity cutoff below - re-derived every
// 30s (not on every render) so the render body never calls the impure
// `Date.now()` directly (react-hooks/purity), while staying fresh enough for
// the day-granularity filtering it feeds.
function useNow(intervalMs: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(t);
    }, [intervalMs]);
    return now;
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
    // True when any headline fetch failed - surfaced as a banner so zeros from a
    // failed load are not mistaken for real zero activity.
    const [dataError, setDataError] = useState(false);
    // Shared interval used by Breakdown, Activity stats, and Top Sessions tabs.
    const [intervalTab, setIntervalTab] = useState<"24h" | "7d" | "30d" | "all">("7d");
    const breakdownInterval = intervalTab;
    const setBreakdownInterval = setIntervalTab;

    // Days-in-window for the current interval. Used by all three sections.
    const windowDays = intervalTab === "24h" ? 1 : intervalTab === "7d" ? 7 : intervalTab === "30d" ? 30 : 999999;
    const now = useNow(30_000);
    const windowCutoff = now - windowDays * 86400_000;

    // Daily data - loaded once per machine (slow endpoint, ~3s)
    interface DailyModelBucket { model: string; input: number; output: number; cache_read: number; cache_creation: number; turns: number }
    interface DailyStatsResponse { daily: DayBucket[]; byModel: DailyModelBucket[]; tools: { tool: string; calls: number }[]; byDayHour?: Record<string, number[]> }
    const dailyUrl = apiBase("/api/claude/token-stats/daily");
    const dailyQuery = useQuery<DailyStatsResponse>({
        queryKey: ["overview-daily", dailyUrl],
        queryFn: () => safeFetch<DailyStatsResponse>(dailyUrl, { daily: [], byModel: [], tools: [] }, () => setDataError(true)),
    });
    const dailyData = useMemo(() => dailyQuery.data?.daily ?? [], [dailyQuery.data]);
    const byDayHour = dailyQuery.data?.byDayHour && typeof dailyQuery.data.byDayHour === "object" ? dailyQuery.data.byDayHour : {};
    const favoriteModel = useMemo(() => {
        const models = dailyQuery.data?.byModel ?? [];
        if (models.length === 0) return "";
        const top = [...models].sort((a, b) => b.turns - a.turns)[0];
        const name = (top.model || "").replace("claude-", "").replace(/-\d+$/, "").replace(/-/g, " ");
        return name.charAt(0).toUpperCase() + name.slice(1);
    }, [dailyQuery.data]);

    // RAG stats - documents / chunks / preferences (replaces the Cost card).
    // Per-machine: each machine has its own RAG DB, so route through apiBase.
    interface RagStatsResponse { documents: number; chunks: number; preferences: number }
    const ragUrl = apiBase("/api/rag/stats");
    const ragQuery = useQuery<RagStatsResponse | null>({
        queryKey: ["overview-rag", ragUrl],
        queryFn: () => safeFetch<RagStatsResponse | null>(ragUrl, null, () => setDataError(true)),
        enabled: RAG_ENABLED,
    });
    const ragStats: RagStats | null = ragQuery.data
        ? { documents: ragQuery.data.documents ?? 0, chunks: ragQuery.data.chunks ?? 0, preferences: ragQuery.data.preferences ?? 0 }
        : null;

    // Tool usage stats (last 24h) - kept warm for the dynamic cards. Re-fetches
    // when the selected machine changes so it reflects the current machine's activity.
    interface ToolUsageStat { name: string; count: number; lastUsed: number; server?: string; tool?: string }
    interface ToolUsageResponse { mcp: ToolUsageStat[]; cli: ToolUsageStat[]; total: number }
    const toolUsageUrl = apiBase("/api/claude/tool-usage?hours=24");
    const toolUsageQuery = useQuery<ToolUsageResponse | null>({
        queryKey: ["overview-tool-usage", toolUsageUrl],
        queryFn: () => safeFetch<ToolUsageResponse | null>(toolUsageUrl, null, () => setDataError(true)),
        refetchInterval: 30_000,
    });

    // Headline stats: sessions, skills, brain, token totals - fetched together and
    // keyed by the resolved URLs so local vs. a given remote machine dedupe for free
    // (apiBase already collapses "no machine selected" and "the local machine" to
    // the same same-origin path).
    interface SessionsResponse { projects: ProjectSessions[] }
    interface SkillsMcpEntry { name: string; type: string; url?: string; command?: string; path: string; createdAt?: string | null; source?: "user" | "plugin" }
    interface SkillsSummary { skills?: number; commands?: number; hooks?: number; mcp?: number; plugins?: number; claudeMd?: number; settings?: number }
    interface SkillsResponse { mcp?: SkillsMcpEntry[]; summary?: SkillsSummary }
    interface BrainGlobalRule { id: string; category: string; title: string; instruction: string; confidence: number; source: string }
    interface BrainResponse { memoryFiles?: unknown[]; categoryCounts?: Record<string, number>; totalFiles?: number; globalRules?: BrainGlobalRule[]; globalRulesCount?: number }
    interface TokenStatsTotals { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; total_cost?: number }
    interface TokenStatsResponse { tokens?: Token[]; byProject?: unknown[]; byModel?: unknown[]; totals?: TokenStatsTotals }
    interface MainData { stats: Stats; allTokens: Token[]; allSessionProjects: ProjectSessions[] }
    const EMPTY_STATS: Stats = {
        sessions: 0, activeSessions: 0, skills: 0, commands: 0, hooks: 0, mcp: 0, mcpMine: 0,
        mcpShipped: 0, plugins: 0, claudeMd: 0, memory: 0, settings: 0, rules: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cost: 0 },
    };
    const urlSessions = apiBase("/api/claude/sessions");
    // ?slim=1 strips file bodies (skills 1.7 MB -> 60 KB, brain 2.6 MB -> 220 KB);
    // this card only reads the counts.
    const urlSkills = apiBase("/api/claude/skills?slim=1");
    const urlBrain = apiBase("/api/claude/brain?slim=1");
    const urlTokenStats = apiBase("/api/claude/token-stats");
    const mainQuery = useQuery<MainData>({
        queryKey: ["overview-main", urlSessions, urlSkills, urlBrain, urlTokenStats],
        queryFn: async () => {
            const flagErr = () => setDataError(true);
            const [sessions, skills, brain, tokenData] = await Promise.all([
                safeFetch<SessionsResponse>(urlSessions, { projects: [] }, flagErr),
                safeFetch<SkillsResponse>(urlSkills, { summary: {} }, flagErr),
                safeFetch<BrainResponse>(urlBrain, { memoryFiles: [], globalRules: [], categoryCounts: {} }, flagErr),
                safeFetch<TokenStatsResponse>(urlTokenStats, { tokens: [], byProject: [], byModel: [], totals: {} }, flagErr),
            ]);
            try {
                const allSessions = (sessions.projects ?? []).flatMap((p: { sessions: { updatedAt: string }[] }) => p.sessions ?? []);
                const cutoff = Date.now() - 60 * 60 * 1000;
                const activeSessions = allSessions.filter((s: { updatedAt: string }) => new Date(s.updatedAt).getTime() > cutoff);
                const mcpList = skills?.mcp ?? [];
                const mcpShipped = mcpList.filter((m) => m.source === "plugin").length;
                const settingsCount = skills?.summary?.settings ?? 0;
                const stats: Stats = {
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
                    settings: settingsCount,
                    rules: brain?.globalRulesCount ?? (brain?.globalRules ?? []).length,
                    tokens: {
                        input: tokenData?.totals?.input_tokens ?? 0,
                        output: tokenData?.totals?.output_tokens ?? 0,
                        cacheRead: tokenData?.totals?.cache_read_tokens ?? 0,
                        cost: tokenData?.totals?.total_cost ?? 0,
                    },
                };
                return { stats, allTokens: tokenData?.tokens ?? [], allSessionProjects: sessions.projects ?? [] };
            } catch {
                // prevent crash - fall back to a zeroed-but-shaped result
                return { stats: EMPTY_STATS, allTokens: [], allSessionProjects: [] };
            }
        },
    });
    const stats = mainQuery.data?.stats ?? null;
    const allTokens = useMemo(() => mainQuery.data?.allTokens ?? [], [mainQuery.data]);
    const allSessionProjects = mainQuery.data?.allSessionProjects ?? [];
    const loading = mainQuery.isPending;

    const handleRetry = () => {
        setDataError(false);
        dailyQuery.refetch();
        if (RAG_ENABLED) ragQuery.refetch();
        toolUsageQuery.refetch();
        mainQuery.refetch();
    };

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
    const winMostActiveLabel = winMostActive?.day ? new Date(winMostActive.day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-";
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
                    <button onClick={handleRetry} style={{
                        marginLeft: "auto", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                        color: "#fca5a5", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>Retry</button>
                </div>
            )}
            {/* Hero metrics - 10 boxes, 5 per row. Each: headline + 2-stat breakdown.
                Order + colors mirror the left nav gradient (red -> indigo, no white). */}
            <HeroCardsGrid stats={stats} ragStats={ragStats} liveSessions={liveSessions} totalTokens={totalTokens} />

            {/* Row 4 - 4 columns: config, top sessions, Jev router, skill usage */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <ConfigDonutCard segments={configSegments} />
                <TopSessionsCard tokensBySessionWindowed={tokensBySessionWindowed} intervalTabsEl={intervalTabsEl} />
                <JevCard />
                {/* Skill usage - compact col next to the Jev card */}
                <SkillUsagePanel />
            </div>

            {/* Activity Heatmap + Stats */}
            {heatmapData && (
                <div className="flex gap-3 flex-col lg:flex-row">
                    <ActivityHeatmapCard
                        heatmapData={heatmapData}
                        byDayHour={byDayHour}
                        intervalTab={intervalTab}
                        drillMachine={drillMachine}
                        winActiveDays={winActiveDays}
                        winTotalDays={winTotalDays}
                        winMostActiveLabel={winMostActiveLabel}
                        winTotalTokens={winTotalTokens}
                        favoriteModel={favoriteModel}
                        intervalTabsEl={intervalTabsEl}
                    />
                    <BreakdownCard dailyData={dailyData} breakdownInterval={breakdownInterval} intervalTabsEl={intervalTabsEl} />
                </div>
            )}

        </div>
    );
}
