"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Monitor } from "lucide-react";
import PageHero from "./PageHero";
import { ACCENT, type ProjectSessions } from "./shared";
import { useMachine } from "./MachineContext";
import AppIcon from "./AppIcon";

export default function ClaudeContentArea({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const currentSessionId = pathname?.replace(/^\//, "") || "";
    const { machine, setMachine, machines, machineColors, apiBase } = useMachine();
    const [ddOpen, setDdOpen] = useState(false);
    const ddRef = useRef<HTMLDivElement>(null);
    const [sessionProjects, setSessionProjects] = useState<ProjectSessions[]>([]);
    // Snapshot of "now" used for idle-time math below (kept in state, refreshed
    // alongside sessions, instead of calling Date.now() during render).
    const [now, setNow] = useState(() => Date.now());

    // Sessions polling. apiBase routes directly to the selected machine, so we
    // hit http://<remote-ip>:<port>/api/claude/sessions with no `?machine=` query
    // (which would trigger a self-proxy on the remote and return empty).
    const refreshSessions = useCallback(() => {
        fetch(apiBase("/api/claude/sessions"))
            .then(r => r.ok ? r.json() : { projects: [] })
            .then(d => { setSessionProjects(d.projects ?? []); setNow(Date.now()); })
            .catch(() => {});
    }, [apiBase]);

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
        // Match Context Window + ActiveSessionsBanner: only sessions with a
        // live claude process attached (lsof-based 'live' field).
        return sessionProjects.flatMap(p =>
            p.sessions
                .filter((s) => s.live === true)
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
                {machines.length >= 1 ? (
                    <div ref={ddRef} style={{ position: "relative" }}>
                        <button
                            onClick={() => setDdOpen(!ddOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            style={{
                                background: "rgba(255,255,255,0.1)",
                                border: "1px solid rgba(255,255,255,0.22)",
                                color: "#fff",
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
                                {machines.map(m => {
                                    const active = machine === m.id;
                                    const color = machineColors[m.id] ?? ACCENT;
                                    return (
                                        <button key={m.id}
                                            onClick={() => { setMachine(m.id); setDdOpen(false); }}
                                            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-left text-[11px] font-semibold transition-colors cursor-pointer"
                                            style={{
                                                background: active ? "rgba(255,255,255,0.08)" : "transparent",
                                                color: active ? "#fff" : "rgba(255,255,255,0.5)",
                                            }}
                                        >
                                            <Monitor size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                                            <span style={{ flex: 1 }}>{m.hostname}</span>
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
                        {activeSessions.slice(0, 16).map(s => {
                            const shortId = s.id.slice(-3).toUpperCase();
                            const projectName = s.project?.replace(/-/g, "/").split("/").pop() || "";
                            const label = s.customTitle || projectName || shortId;
                            const isSelected = currentSessionId === s.id;
                            const idleMin = (now - new Date(s.updatedAt).getTime()) / 60000;
                            const isStale = idleMin >= 30; // 2 states: active (< 30m) vs dimmed
                            const borderColor = isStale ? "rgba(107,114,128,0.28)" : (isSelected ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.5)");
                            return (
                                <a key={s.id} href={`/${s.id}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 transition"
                                    style={{
                                        background: isSelected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                                        border: `1px solid ${borderColor}`,
                                    }}
                                    title={`${s.id} · ${s.project} · ${Math.round(idleMin)}m idle`}>
                                    <span style={{ display: "inline-flex", filter: isStale ? "grayscale(1)" : "none", opacity: isStale ? 0.3 : 1, transition: "filter 0.2s, opacity 0.2s" }}>
                                        <AppIcon project={projectName} size={12} />
                                    </span>
                                    <span className={`text-[10px] font-bold uppercase ${isStale ? "text-white/25" : (isSelected ? "text-white" : "text-white/70")}`}>{label}</span>
                                </a>
                            );
                        })}
                    </div>
                )}

                {activeSessions.length === 0 && (
                    <span className="text-[10px] text-white/20">No active sessions</span>
                )}
            </div>

            {/* Session detail (UUID route) renders its own full-bleed layout, so skip
                the outer padding + PageHero - they just create a dead band above the
                session header. */}
            {/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(pathname || "") ? (
                <div style={{ minWidth: 0 }}>{children}</div>
            ) : (
                <div className="p-3 md:p-6" style={{ minWidth: 0 }}>
                    <PageHero />
                    {children}
                </div>
            )}
        </div>
    );
}
