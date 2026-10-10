"use client";

import {
    FolderOpen, Sparkles, Server, Coins, TerminalSquare,
    DatabaseZap, Blocks, Bot, Search as SearchIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RAG_ENABLED } from "@/lib/features";
import { METRIC_COLORS } from "@/lib/ui-tokens";
import { fmtCompact, safeFetch, type Window4 } from "../shared";
import { useMachine } from "../MachineContext";
import { SKILL_Q, LOG_WIN } from "./UsageMixCard";
import JevMark, { JEV_PINK } from "../JevMark";
import type { JevPayload } from "@/lib/jev-log";
import { JEV_DAYS } from "@/lib/jev-palette";
import { HeroCard } from "./HeroCard";
import type { Stats } from "./types";

// Every card is activity inside the selected window, not an inventory count:
// what the RAG loaded, how many agents were launched, how many MCP / CLI calls
// ran, how many skills fired, how many hooks fired, how many searches matched.
// Order + colors mirror the left nav gradient (red -> indigo, no white).
// Hook fires: Today is since local midnight like every other card, not a rolling 24 h.
const HOOK_Q: Record<Window4, string> = { today: "today=1", "7d": "hours=168", "30d": "hours=720" };
type SkillUsage = { totalSkills: number; totalSubagents: number };
type ToolLog = { totals: { calls: number } };
type RagWindow = { windowed?: { loaded: number; searches: number; docs: number } };
type HookFires = { fires: number };
export function HeroCardsGrid({ stats, liveSessions, win, winSessions, winTokensIn, winTokensOut }: {
    stats: Stats; liveSessions: number;
    win: Window4; winSessions: number; winTokensIn: number; winTokensOut: number;
}) {
    // Same key + URL as JevCard below, so react-query serves one fetch to both.
    const { apiBase } = useMachine();
    const days = JEV_DAYS[win];
    const jevUrl = `${apiBase("/api/claude/jev")}?days=${days}`;
    const jevQ = useQuery<JevPayload | null>({
        queryKey: ["overview-jev", jevUrl],
        queryFn: () => safeFetch<JevPayload | null>(jevUrl, null),
        refetchInterval: 60_000,
    });
    const jev = jevQ.data?.totals;

    // Same keys + URLs as UsageMixCard, so react-query serves 1 fetch to both and the cards agree.
    const skillUrl = `${apiBase("/api/claude/skill-usage")}?${SKILL_Q[win]}`;
    const mcpUrl = `${apiBase("/api/claude/mcp-log")}?win=${LOG_WIN[win]}`;
    const cliUrl = `${apiBase("/api/claude/cli-log")}?win=${LOG_WIN[win]}`;
    const skillQ = useQuery<SkillUsage | null>({ queryKey: ["usage-mix", skillUrl], queryFn: () => safeFetch<SkillUsage | null>(skillUrl, null), refetchInterval: 60_000 });
    const mcpQ = useQuery<ToolLog | null>({ queryKey: ["usage-mix", mcpUrl], queryFn: () => safeFetch<ToolLog | null>(mcpUrl, null), refetchInterval: 60_000 });
    const cliQ = useQuery<ToolLog | null>({ queryKey: ["usage-mix", cliUrl], queryFn: () => safeFetch<ToolLog | null>(cliUrl, null), refetchInterval: 60_000 });
    const hookUrl = `${apiBase("/api/claude/hook-fires")}?${HOOK_Q[win]}`;
    const hookQ = useQuery<HookFires | null>({ queryKey: ["hero-hooks", hookUrl], queryFn: () => safeFetch<HookFires | null>(hookUrl, null), refetchInterval: 60_000 });
    const ragUrl = `${apiBase("/api/rag/stats")}?days=${days}`;
    const ragQ = useQuery<RagWindow | null>({ queryKey: ["hero-rag", ragUrl], queryFn: () => safeFetch<RagWindow | null>(ragUrl, null), refetchInterval: 60_000 });
    const ragWin = ragQ.data?.windowed;
    const mcpCalls = mcpQ.data?.totals.calls ?? 0;
    const cliCalls = cliQ.data?.totals.calls ?? 0;
    const agentCalls = skillQ.data?.totalSubagents ?? 0;
    const skillCalls = skillQ.data?.totalSkills ?? 0;
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {RAG_ENABLED && (
                <HeroCard name="RAG" icon={DatabaseZap} color="#FF3B30" href="/rag" stats={[
                    { label: "Loaded", value: ragWin?.loaded ?? 0 },
                ]} />
            )}
            <HeroCard name="Agents" icon={Bot} color="#FF9500" href="/agents" stats={[
                { label: "Launched", value: agentCalls },
            ]} />
            <HeroCard name="MCP" icon={Server} color="#FFCC00" href="/mcp" stats={[
                { label: "Calls", value: mcpCalls },
            ]} />
            <HeroCard name="Skills" icon={Sparkles} color="#8AC249" href="/skills" stats={[
                { label: "Invoked", value: skillCalls },
            ]} />
            <HeroCard name="CLI" icon={TerminalSquare} color="#34C759" href="/cli" stats={[
                { label: "Calls", value: cliCalls },
            ]} />
            <HeroCard name="Extensions" icon={Blocks} color="#30D158" href="/extensions" stats={[
                { label: "Hook fires", value: hookQ.data?.fires ?? 0 },
            ]} />
            <HeroCard name="Search" icon={SearchIcon} color="#5AC8FA" href="/rag" stats={[
                { label: "Matched", value: ragWin?.searches ?? 0 },
            ]} />
            <HeroCard name="Sessions" icon={FolderOpen} color={METRIC_COLORS.sessions} href="/sessions" stats={[
                { label: "Total", value: winSessions },
                { label: "Active", value: stats.activeSessions },
                { label: "Live", value: liveSessions },
            ]} />
            <HeroCard name="Tokens" icon={Coins} color={METRIC_COLORS.tokens} href="/tokens" stats={[
                { label: "Total", value: fmtCompact(winTokensIn + winTokensOut) },
                { label: "In", value: fmtCompact(winTokensIn) },
                { label: "Out", value: fmtCompact(winTokensOut) },
            ]} />
            <HeroCard name="Jev" icon={JevMark} color={JEV_PINK} href="/jev" stats={[
                { label: "Routed", value: jev?.routed ?? 0 },
                { label: "Calls", value: jev?.calls ?? 0 },
                { label: "Avg ms", value: jev?.avgLatencyMs ?? 0 },
            ]} />
        </div>
    );
}
