"use client";

import { useState, useEffect } from "react";
import { SegmentedTabs } from "./shared";
import { useMachine } from "./MachineContext";
import HooksSection from "./HooksSection";
import CommandsSection from "./CommandsSection";
import PluginsSection from "./PluginsSection";

type ExtTab = "hooks" | "commands" | "plugins";

// Unified home for the three thin "extend Claude Code" concepts. Only the
// active tab's section mounts (each fetches its own data).
export default function ExtensionsSection() {
    const { apiBase } = useMachine();
    const [tab, setTab] = useState<ExtTab>("hooks");
    const [counts, setCounts] = useState({ hooks: 0, commands: 0, plugins: 0 });

    useEffect(() => {
        fetch(apiBase("/api/claude/skills?slim=1"))
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.summary) setCounts({
                    hooks: d.summary.hooks ?? 0,
                    commands: d.summary.commands ?? 0,
                    plugins: d.summary.plugins ?? 0,
                });
            })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <SegmentedTabs
                    value={tab}
                    onChange={setTab}
                    accent="#30D158"
                    tabs={[
                        { key: "hooks", label: "Hooks", count: counts.hooks },
                        { key: "commands", label: "Commands", count: counts.commands },
                        { key: "plugins", label: "Plugins", count: counts.plugins },
                    ]}
                />
            </div>
            {tab === "hooks" && <HooksSection />}
            {tab === "commands" && <CommandsSection />}
            {tab === "plugins" && <PluginsSection />}
        </div>
    );
}
