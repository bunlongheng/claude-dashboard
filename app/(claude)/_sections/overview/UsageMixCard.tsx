"use client";

import { useQueries } from "@tanstack/react-query";
import { cardShell } from "@/lib/ui-tokens";
import { useMachine } from "../MachineContext";
import { safeFetch, WindowBadge, type Window4 } from "../shared";
import { DonutChart } from "./DonutChart";

// Query strings per Overview window. skill-usage takes hours / today / all;
// the tool logs take win and cap at 90d, so "all" shows the last 90 days there.
const SKILL_Q: Record<Window4, string> = { today: "today=1", "7d": "hours=168", "30d": "hours=720", all: "all=1" };
const LOG_WIN: Record<Window4, string> = { today: "today", "7d": "7d", "30d": "30d", all: "90d" };

type SkillUsage = { totalSkills: number; totalSubagents: number } | null;
type ToolLog = { totals: { calls: number } } | null;

// Usage mix donut - how the window's calls split across skills, subagents
// and MCP. CLI tool calls (Bash, Read, Edit) run every turn and would be 97%
// of the ring, so they sit under the legend as a plain count instead.
// Replaces the static install-count donut so the card moves with the window.
export function UsageMixCard({ win }: { win: Window4 }) {
    const { apiBase } = useMachine();
    const skillUrl = `${apiBase("/api/claude/skill-usage")}?${SKILL_Q[win]}`;
    const mcpUrl = `${apiBase("/api/claude/mcp-log")}?win=${LOG_WIN[win]}`;
    const cliUrl = `${apiBase("/api/claude/cli-log")}?win=${LOG_WIN[win]}`;
    const [skillQ, mcpQ, cliQ] = useQueries({ queries: [
        { queryKey: ["usage-mix", skillUrl], queryFn: () => safeFetch<SkillUsage>(skillUrl, null), refetchInterval: 60_000 },
        { queryKey: ["usage-mix", mcpUrl], queryFn: () => safeFetch<ToolLog>(mcpUrl, null), refetchInterval: 60_000 },
        { queryKey: ["usage-mix", cliUrl], queryFn: () => safeFetch<ToolLog>(cliUrl, null), refetchInterval: 60_000 },
    ] });
    const segments = [
        { value: skillQ.data?.totalSkills ?? 0, color: "#8AC249", label: "Skills" },
        { value: skillQ.data?.totalSubagents ?? 0, color: "#5AC8FA", label: "Subagents" },
        { value: mcpQ.data?.totals.calls ?? 0, color: "#FFCC00", label: "MCP" },
    ];
    const cliCalls = cliQ.data?.totals.calls ?? 0;
    const total = segments.reduce((s, x) => s + x.value, 0);
    const pending = skillQ.isPending || mcpQ.isPending || cliQ.isPending;

    return (
        <div style={{ ...cardShell, display: "flex", flexDirection: "column" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", margin: 0 }}>Usage mix</p>
                <WindowBadge win={win} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 180, gap: 10 }}>
                {total > 0
                    ? <DonutChart segments={segments} size={156} centerLabel="CALLS" />
                    : <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: 0 }}>{pending ? "Loading" : "No skill, subagent or MCP calls yet."}</p>}
                {cliCalls > 0 && (
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", margin: 0 }}>
                        plus <span style={{ fontWeight: 700, color: "#34C759" }}>{cliCalls.toLocaleString()}</span> CLI tool calls
                    </p>
                )}
            </div>
        </div>
    );
}
