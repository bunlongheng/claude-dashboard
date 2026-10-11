"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { SegmentedTabs } from "./shared";
import { useMachine } from "./MachineContext";
import HooksSection from "./HooksSection";
import CommandsSection from "./CommandsSection";
import PluginsSection from "./PluginsSection";
import ModsSection from "./ModsSection";

type ExtTab = "hooks" | "commands" | "plugins" | "mods";

// Unified home for the thin "extend Claude Code" concepts. Only the
// active tab's section mounts (each fetches its own data).
export default function ExtensionsSection() {
    const { apiBase } = useMachine();
    // /hooks, /commands and /plugins redirect here with ?tab= so old links land on the right tab.
    const initialTab = useSearchParams().get("tab");
    const [tab, setTab] = useState<ExtTab>(initialTab === "commands" || initialTab === "plugins" || initialTab === "mods" ? initialTab : "hooks");
    const [counts, setCounts] = useState({ hooks: 0, commands: 0, plugins: 0 });
    const [modCount, setModCount] = useState(0);
    const [markets, setMarkets] = useState<{ name: string; url: string }[]>([]);

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
        fetch(apiBase("/api/claude/mods"))
            .then(r => r.ok ? r.json() : null)
            .then(d => { setModCount(d?.mods?.length ?? 0); setMarkets(d?.marketplaces ?? []); })
            .catch(() => {});
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
                        { key: "mods", label: "Mods", count: modCount },
                    ]}
                />
                {markets.length > 0 && (
                    // Hooks, commands and mods all ship inside marketplace plugins, so one library serves every tab.
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-white/40">
                        <span>Browse library:</span>
                        {markets.map(m => (
                            <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white/70 hover:text-white"
                                style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                                {m.name} <ExternalLink size={10} />
                            </a>
                        ))}
                    </div>
                )}
            </div>
            {tab === "hooks" && <HooksSection />}
            {tab === "commands" && <CommandsSection />}
            {tab === "plugins" && <PluginsSection />}
            {tab === "mods" && <ModsSection />}
        </div>
    );
}
