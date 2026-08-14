"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDownIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Search, User, Bot, ChevronRight } from "lucide-react";
import { ACCENT, timeAgo, ProjectSessions, SessionEntry, safeFetch } from "./shared";
import { useMachine } from "./MachineContext";
import AppIcon from "./AppIcon";

type SessionFilter = "all" | "active" | "stale";

const fmtHourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

export default function SessionsSection() {
    const { machine, setMachine, machines, apiBase } = useMachine();
    const searchParams = useSearchParams();
    const drillDate = searchParams.get("date") || "";
    const drillHourStr = searchParams.get("hour");
    const drillHour = drillHourStr !== null ? parseInt(drillHourStr, 10) : NaN;
    const drillTurnStr = searchParams.get("turn");
    const expectedTurns = drillTurnStr !== null && !isNaN(parseInt(drillTurnStr, 10)) ? parseInt(drillTurnStr, 10) : null;
    const drillActive = /^\d{4}-\d{2}-\d{2}$/.test(drillDate) && !isNaN(drillHour) && drillHour >= 0 && drillHour <= 23;
    const drillMachine = searchParams.get("machine");

    // Honor ?machine=<id> from the drill URL so a cell clicked while viewing a
    // remote machine drills against THAT machine (banner + per-row scan agree).
    // Only set when the value is in our known list and different from current.
    useEffect(() => {
        if (!drillMachine || drillMachine === machine) return;
        if (machines.length === 0) return; // wait until the dropdown list resolves
        if (!machines.find(m => m.id === drillMachine)) return;
        setMachine(drillMachine);
    }, [drillMachine, machine, machines, setMachine]);

    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<SessionFilter>("all");
    type TurnEntry = { ts: string; role: string; preview: string; full?: string; model?: string; inTokens?: number; outTokens?: number; cacheReadTokens?: number; cacheCreationTokens?: number };
    // Keyed by `${sessionId}:${ts}` so expand state is unique per turn.
    const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());
    const toggleTurn = (key: string) => setExpandedTurns(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    // Drill-down: fetch exact turn counts, prompt counts, AND per-turn details for (date, hour)
    type DrillData = { sessionTurns: Record<string, number>; sessionPrompts: Record<string, number>; sessionEntries: Record<string, TurnEntry[]> };
    const drillUrl = apiBase(`/api/claude/turns-by-hour?date=${drillDate}&hour=${drillHour}`);
    const drillQuery = useQuery<DrillData>({
        queryKey: ["sessions-drill", drillUrl],
        queryFn: () => safeFetch<DrillData>(drillUrl, { sessionTurns: {}, sessionPrompts: {}, sessionEntries: {} }),
        enabled: drillActive,
    });
    const sessionTurns = useMemo(() => (drillActive ? (drillQuery.data?.sessionTurns ?? {}) : {}), [drillActive, drillQuery.data]);
    const sessionPrompts = useMemo(() => (drillActive ? (drillQuery.data?.sessionPrompts ?? {}) : {}), [drillActive, drillQuery.data]);
    const sessionEntries = useMemo(() => (drillActive ? (drillQuery.data?.sessionEntries ?? {}) : {}), [drillActive, drillQuery.data]);
    const drillLoading = drillActive && drillQuery.isFetching;

    const drillTotalTurns = useMemo(() => Object.values(sessionTurns).reduce((a, b) => a + b, 0), [sessionTurns]);
    const drillTotalPrompts = useMemo(() => Object.values(sessionPrompts).reduce((a, b) => a + b, 0), [sessionPrompts]);
    const drillSessionCount = new Set([...Object.keys(sessionTurns), ...Object.keys(sessionPrompts)]).size;

    // apiBase already routes to the right host; the legacy ?machine= would make
    // the remote try to proxy to itself and return zero sessions (the bug I fixed
    // elsewhere but missed here). Drop it.
    const queryClient = useQueryClient();
    const sessionsUrl = apiBase("/api/claude/sessions");
    const sessionsQueryKey = ["sessions-list", sessionsUrl];
    const sessionsQuery = useQuery<{ projects: ProjectSessions[] }>({
        queryKey: sessionsQueryKey,
        queryFn: () => safeFetch<{ projects: ProjectSessions[] }>(sessionsUrl, { projects: [] }),
        refetchInterval: 30_000,
    });
    const sessionProjects = useMemo(() => sessionsQuery.data?.projects ?? [], [sessionsQuery.data]);
    const sessionsLoading = sessionsQuery.isLoading;

    const deleteSession = async (filePath: string) => {
        setDeleting(filePath);
        try {
            await fetch(apiBase("/api/claude/sessions"), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath }) });
            queryClient.setQueryData<{ projects: ProjectSessions[] }>(sessionsQueryKey, prev =>
                prev ? { projects: prev.projects.map(p => ({ ...p, sessions: p.sessions.filter(s => s.filePath !== filePath) })).filter(p => p.sessions.length > 0) } : prev
            );
        } finally {
            setDeleting(null);
            setConfirmDelete(null);
        }
    };

    const allSessions = useMemo(() => sessionProjects.flatMap(p => p.sessions), [sessionProjects]);
    const activeCount = allSessions.filter(s => !s.stale).length;
    const staleCount = allSessions.filter(s => s.stale).length;

    const filteredProjects = useMemo(() => {
        let projects = sessionProjects;
        if (drillActive) {
            // Show only sessions that had turns OR prompts in the drilled hour, sorted by total activity desc.
            const activity = (id: string) => (sessionTurns[id] ?? 0) + (sessionPrompts[id] ?? 0);
            projects = projects.map(p => ({
                ...p,
                sessions: p.sessions
                    .filter(s => activity(s.id) > 0)
                    .sort((a, b) => activity(b.id) - activity(a.id)),
            })).filter(p => p.sessions.length > 0);
        }
        if (filter === "active") projects = projects.map(p => ({ ...p, sessions: p.sessions.filter(s => !s.stale) })).filter(p => p.sessions.length > 0);
        if (filter === "stale") projects = projects.map(p => ({ ...p, sessions: p.sessions.filter(s => s.stale) })).filter(p => p.sessions.length > 0);
        if (search.trim()) {
            const q = search.toLowerCase();
            projects = projects.map(p => ({
                ...p,
                sessions: p.sessions.filter(s =>
                    s.id.toLowerCase().includes(q) ||
                    (s.customTitle ?? "").toLowerCase().includes(q) ||
                    (s.title ?? "").toLowerCase().includes(q) ||
                    p.project.toLowerCase().includes(q)
                ),
            })).filter(p => p.sessions.length > 0);
        }
        return projects;
    }, [sessionProjects, filter, search, drillActive, sessionTurns, sessionPrompts]);

    // Auto-expand projects that contain drill-down matches so the user sees results immediately.
    // expandedProjects is also toggled manually by the user (see the accordion
    // onClick below), so this can't be expressed as a pure render-time
    // derivation without clobbering manual toggles - it has to stay an effect.
    useEffect(() => {
        if (!drillActive || drillSessionCount === 0) return;
        const matched = new Set<string>();
        for (const p of sessionProjects) {
            if (p.sessions.some(s => ((sessionTurns[s.id] ?? 0) + (sessionPrompts[s.id] ?? 0)) > 0)) matched.add(p.project);
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above the effect
        setExpandedProjects(matched);
    }, [drillActive, drillSessionCount, sessionProjects, sessionTurns, sessionPrompts]);

    // In drill-down mode, the tab counts switch to turn counts (so All sums to the drill total).
    // Outside drill-down they remain session counts as before.
    const drillTurnsActive = useMemo(() => {
        if (!drillActive) return 0;
        return sessionProjects.flatMap(p => p.sessions).filter(s => !s.stale).reduce((a, s) => a + (sessionTurns[s.id] ?? 0), 0);
    }, [drillActive, sessionProjects, sessionTurns]);
    const drillTurnsStale = useMemo(() => {
        if (!drillActive) return 0;
        return sessionProjects.flatMap(p => p.sessions).filter(s => s.stale).reduce((a, s) => a + (sessionTurns[s.id] ?? 0), 0);
    }, [drillActive, sessionProjects, sessionTurns]);

    const tabs: { label: string; value: SessionFilter; count: number; color: string }[] = drillActive
        ? [
            { label: "All",    value: "all",    count: drillTotalTurns,  color: "#22c55e" },
            { label: "Active", value: "active", count: drillTurnsActive, color: "#4ade80" },
            { label: "Stale",  value: "stale",  count: drillTurnsStale,  color: "#6b7280" },
        ]
        : [
            { label: "All",    value: "all",    count: allSessions.length, color: "#22c55e" },
            { label: "Active", value: "active", count: activeCount,        color: "#4ade80" },
            { label: "Stale",  value: "stale",  count: staleCount,         color: "#6b7280" },
        ];

    return (
        <div>
            {drillActive && (() => {
                const matches = expectedTurns !== null && !drillLoading && expectedTurns === drillTotalTurns;
                const mismatches = expectedTurns !== null && !drillLoading && expectedTurns !== drillTotalTurns;
                const borderColor = mismatches ? "rgba(239,68,68,0.45)" : matches ? "rgba(34,197,94,0.4)" : "rgba(249,115,22,0.3)";
                const bgColor = mismatches ? "rgba(239,68,68,0.08)" : matches ? "rgba(34,197,94,0.06)" : "rgba(249,115,22,0.08)";
                const labelColor = mismatches ? "#ef4444" : matches ? "#22c55e" : "#f97316";
                return (
                    <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg flex-wrap" style={{ background: bgColor, border: `1px solid ${borderColor}` }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: labelColor }}>Drill-down</span>
                        <span className="text-[11px] text-white/75">
                            {new Date(drillDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at <span className="font-bold text-white">{fmtHourLabel(drillHour)}</span>
                        </span>
                        {expectedTurns !== null && (
                            <span className="text-[10px] flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.04] border border-white/10">
                                <span className="text-white/40 uppercase tracking-wider font-bold">cell</span>
                                <span className="font-bold text-white">{expectedTurns}</span>
                            </span>
                        )}
                        <span className="text-[10px] flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.04] border border-white/10">
                            <span className="text-white/40 uppercase tracking-wider font-bold">prompts</span>
                            <span className="font-bold text-white">{drillLoading ? "…" : drillTotalPrompts}</span>
                        </span>
                        <span className="text-[10px] flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.04] border border-white/10">
                            <span className="text-white/40 uppercase tracking-wider font-bold">turns</span>
                            <span className="font-bold text-white">{drillLoading ? "…" : drillTotalTurns}</span>
                        </span>
                        {matches && <span className="text-[10px] font-bold text-[#22c55e]">✓ match</span>}
                        {mismatches && <span className="text-[10px] font-bold text-[#ef4444]">⚠ off by {Math.abs(drillTotalTurns - (expectedTurns ?? 0))}</span>}
                        <span className="text-[11px] text-white/55">across <span className="font-bold text-white">{drillSessionCount}</span> session{drillSessionCount === 1 ? "" : "s"}</span>
                        <div className="flex-1" />
                        <Link href="/sessions" className="text-[10px] font-bold px-2 py-1 rounded bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition">Clear</Link>
                    </div>
                );
            })()}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    {tabs.map(t => (
                        <button key={t.value} onClick={() => setFilter(t.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                            style={{
                                background: filter === t.value ? `${t.color}20` : "rgba(255,255,255,0.03)",
                                border: filter === t.value ? `1px solid ${t.color}40` : "1px solid rgba(255,255,255,0.06)",
                                color: filter === t.value ? t.color : "rgba(255,255,255,0.52)",
                            }}>
                            {t.label}
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{t.count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
            </div>

            <div className="space-y-3">
            {sessionsLoading && (
                <p className="text-white/25 text-xs text-center py-10">Scanning sessions…</p>
            )}
            {!sessionsLoading && filteredProjects.map(proj => {
                const isOpen = expandedProjects.has(proj.project);
                const staleCount = proj.sessions.filter(s => s.stale).length;
                const totalSize = (proj.sessions ?? []).reduce((s, e) => s + (e.sizeBytes ?? 0), 0);
                const fmtSize = totalSize < 1024 * 1024 ? `${(totalSize / 1024).toFixed(0)} KB` : `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
                const lastUpdated = proj.sessions[0]?.updatedAt;
                return (
                    <div key={proj.project} className="bg-[#0f1117] border border-white/[0.08] rounded-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setExpandedProjects(prev => {
                                const n = new Set(prev);
                                n.has(proj.project) ? n.delete(proj.project) : n.add(proj.project);
                                return n;
                            })}
                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition text-left"
                        >
                            <AppIcon project={proj.project} size={16} />
                            <span className="text-[10px] font-mono text-white/50 flex-1 truncate">{proj.path}</span>
                            {lastUpdated && (
                                <span className="text-[9px] text-white/25 shrink-0">last used {timeAgo(new Date(lastUpdated).getTime())}</span>
                            )}
                            <span className="text-[9px] text-white/30 shrink-0">{proj.sessions.length} sessions · {fmtSize}</span>
                            {staleCount > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">{staleCount} stale</span>
                            )}
                            <ChevronDownIcon className="w-3 h-3 text-white/25 shrink-0 transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                        </button>
                        {isOpen && (
                            <div className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
                                {proj.sessions.map(s => {
                                    const entries = drillActive ? (sessionEntries[s.id] ?? []) : [];
                                    return (
                                <div key={s.id}>
                                    <div className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.02] transition"
                                         title={`${s.filePath}\ncreated: ${new Date(s.createdAt).toLocaleString()}\nupdated: ${new Date(s.updatedAt).toLocaleString()}`}>
                                        <div className="flex-1 min-w-0 flex items-center gap-2">
                                            <p className="text-[11px] text-white/75 font-medium truncate">
                                                {s.customTitle || s.title || s.id.slice(-3).toUpperCase()}
                                            </p>
                                            {s.customTitle && s.title && (
                                                <span className="text-[9px] text-white/25 truncate max-w-[260px]">{s.title}</span>
                                            )}
                                            <span className="text-[9px] text-white/25 font-mono shrink-0">{s.sizeLabel}</span>
                                            <span className="text-[9px] text-white/30 shrink-0">· {timeAgo(new Date(s.updatedAt).getTime())}</span>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${s.stale ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"}`}>
                                                {s.stale ? "stale" : "resumable"}
                                            </span>
                                            <a
                                                href={`/observe/claude/${s.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#f9731615] border border-[#f9731630] text-[#f97316] hover:bg-[#f9731625] transition"
                                                title="Open session progress in new tab"
                                            >
                                                progress ↗
                                            </a>
                                            {confirmDelete === s.filePath ? (
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => deleteSession(s.filePath)} disabled={deleting === s.filePath} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition">
                                                        {deleting === s.filePath ? "…" : "confirm"}
                                                    </button>
                                                    <button onClick={() => setConfirmDelete(null)} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 hover:text-white/60 transition">cancel</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setConfirmDelete(s.filePath)} className="text-white/20 hover:text-red-400 transition" title="Delete session">
                                                    <TrashIcon className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {drillActive && entries.length > 0 && (() => {
                                        // Aggregate model counts once so we don't repeat the same model name on every row.
                                        const modelCounts = new Map<string, number>();
                                        for (const t of entries) {
                                            if (!t.model) continue;
                                            const short = t.model.replace("claude-", "").replace(/-\d{8}$/, "");
                                            modelCounts.set(short, (modelCounts.get(short) ?? 0) + 1);
                                        }
                                        const modelPills = [...modelCounts.entries()].sort((a, b) => b[1] - a[1]);
                                        return (
                                            <div className="px-5 pb-3 pt-1">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold">This hour</span>
                                                    <span className="text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa" }}>
                                                        <User size={9} strokeWidth={2.5} /> <span className="font-bold">{sessionPrompts[s.id] ?? 0}</span> prompts
                                                    </span>
                                                    <span className="text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", color: "#f97316" }}>
                                                        <Bot size={9} strokeWidth={2.5} /> <span className="font-bold">{sessionTurns[s.id] ?? 0}</span> turns
                                                    </span>
                                                    {modelPills.map(([m, c]) => (
                                                        <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}>
                                                            {m} <span className="text-white/35">× {c}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="rounded-md overflow-hidden border border-white/[0.05] divide-y divide-white/[0.04]" style={{ background: "rgba(255,255,255,0.015)" }}>
                                                    <div className="flex items-center gap-3 px-3 py-1 text-[9px] uppercase tracking-wider text-white/25 font-bold border-b border-white/[0.04]" style={{ background: "rgba(255,255,255,0.02)" }}>
                                                        <span className="shrink-0 w-[88px]">time</span>
                                                        <span className="shrink-0" style={{ width: 18 }} />
                                                        <span className="flex-1">message</span>
                                                        <span className="shrink-0 w-[44px] text-right" title="new input tokens">in</span>
                                                        <span className="shrink-0 w-[44px] text-right" title="output tokens">out</span>
                                                        <span className="shrink-0 w-[44px] text-right" title="tokens read from prompt cache (cheap reuse)">cache</span>
                                                        <span className="shrink-0 w-[44px] text-right" style={{ color: "#f97316" }} title="tokens written to cache this turn">new</span>
                                                    </div>
                                                    {entries.map((t, i) => {
                                                        const time = new Date(t.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
                                                        const isUser = t.role === "user";
                                                        const iconColor = isUser ? "#60a5fa" : "#f97316";
                                                        const iconBg = isUser ? "rgba(96,165,250,0.12)" : "rgba(249,115,22,0.12)";
                                                        const iconBorder = isUser ? "rgba(96,165,250,0.25)" : "rgba(249,115,22,0.25)";
                                                        const fmt = (n: number | undefined) => {
                                                            const v = n ?? 0;
                                                            if (v === 0) return <span className="text-white/15">-</span>;
                                                            if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
                                                            return `${v}`;
                                                        };
                                                        // Only expandable when there is text longer than the preview (redacted thinking has no `full`).
                                                        const canExpand = !!t.full && t.full.length > (t.preview?.length ?? 0);
                                                        const turnKey = `${s.id}:${t.ts}:${i}`;
                                                        const isOpen = expandedTurns.has(turnKey);
                                                        return (
                                                            <div key={i}>
                                                                <div
                                                                    className={`flex items-center gap-3 px-3 py-1.5 text-[10px] ${canExpand ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
                                                                    style={isUser ? { background: "rgba(96,165,250,0.03)" } : undefined}
                                                                    onClick={canExpand ? () => toggleTurn(turnKey) : undefined}
                                                                >
                                                                    <span className="text-white/30 font-mono shrink-0 w-[88px]">{time}</span>
                                                                    <span className="shrink-0 flex items-center justify-center rounded" style={{ width: 18, height: 18, background: iconBg, color: iconColor, border: `1px solid ${iconBorder}` }} title={isUser ? "user prompt" : "assistant turn"}>
                                                                        {isUser ? <User size={10} strokeWidth={2.5} /> : <Bot size={10} strokeWidth={2.5} />}
                                                                    </span>
                                                                    <span className="flex-1 text-white/65 truncate flex items-center gap-1.5">
                                                                        {canExpand && (
                                                                            <ChevronRight size={10} className="text-white/30 shrink-0 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
                                                                        )}
                                                                        <span className="truncate">{t.preview || <span className="text-white/20 italic">no text content</span>}</span>
                                                                    </span>
                                                                    <span className="text-white/55 font-mono shrink-0 w-[44px] text-right" title={`${t.inTokens ?? 0} new input tokens`}>{isUser ? <span className="text-white/15">-</span> : fmt(t.inTokens)}</span>
                                                                    <span className="text-white/55 font-mono shrink-0 w-[44px] text-right" title={`${t.outTokens ?? 0} output tokens`}>{isUser ? <span className="text-white/15">-</span> : fmt(t.outTokens)}</span>
                                                                    <span className="text-white/30 font-mono shrink-0 w-[44px] text-right" title={`${t.cacheReadTokens ?? 0} cache read tokens`}>{isUser ? <span className="text-white/15">-</span> : fmt(t.cacheReadTokens)}</span>
                                                                    <span className="font-mono shrink-0 w-[44px] text-right font-semibold" style={{ color: isUser ? undefined : "#f97316" }} title={`${t.cacheCreationTokens ?? 0} cache creation tokens`}>{isUser ? <span className="text-white/15">-</span> : fmt(t.cacheCreationTokens)}</span>
                                                                </div>
                                                                {isOpen && canExpand && (
                                                                    <div className="px-3 pb-3 pt-1" style={{ background: isUser ? "rgba(96,165,250,0.02)" : "rgba(255,255,255,0.015)" }}>
                                                                        <pre className="text-[11px] leading-[1.55] text-white/75 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto rounded p-3" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)" }}>{t.full}</pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </div>
    );
}
