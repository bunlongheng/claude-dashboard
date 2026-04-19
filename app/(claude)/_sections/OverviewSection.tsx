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

export default function OverviewSection() {
    const { machine } = useMachine();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [tokensBySession, setTokensBySession] = useState<any[]>([]);
    const [tokensByProject, setTokensByProject] = useState<any[]>([]);
    const [sessionProjects, setSessionProjects] = useState<any[]>([]);

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
                setTokensBySession((tokenData?.tokens ?? []).sort((a: any, b: any) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens)).slice(0, 10));
                setTokensByProject(tokenData?.byProject ?? []);
                setSessionProjects(sessions.projects ?? []);
            } catch { /* prevent crash */ }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [machine]);

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
            {tokensBySession.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Top sessions by token usage */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f59e0b", marginBottom: 14 }}>Top Sessions by Token Usage</h3>
                        <div className="space-y-2">
                            {tokensBySession.slice(0, 6).map((t: any, i: number) => {
                                const total = t.input_tokens + t.output_tokens;
                                const maxTotal = tokensBySession[0] ? tokensBySession[0].input_tokens + tokensBySession[0].output_tokens : 1;
                                const pct = Math.min((total / maxTotal) * 100, 100);
                                const project = t.project?.split("/").pop() || "unknown";
                                return (
                                    <a key={t.session_id || i} href={`/${t.session_id}`} target="_blank" rel="noopener noreferrer"
                                        className="block cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-white/[0.03]">
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{project}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>{(total / 1000).toFixed(0)}K</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: "#f59e0b", transition: "width 0.8s" }} />
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>

                    {/* Sessions by project */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#22c55e", marginBottom: 14 }}>Sessions per App</h3>
                        <div className="space-y-2">
                            {sessionProjects.sort((a: any, b: any) => (b.sessions?.length ?? 0) - (a.sessions?.length ?? 0)).slice(0, 8).map((p: any, i: number) => {
                                const name = p.project?.replace(/-/g, "/").split("/").pop() || "unknown";
                                const count = p.sessions?.length ?? 0;
                                const maxCount = sessionProjects[0]?.sessions?.length ?? 1;
                                const pct = Math.min((count / maxCount) * 100, 100);
                                const colors = ["#22c55e", "#06b6d4", "#f97316", "#8b5cf6", "#f472b6", "#eab308", "#a3e635", "#10b981"];
                                return (
                                    <div key={name + i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{name}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: colors[i % colors.length] }}>{count}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: colors[i % colors.length], transition: "width 0.8s" }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Token cost by project */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f97316", marginBottom: 14 }}>Token Cost by App</h3>
                        <div className="space-y-2">
                            {tokensByProject.slice(0, 8).map((p: any, i: number) => {
                                const name = p.project?.split("/").pop() || "unknown";
                                const maxCost = tokensByProject[0]?.cost ?? 1;
                                const pct = Math.min(((p.cost ?? 0) / maxCost) * 100, 100);
                                return (
                                    <div key={name + i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{name}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>${(p.cost ?? 0).toFixed(2)}</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: "#f97316", transition: "width 0.8s" }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {stats.tokens.cost > 0 && (
                            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: "#f97316" }}>Total: ${stats.tokens.cost.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Context usage - sessions near limit */}
                    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <h3 style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#ef4444", marginBottom: 14 }}>Heaviest Sessions (Context)</h3>
                        <div className="space-y-2">
                            {tokensBySession.slice(0, 6).map((t: any, i: number) => {
                                const total = (t.input_tokens ?? 0) + (t.cache_read_tokens ?? 0) + (t.cache_creation_tokens ?? 0);
                                const contextLimit = 200000; // approximate context window
                                const pct = Math.min((total / contextLimit) * 100, 100);
                                const project = t.project?.split("/").pop() || "unknown";
                                const isFull = pct > 80;
                                return (
                                    <div key={t.session_id || i}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{project}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: isFull ? "#ef4444" : "rgba(255,255,255,0.4)" }}>{pct.toFixed(0)}%</span>
                                        </div>
                                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: isFull ? "#ef4444" : "rgba(255,255,255,0.15)", transition: "width 0.8s" }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
