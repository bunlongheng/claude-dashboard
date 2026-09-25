"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SegmentedTabs, safeFetch } from "./shared";
import { useMachine } from "./MachineContext";
import JevCharts from "./JevCharts";
import JevRouterSwitch from "./JevRouterSwitch";
import type { JevPayload } from "@/lib/jev-log";
import type { JevRouterState } from "@/lib/jev-router-state";

const DAY_RANGES = ["7", "30", "90"] as const;
const ALL_PROJECTS = "__all__";

export default function JevSection({ initial, router, tier }: { initial: JevPayload; router: JevRouterState; tier?: string }) {
    const { machine, apiBase } = useMachine();
    const [days, setDays] = useState<string>(String(initial.days));
    const [project, setProject] = useState<string>(initial.project ?? ALL_PROJECTS);

    const { data } = useQuery<JevPayload>({
        queryKey: ["jev", machine, days, project],
        queryFn: () => {
            const qs = new URLSearchParams({ days });
            if (project !== ALL_PROJECTS) qs.set("project", project);
            return safeFetch<JevPayload>(apiBase(`/api/claude/jev?${qs}`), initial);
        },
        // The hook appends on every prompt, so the page is worth keeping warm
        // while it is open - the route itself caches for 30 s behind this.
        refetchInterval: 30_000,
        initialData: String(initial.days) === days && (initial.project ?? ALL_PROJECTS) === project ? initial : undefined,
    });

    const payload = data ?? initial;
    // Projects come from the unfiltered rows, so the list survives a selection.
    const projects = payload.projects.length > 0 ? payload.projects : initial.projects;

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <SegmentedTabs
                    value={days}
                    onChange={setDays}
                    tabs={DAY_RANGES.map(d => ({ key: d, label: `${d}d` }))}
                />
                <select
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    aria-label="Filter by project"
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8, color: "rgba(255,255,255,0.7)",
                        fontSize: 11, fontWeight: 600, padding: "6px 10px",
                        outline: "none", cursor: "pointer",
                    }}
                >
                    <option value={ALL_PROJECTS} style={{ background: "#14151a" }}>All projects</option>
                    {projects.map(p => (
                        <option key={p} value={p} style={{ background: "#14151a" }}>{p}</option>
                    ))}
                </select>
                <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "ui-monospace, monospace" }}>
                    {payload.logPath}
                </span>
            </div>
            <div style={{ marginBottom: 12 }}>
                <JevRouterSwitch initial={router} />
            </div>
            <JevCharts data={payload} tier={tier} />
        </div>
    );
}
