"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ComputerDesktopIcon } from "@heroicons/react/24/outline";
import { timeAgo, ProjectSessions, SectionHeader, MACHINE_COLORS, machineLabel, hexToRgba } from "./shared";
import { useMachine } from "./MachineContext";

const THIS_MACHINE = process.env.NEXT_PUBLIC_MODE === "admin" ? (process.env.LOCAL_MACHINE_ID || "local") : "local";

export default function ActiveSessionsBanner() {
    const { machine } = useMachine();
    const [sessionProjects, setSessionProjects] = useState<ProjectSessions[]>([]);

    const refreshSessions = useCallback(() => {
        fetch("/api/claude/sessions")
            .then(r => r.json())
            .then(d => setSessionProjects(d.projects ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        refreshSessions();
        const timer = setInterval(refreshSessions, 30_000);
        return () => clearInterval(timer);
    }, [refreshSessions]);

    const activeSessions = useMemo(() => {
        const cutoff = Date.now() - 60 * 60 * 1000;
        return sessionProjects.flatMap(p =>
            p.sessions
                .filter(s => new Date(s.updatedAt).getTime() > cutoff)
                .map(s => ({ ...s, project: p.project }))
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }, [sessionProjects]);

    if (machine && machine !== THIS_MACHINE) return null;
    if (activeSessions.length === 0) return null;

    return (
        <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <SectionHeader icon={ComputerDesktopIcon} title={`Active Sessions (${activeSessions.length})`} />
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                        background: hexToRgba(MACHINE_COLORS[THIS_MACHINE], 0.15),
                        color: MACHINE_COLORS[THIS_MACHINE],
                    }}>{machineLabel(THIS_MACHINE)}</span>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {activeSessions.map(s => {
                    const shortId = s.id.slice(-6).toUpperCase();
                    const label = s.customTitle || shortId;
                    const ago = timeAgo(new Date(s.updatedAt).getTime());
                    return (
                        <a key={s.id}
                            href={`/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-[#0f1117] select-none transition hover:border-[#f9731660] hover:bg-[#f9731608]"
                            title={`${s.id} · ${s.project}`}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse bg-emerald-400" />
                            <span className="text-[11px] font-black text-white/85">{label}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white/40 bg-white/[0.06]">{ago}</span>
                        </a>
                    );
                })}
            </div>
        </section>
    );
}
