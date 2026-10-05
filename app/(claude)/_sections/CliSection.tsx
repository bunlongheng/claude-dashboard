"use client";

import { useState } from "react";
import { cliIconFor } from "./cliIcons";
import { CLI_DESCRIPTIONS } from "@/lib/cli-tools";
import { FileViews, ViewModeToggle, type ViewMode } from "./FileViews";
import { SegmentedTabs } from "./shared";
import McpLogPanel from "./McpLogPanel";
import CliDirectory from "./CliDirectory";
import type { Win } from "@/app/api/claude/cli-log/route";

const ACCENT = "#34C759";

// The CLI page mirrors the MCP page: 1 window filter at the top scopes the
// tool call log and the tool directory underneath it.
export default function CliSection() {
    const tools = Object.keys(CLI_DESCRIPTIONS);
    const [mode, setMode] = useState<ViewMode>("list");
    const [win, setWin] = useState<Win>("today");

    const items = tools.map(name => ({
        id: name,
        name,
        description: CLI_DESCRIPTIONS[name],
        content: CLI_DESCRIPTIONS[name],
    }));

    return (
        <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <p className="text-[10px] text-white/35 m-0">Window for everything on this page</p>
                <SegmentedTabs<Win> tabs={[{ key: "today", label: "Today" }, { key: "7d", label: "7d" }, { key: "30d", label: "30d" }, { key: "90d", label: "90d" }]} value={win} onChange={setWin} accent={ACCENT} />
            </div>
            <McpLogPanel win={win} kind="cli" />
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                {mode !== "list" && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {tools.length} built-in tools
                    </div>
                )}
                <div className="flex gap-1 ml-auto"><ViewModeToggle mode={mode} onMode={setMode} /></div>
            </div>
            {mode === "list"
                ? <CliDirectory win={win} />
                : <FileViews mode={mode} accent={ACCENT} items={items} getIcon={(i) => cliIconFor(i.id)} />}
        </div>
    );
}
