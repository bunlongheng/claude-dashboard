"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ChevronDownIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Search } from "lucide-react";
import { ACCENT, timeAgo, ProjectSessions, SessionEntry } from "./shared";
import { useMachine } from "./MachineContext";

type SessionFilter = "all" | "active" | "stale";

export default function SessionsSection() {
    const { machine } = useMachine();
    const [sessionProjects, setSessionProjects] = useState<ProjectSessions[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<SessionFilter>("all");

    const deleteSession = async (filePath: string) => {
        setDeleting(filePath);
        try {
            await fetch("/api/claude/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filePath }) });
            setSessionProjects(prev => prev.map(p => ({ ...p, sessions: p.sessions.filter(s => s.filePath !== filePath) })).filter(p => p.sessions.length > 0));
        } finally {
            setDeleting(null);
            setConfirmDelete(null);
        }
    };

    const refreshSessions = useCallback(() => {
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/sessions${q}`)
            .then(r => r.json())
            .then(d => setSessionProjects(d.projects ?? []))
            .catch(() => {})
            .finally(() => setSessionsLoading(false));
    }, [machine]);

    useEffect(() => {
        setSessionsLoading(true);
        refreshSessions();
        const timer = setInterval(refreshSessions, 30_000);
        return () => clearInterval(timer);
    }, [refreshSessions]);

    const allSessions = useMemo(() => sessionProjects.flatMap(p => p.sessions), [sessionProjects]);
    const activeCount = allSessions.filter(s => !s.stale).length;
    const staleCount = allSessions.filter(s => s.stale).length;

    const filteredProjects = useMemo(() => {
        let projects = sessionProjects;
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
    }, [sessionProjects, filter, search]);

    const tabs: { label: string; value: SessionFilter; count: number; color: string }[] = [
        { label: "All", value: "all", count: allSessions.length, color: "#22c55e" },
        { label: "Active", value: "active", count: activeCount, color: "#4ade80" },
        { label: "Stale", value: "stale", count: staleCount, color: "#6b7280" },
    ];

    return (
        <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    {tabs.map(t => (
                        <button key={t.value} onClick={() => setFilter(t.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition cursor-pointer"
                            style={{
                                background: filter === t.value ? `${t.color}20` : "rgba(255,255,255,0.03)",
                                border: filter === t.value ? `1px solid ${t.color}40` : "1px solid rgba(255,255,255,0.06)",
                                color: filter === t.value ? t.color : "rgba(255,255,255,0.4)",
                            }}>
                            {t.label}
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{t.count}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
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
                            <img
                                src={`/api/claude/project-icon?project=${encodeURIComponent(proj.project)}`}
                                alt=""
                                width={16} height={16}
                                className="shrink-0 rounded-sm"
                                style={{ imageRendering: "pixelated" }}
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
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
                                {proj.sessions.map(s => (
                                    <div key={s.id} className="flex items-start gap-4 px-5 py-3.5">
                                        <div className="shrink-0 mt-0.5">
                                            <span className={`w-1.5 h-1.5 rounded-full block mt-1 ${s.stale ? "bg-amber-500/60" : "bg-emerald-400 animate-pulse"}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="text-[11px] text-white/75 font-medium leading-snug truncate">
                                                    {s.customTitle || s.title || s.id.slice(-3).toUpperCase()}
                                                </p>
                                                {s.customTitle && s.title && (
                                                    <span className="text-[9px] text-white/25 truncate shrink-0 max-w-[200px]">{s.title}</span>
                                                )}
                                            </div>
                                            <p className="text-[9px] font-mono text-white/25 mt-0.5 truncate">{s.filePath}</p>
                                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                <span className="text-[9px] text-white/25">{s.lines.toLocaleString()} lines</span>
                                                <span className="text-[9px] text-white/25">{s.sizeLabel}</span>
                                                <span className="text-[9px] text-white/25">created {new Date(s.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</span>
                                                <span className="text-[9px] text-white/25">updated {new Date(s.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} · {timeAgo(new Date(s.updatedAt).getTime())}</span>
                                            </div>
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
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </div>
    );
}
