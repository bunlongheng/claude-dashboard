"use client";

import {
    FolderOpen, Sparkles, Server, Coins, TerminalSquare,
    DatabaseZap, Blocks, BookOpen, Settings as SettingsIcon,
} from "lucide-react";
import { CLI_ICON_MAP } from "../cliIcons";
import { RAG_ENABLED } from "@/lib/features";
import { fmtCompact } from "../shared";
import { HeroCard } from "./HeroCard";
import type { Stats, RagStats } from "./types";

const CLI_TOOL_COUNT = Object.keys(CLI_ICON_MAP).length;

// Hero metrics row - 10 boxes, 5 per row. Each: headline + 2-stat breakdown.
// Order + colors mirror the left nav gradient (red -> indigo, no white).
export function HeroCardsGrid({ stats, ragStats, liveSessions, totalTokens }: {
    stats: Stats; ragStats: RagStats | null; liveSessions: number; totalTokens: number;
}) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {RAG_ENABLED && (
                <HeroCard name="RAG" icon={DatabaseZap} color="#FF3B30" href="/rag" stats={[
                    { label: "Docs", value: ragStats?.documents ?? 0 },
                    { label: "Prefs", value: ragStats?.preferences ?? 0 },
                    { label: "Chunks", value: ragStats?.chunks ?? 0 },
                ]} />
            )}
            <HeroCard name="Rules" icon={BookOpen} color="#FF9500" href="/global" stats={[
                { label: "Rules", value: stats.rules },
                { label: "CLAUDE.md", value: stats.claudeMd },
            ]} />
            <HeroCard name="MCP" icon={Server} color="#FFCC00" href="/mcp" stats={[
                { label: "Servers", value: stats.mcp },
                { label: "Mine", value: stats.mcpMine },
                { label: "Shipped", value: stats.mcpShipped },
            ]} />
            <HeroCard name="Skills" icon={Sparkles} color="#8AC249" href="/skills" stats={[
                { label: "Skills", value: stats.skills },
                { label: "Commands", value: stats.commands },
            ]} />
            <HeroCard name="CLI" icon={TerminalSquare} color="#34C759" href="/cli" stats={[
                { label: "Tools", value: CLI_TOOL_COUNT },
            ]} />
            <HeroCard name="Extensions" icon={Blocks} color="#30D158" href="/extensions" stats={[
                { label: "Extensions", value: stats.hooks + stats.commands + stats.plugins },
                { label: "Hooks", value: stats.hooks },
                { label: "Cmds", value: stats.commands },
                { label: "Plugins", value: stats.plugins },
            ]} />
            <HeroCard name="Settings" icon={SettingsIcon} color="#5AC8FA" href="/settings" stats={[
                { label: "Keys", value: stats.settings },
            ]} />
            <HeroCard name="Sessions" icon={FolderOpen} color="#007AFF" href="/sessions" stats={[
                { label: "Total", value: stats.sessions },
                { label: "Active", value: stats.activeSessions },
                { label: "Live", value: liveSessions },
            ]} />
            <HeroCard name="Tokens" icon={Coins} color="#5856D6" href="/tokens" stats={[
                { label: "Total", value: fmtCompact(totalTokens) },
                { label: "In", value: fmtCompact(stats.tokens.input) },
                { label: "Out", value: fmtCompact(stats.tokens.output) },
            ]} />
        </div>
    );
}
