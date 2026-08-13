"use client";

import { useState, useEffect } from "react";
import { useMachine } from "./MachineContext";
import { safeFetch, SegmentedTabs } from "./shared";
import { cardShell } from "@/lib/ui-tokens";

type UsageRow = { name: string; count: number; pct: number; lastUsed: number };
interface SkillUsageData {
    hours: number;
    totalSkills: number;
    totalSubagents: number;
    skills: UsageRow[];
    subagents: UsageRow[];
}

// Time-window tabs: 7d / 30d / ALL (all-time). 30d is the default.
type Win = "7d" | "30d" | "all";
const WIN_PARAM: Record<Win, string> = { "7d": "hours=168", "30d": "hours=720", "all": "all=1" };

// Compact card in the Overview 4-col row next to Context Window: skill name +
// share% + call count, no bars, matching the Context Window style.
export default function SkillUsagePanel() {
    const { apiBase } = useMachine();
    const [win, setWin] = useState<Win>("30d");
    const [data, setData] = useState<SkillUsageData | null>(null);

    useEffect(() => {
        const load = () => safeFetch<SkillUsageData | null>(apiBase(`/api/claude/skill-usage?${WIN_PARAM[win]}`), null).then(d => { if (d) setData(d); });
        load();
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [apiBase, win]);

    return (
        <div style={cardShell}>
            <div className="flex items-center justify-between" style={{ gap: 8, marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Skill Usage</p>
                <SegmentedTabs<Win>
                    tabs={[{ key: "7d", label: "7d" }, { key: "30d", label: "30d" }, { key: "all", label: "ALL" }]}
                    value={win}
                    onChange={setWin}
                    accent="#8AC249"
                />
            </div>
            {data && data.skills.length > 0 ? (
                <div className="space-y-1.5">
                    {data.skills.slice(0, 8).map(r => (
                        <div key={r.name} className="flex items-center justify-between" style={{ padding: "2px 0", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>/{r.name.toLowerCase()}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#8AC249", flexShrink: 0 }}>
                                {/* % is dropped on small/cramped screens; the call count always shows */}
                                <span className="hidden md:inline">{r.pct.toFixed(0)}%</span>
                                <span className="md:ml-[5px]" style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>{r.count}</span>
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>No skill usage</p>
            )}
        </div>
    );
}
