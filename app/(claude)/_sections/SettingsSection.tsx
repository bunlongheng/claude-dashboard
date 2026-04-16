"use client";

import { useEffect, useState } from "react";
import { Search, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";

interface ProjectSettings {
    project: string;
    path: string;
    settings: Record<string, unknown> | null;
    localSettings: Record<string, unknown> | null;
    instructions: string | null;
    hasHooks: boolean;
    hasCommands: boolean;
}

function SettingsCard({ title, project, data, search }: { title: string; project?: string; data: Record<string, unknown> | null; search: string }) {
    const [expanded, setExpanded] = useState(false);
    if (!data || Object.keys(data).length === 0) return null;
    const text = JSON.stringify(data, null, 2);
    if (search.trim() && !text.toLowerCase().includes(search.toLowerCase())) return null;

    return (
        <div style={{
            padding: "10px 14px", marginBottom: 4, borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                {project && <FolderOpen size={12} style={{ color: "#6b7280" }} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{title}</span>
                {project && (
                    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(107,114,128,0.15)", color: "#6b7280" }}>{project}</span>
                )}
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>{Object.keys(data).length} keys</span>
            </div>
            {expanded && (
                <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 8,
                    background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.7)",
                    overflow: "auto", maxHeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontFamily: "monospace",
                }}>{text}</pre>
            )}
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "3px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                {(project ? `~/Sites/${project}/.claude/` : "~/.claude/") + (title.includes("local") ? "settings.local.json" : title.includes("instructions") ? "instructions.md" : "settings.json")}
            </p>
        </div>
    );
}

function InstructionsCard({ project, content, search }: { project: string; content: string; search: string }) {
    const [expanded, setExpanded] = useState(false);
    if (search.trim() && !content.toLowerCase().includes(search.toLowerCase())) return null;

    return (
        <div style={{
            padding: "10px 14px", marginBottom: 4, borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                <FolderOpen size={12} style={{ color: "#eab308" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>instructions.md</span>
                <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(234,179,8,0.15)", color: "#eab308" }}>{project}</span>
            </div>
            {expanded && (
                <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 8,
                    background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 10, lineHeight: 1.6, color: "rgba(255,255,255,0.7)",
                    overflow: "auto", maxHeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontFamily: "monospace",
                }}>{content}</pre>
            )}
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "3px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                ~/Sites/{project}/.claude/instructions.md
            </p>
        </div>
    );
}

export default function SettingsSection() {
    const [globalSettings, setGlobalSettings] = useState<Record<string, unknown> | null>(null);
    const [globalLocalSettings, setGlobalLocalSettings] = useState<Record<string, unknown> | null>(null);
    const [projects, setProjects] = useState<ProjectSettings[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetch("/api/claude/settings")
            .then(r => r.json())
            .then(d => {
                setGlobalSettings(d.global?.settings ?? null);
                setGlobalLocalSettings(d.global?.localSettings ?? null);
                setProjects(d.projects ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <p className="text-white/30 text-center py-16">Loading settings...</p>;

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
                    {2 + projects.reduce((n, p) => n + (p.settings ? 1 : 0) + (p.localSettings ? 1 : 0) + (p.instructions ? 1 : 0), 0)} files
                </span>
            </div>

            {/* Global */}
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Global</p>
            <SettingsCard title="settings.json" data={globalSettings} search={search} />
            <SettingsCard title="settings.local.json" data={globalLocalSettings} search={search} />

            {/* Per-project */}
            {projects.length > 0 && (
                <>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Per-project ({projects.length})
                    </p>
                    {projects.map(p => (
                        <div key={p.project}>
                            <SettingsCard title="settings.json" project={p.project} data={p.settings} search={search} />
                            <SettingsCard title="settings.local.json" project={p.project} data={p.localSettings} search={search} />
                            {p.instructions && <InstructionsCard project={p.project} content={p.instructions} search={search} />}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
