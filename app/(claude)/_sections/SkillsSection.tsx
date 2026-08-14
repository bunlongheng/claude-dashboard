"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, List, LayoutGrid, CircleDot } from "lucide-react";
import { FileViews } from "./FileViews";
import { SegmentedTabs } from "./shared";
import { useMachine } from "./MachineContext";
import { useToast } from "./ToastContext";
import { SkillModal } from "./skills/SkillModal";
import { SkillsThumbsGrid } from "./skills/SkillsThumbsGrid";
import { SkillsOrbitalView } from "./skills/SkillsOrbitalView";
import { SkillsMobileGrid } from "./skills/SkillsMobileGrid";
import { getSkillIcon, skillTag, ORB_COLORS } from "./skills/skillIcons";
import type { PluginInfo, SkillInfo } from "./skills/types";

type SkillsApiSkill = { name: string; plugin: string; description: string; path: string; source?: "builtin" | "external"; content?: string; createdAt?: string };
type SkillsApiCommand = { name: string; plugin?: string; description: string; path: string; source?: string; content?: string };
type SkillsApiResponse = { skills?: SkillsApiSkill[]; commands?: SkillsApiCommand[]; plugins?: PluginInfo[] };

// ── Main Component ──────────────────────────────────────────────────────────
export default function SkillsSection() {
    const { machine, machines, apiBase } = useMachine();
    const { showToast } = useToast();
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<SkillInfo | null>(null);
    // Default to list view so the page lands populated with every skill name +
    // description visible (was 'circles' which compressed everything into dots
    // and felt empty until you knew to switch modes).
    const [viewMode, setViewMode] = useState<"thumbs" | "list" | "circles">("list");
    const containerRef = useRef<HTMLDivElement>(null);

    // apiBase already routes to the right host; ?machine= triggers the same
    // self-proxy bug as Sessions/MCP and returns zero skills. Drop it.
    const skillsQuery = useQuery({
        queryKey: ["claude-skills", machine],
        queryFn: async (): Promise<{ skills: SkillInfo[]; plugins: PluginInfo[] }> => {
            try {
                const r = await fetch(apiBase("/api/claude/skills?slim=1"), { cache: "no-store" });
                const d: SkillsApiResponse = r.ok ? await r.json() : { skills: [], commands: [], plugins: [] };
                const allSkills: SkillInfo[] = [...(d.skills ?? [])];
                for (const cmd of (d.commands ?? [])) {
                    if (cmd.source === "external") {
                        allSkills.push({ name: cmd.name, plugin: cmd.plugin || "command", description: cmd.description, path: cmd.path, source: "external", content: cmd.content });
                    }
                }
                return { skills: allSkills, plugins: d.plugins ?? [] };
            } catch {
                return { skills: [], plugins: [] };
            }
        },
    });
    const skills = skillsQuery.data?.skills ?? [];
    const loading = skillsQuery.isLoading;

    const otherMachines = machines.filter(m => m.id !== machine && m.online);

    // Tag a skill: plugin-shipped skills get "shipped"; yours get ssh/custom.
    const tagOf = (s: SkillInfo) => (s.source === "external" ? skillTag(s.name) : "shipped");
    const customSkills = skills; // show all skills (yours + shipped)

    const filtered = useMemo(() => {
        let list = customSkills;
        if (filter !== "all") list = list.filter(s => tagOf(s) === filter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
        }
        return list;
    }, [customSkills, filter, search]);

    // Get unique tags
    const tags = useMemo(() => {
        const counts: Record<string, number> = { all: customSkills.length };
        for (const s of customSkills) {
            const t = s.source === "external" ? skillTag(s.name) : "shipped";
            counts[t] = (counts[t] ?? 0) + 1;
        }
        // Stable order: all, ssh, custom, shipped
        const order = ["all", "ssh", "custom", "shipped"];
        return Object.entries(counts)
            .filter(([, c]) => c > 0)
            .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
            .map(([tag, count]) => ({ tag, count }));
    }, [customSkills]);

    if (loading) return <p className="text-white/30 text-center py-16">Scanning skills...</p>;

    return (
        <div ref={containerRef}>
            {/* Filter + Search */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <SegmentedTabs
                    value={filter}
                    onChange={setFilter}
                    accent="#8AC249"
                    tabs={tags.map(({ tag, count }) => ({ key: tag, label: tag.toUpperCase(), count }))}
                />
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[200px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1"
                        style={{ outline: "none", border: "none" }} />
                </div>
                <div className="flex gap-1 ml-auto">
                    {([["list", List], ["thumbs", LayoutGrid], ["circles", CircleDot]] as const).map(([mode, ModeIcon]) => (
                        <button key={mode} onClick={() => setViewMode(mode)}
                            className="p-1.5 rounded-md cursor-pointer transition"
                            style={{
                                background: viewMode === mode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                                border: viewMode === mode ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                                color: viewMode === mode ? "#fff" : "rgba(255,255,255,0.3)",
                            }}>
                            <ModeIcon size={14} />
                        </button>
                    ))}
                </div>
            </div>

            {viewMode === "list" && (
                <FileViews mode="list" accent="#8AC249"
                    items={filtered.map(s => ({ id: `${s.plugin}/${s.name}`, name: s.name, description: s.description, path: s.path, content: s.content }))}
                    getIcon={(item) => getSkillIcon(item.name)}
                    onItemClick={(item) => {
                        // Map the FileItem id back to the original SkillInfo so the SkillModal
                        // gets full context (source, plugin, sync targets etc).
                        const s = filtered.find(x => `${x.plugin}/${x.name}` === item.id);
                        if (s) setSelected(s);
                    }}
                />
            )}
            {viewMode === "thumbs" && (
                <SkillsThumbsGrid skills={filtered} onSelect={setSelected} />
            )}
            {viewMode === "circles" && (
                <SkillsOrbitalView skills={filtered} filter={filter} onSelect={setSelected} />
            )}

            <SkillsMobileGrid skills={filtered} onSelect={setSelected} />

            {filtered.length === 0 && (
                <div className="text-center py-16">
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                        {search ? `No skills matching "${search}"` : "No skills found"}
                    </p>
                </div>
            )}

            {/* Modal */}
            {selected && (
                <SkillModal
                    skill={selected}
                    color={ORB_COLORS[filtered.indexOf(selected) % ORB_COLORS.length]}
                    onClose={() => setSelected(null)}
                    currentMachine={machine}
                    otherMachines={otherMachines}
                    showToast={showToast}
                />
            )}

            <style>{`
                @keyframes pulseRing {
                    0% { transform: scale(1); opacity: 0.6; }
                    100% { transform: scale(1.6); opacity: 0; }
                }
                @keyframes orbitalIn {
                    from { opacity: 0; transform: translate(-50%, -50%) rotate(-72deg) scale(0.15); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                @keyframes thumbIn {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes navShake {
                    0% { transform: rotate(0); }
                    20% { transform: rotate(-14deg); }
                    40% { transform: rotate(10deg); }
                    60% { transform: rotate(-6deg); }
                    80% { transform: rotate(3deg); }
                    100% { transform: rotate(0); }
                }
            `}</style>
        </div>
    );
}
