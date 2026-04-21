"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Monitor, LogOut, User } from "lucide-react";
import PageHero from "./PageHero";
import { ACCENT, timeAgo, type ProjectSessions } from "./shared";
import { useMachine } from "./MachineContext";
import { signOut } from "@/app/actions";

export default function ClaudeContentArea({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const currentSessionId = pathname?.replace(/^\//, "") || "";
    const { machine, setMachine, machines, machineColors } = useMachine();
    const [ddOpen, setDdOpen] = useState(false);
    const ddRef = useRef<HTMLDivElement>(null);
    const [sessionProjects, setSessionProjects] = useState<ProjectSessions[]>([]);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const [userEmail] = useState<string | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Sessions polling - re-fetch when machine changes
    const refreshSessions = useCallback(() => {
        const q = machine ? `?machine=${machine}` : "";
        fetch(`/api/claude/sessions${q}`)
            .then(r => r.json())
            .then(d => setSessionProjects(d.projects ?? []))
            .catch(() => {});
    }, [machine]);

    useEffect(() => {
        refreshSessions();
        const t = setInterval(refreshSessions, 30_000);
        return () => clearInterval(t);
    }, [refreshSessions]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const activeSessions = useMemo(() => {
        const cutoff = Date.now() - 5 * 60 * 1000;
        return sessionProjects.flatMap(p =>
            p.sessions
                .filter(s => new Date(s.updatedAt).getTime() > cutoff)
                .map(s => ({ ...s, project: p.project }))
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }, [sessionProjects]);

    const selectedMachine = machines.find(m => m.id === machine);
    const mColor = machine ? (machineColors[machine] ?? ACCENT) : ACCENT;
    const mLabel = selectedMachine?.hostname || machine || "All";

    return (
        <div className="flex-1 overflow-y-auto" style={{ background: "#08090d" }}>
            {/* Top bar - machine + sessions (all screen sizes) */}
            <div className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 md:py-2.5 border-b sticky top-0 md:top-0 z-30" style={{ borderColor: "rgba(255,255,255,0.05)", background: "#08090d" }}>
                {/* Machine - dropdown only if multiple, label if single */}
                {machines.length > 1 ? (
                    <div ref={ddRef} style={{ position: "relative" }}>
                        <button
                            onClick={() => setDdOpen(!ddOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            style={{
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                color: "rgba(255,255,255,0.7)",
                            }}
                        >
                            <Monitor size={13} />
                            <span>{mLabel}</span>
                            <ChevronDown size={12} style={{ opacity: 0.6, transform: ddOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                        </button>
                        {ddOpen && (
                            <div style={{
                                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
                                background: "#14151a", border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 8, padding: 3, minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                            }}>
                                <button
                                    onClick={() => { setMachine(null); setDdOpen(false); }}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-[10px] font-semibold transition-colors cursor-pointer"
                                    style={{
                                        background: machine === null ? `${ACCENT}15` : "transparent",
                                        color: machine === null ? ACCENT : "rgba(255,255,255,0.5)",
                                    }}
                                >
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0 }} />
                                    <span style={{ flex: 1 }}>All</span>
                                    {machine === null && <span style={{ fontSize: 9 }}>✓</span>}
                                </button>
                                {machines.map(m => {
                                    const active = machine === m.id;
                                    const color = machineColors[m.id] ?? ACCENT;
                                    return (
                                        <button key={m.id}
                                            onClick={() => { setMachine(m.id); setDdOpen(false); }}
                                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-[10px] font-semibold transition-colors cursor-pointer"
                                            style={{
                                                background: active ? `${color}15` : "transparent",
                                                color: active ? color : "rgba(255,255,255,0.5)",
                                            }}
                                        >
                                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                            <span style={{ flex: 1 }}>{m.hostname}</span>
                                            {active && <span style={{ fontSize: 9 }}>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : machines.length === 1 ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                        <Monitor size={13} />
                        <span>{machines[0].hostname}</span>
                    </div>
                ) : null}

                {/* Divider */}
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)" }} />

                {/* Active sessions */}
                {activeSessions.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto flex-1" style={{ scrollbarWidth: "none" }}>
                        {activeSessions.slice(0, 8).map(s => {
                            const shortId = s.id.slice(-3).toUpperCase();
                            const projectName = s.project?.replace(/-/g, "/").split("/").pop() || "";
                            const label = s.customTitle || s.title?.slice(0, 20) || projectName || shortId;
                            const ago = timeAgo(new Date(s.updatedAt).getTime());
                            const isSelected = currentSessionId === s.id;
                            return (
                                <a key={s.id} href={`/${s.id}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 transition hover:border-[#f9731640]"
                                    style={{
                                        background: isSelected ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.03)",
                                        border: isSelected ? "1px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.06)",
                                    }}
                                    title={`${s.id} · ${s.project}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className={`text-[10px] font-bold uppercase ${isSelected ? "text-white" : "text-white/70"}`}>{label}</span>
                                </a>
                            );
                        })}
                    </div>
                )}

                {activeSessions.length === 0 && (
                    <span className="text-[10px] text-white/20">No active sessions</span>
                )}

                {/* Profile dropdown */}
                <div ref={profileRef} style={{ position: "relative", marginLeft: "auto", flexShrink: 0 }}>
                    <button onClick={() => setProfileOpen(!profileOpen)}
                        className="flex items-center gap-2 px-2 py-1 rounded-lg transition cursor-pointer hover:bg-white/5"
                        style={{ color: "rgba(255,255,255,0.5)" }}>
                        <span className="text-[10px] font-medium hidden lg:inline">{userEmail || "Local"}</span>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(249,115,22,0.2)", border: "1px solid rgba(249,115,22,0.3)" }}>
                            <User size={14} style={{ color: "#f97316" }} />
                        </div>
                    </button>
                    {profileOpen && (
                        <div style={{
                            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                            background: "#14151a", border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 10, padding: 4, minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}>
                            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 4 }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{userEmail || "Local Admin"}</p>
                                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Hub Machine</p>
                            </div>
                            <button onClick={() => signOut()}
                                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-[11px] font-semibold transition-colors cursor-pointer hover:bg-red-500/10"
                                style={{ color: "#f87171", background: "none", border: "none" }}>
                                <LogOut size={13} />
                                Log out
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3 md:p-6" style={{ minWidth: 0 }}>
                <PageHero />
                {children}
            </div>
        </div>
    );
}
