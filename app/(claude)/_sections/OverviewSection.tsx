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

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
                width: `${pct}%`, height: "100%", borderRadius: 2, background: color,
                transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
            }} />
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color, sub, bar }: {
    label: string; value: number; icon: React.ElementType; color: string;
    sub?: string; bar?: { value: number; max: number };
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
            <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, marginBottom: sub || bar ? 6 : 0 }}>
                <AnimatedNumber value={value} />
            </div>
            {sub && <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", margin: 0 }}>{sub}</p>}
            {bar && <MiniBar value={bar.value} max={bar.max} color={color} />}
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

    useEffect(() => {
        setLoading(true);
        const q = machine ? `?machine=${machine}` : "";
        Promise.all([
            fetch(`/api/claude/sessions${q}`).then(r => r.json()).catch(() => ({ projects: [] })),
            fetch(`/api/claude/skills${q}`).then(r => r.json()).catch(() => ({ summary: {} })),
            fetch("/api/claude/brain").then(r => r.json()).catch(() => ({ memoryFiles: [], globalRules: [] })),
        ]).then(([sessions, skills, brain]) => {
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
                    memory: (brain?.memoryFiles ?? []).length,
                    rules: (brain?.globalRules ?? []).length,
                    tokens: { input: 0, output: 0, cacheRead: 0, cost: 0 },
                });
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
                <StatCard label="Rules" value={stats.rules} icon={ShieldCheck} color="#ef4444" />
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
                            { label: "Global rules", value: stats.rules, icon: ShieldCheck, color: "#ef4444" },
                            { label: "Active sessions", value: stats.activeSessions, icon: Activity, color: "#4ade80" },
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
        </div>
    );
}
