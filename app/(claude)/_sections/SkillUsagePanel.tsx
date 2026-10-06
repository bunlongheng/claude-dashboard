"use client";

import { useQuery } from "@tanstack/react-query";
import { useMachine } from "./MachineContext";
import { safeFetch, type Window4 } from "./shared";
import { cardShell } from "@/lib/ui-tokens";

type UsageRow = { name: string; count: number; pct: number; lastUsed: number };
interface SkillUsageData {
    hours: number;
    totalSkills: number;
    totalSubagents: number;
    skills: UsageRow[];
    subagents: UsageRow[];
}

// The standard Today / 7d / 30d / All windows, driven by the Overview hero tabs.
type Win = Window4;
const WIN_PARAM: Record<Win, string> = { today: "today=1", "7d": "hours=168", "30d": "hours=720", all: "all=1" };

// Compact card in the Overview 4-col row next to Context Window: skill name +
// share% + call count, no bars, matching the Context Window style.
export default function SkillUsagePanel({ win }: { win: Win }) {
    const { apiBase } = useMachine();
    // The route scans every session file touched in the window, so poll it
    // gently: 5 min, no refetch on window focus. Keyed by URL so the machine
    // context settling on mount does not trigger a second load.
    const url = apiBase(`/api/claude/skill-usage?${WIN_PARAM[win]}`);
    const { data } = useQuery<SkillUsageData | null>({
        queryKey: ["skill-usage", url],
        queryFn: () => safeFetch<SkillUsageData | null>(url, null),
        refetchInterval: 300_000,
        refetchOnWindowFocus: false,
        placeholderData: prev => prev,
    });

    return (
        <div style={cardShell}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: "0 0 12px" }}>Skill Usage</p>
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
