"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, AlertTriangle, FolderOpen, FileText, Settings, Brain, ShieldCheck, Terminal, List, Share2 } from "lucide-react";
import { marked } from "marked";
import { useMachine } from "./MachineContext";
import { safeFetch } from "./shared";
import dynamic from "next/dynamic";

const MemoryGraph = dynamic(() => import("./MemoryGraph"), { ssr: false });

const CATEGORY_COLORS: Record<string, string> = {
    memory: "#eab308",
    config: "#22d3ee",
    rules: "#8b5cf6",
    session: "#22c55e",
    other: "#fb923c",
};

const TYPE_COLORS: Record<string, string> = {
    user: "#60a5fa", feedback: "#f472b6", project: "#4ade80", reference: "#fb923c",
    unknown: "#ef4444", "claude-md": "#8b5cf6", settings: "#94a3b8", instructions: "#eab308",
    hooks: "#a3e635", commands: "#f472b6",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    memory: Brain, config: Settings, rules: ShieldCheck, other: FileText,
};

interface ClaudeFile {
    name: string; category: string; type: string; description: string;
    content: string; body: string; path: string; updatedAt: string | null; size: number;
}

interface ProjectBrain {
    name: string; folder: string; files: ClaudeFile[];
    sessionCount: number; memoryCount: number;
}

function FileCard({ file }: { file: ClaudeFile }) {
    const [expanded, setExpanded] = useState(false);
    const color = TYPE_COLORS[file.type] ?? CATEGORY_COLORS[file.category] ?? "#6b7280";
    const Icon = CATEGORY_ICONS[file.category] ?? FileText;
    const isMarkdown = file.name.endsWith(".md") || file.category === "memory";

    return (
        <div style={{
            padding: "8px 12px", marginBottom: 3, borderRadius: 6,
            background: "rgba(255,255,255,0.02)", border: `1px solid ${color}12`,
            cursor: "pointer",
        }} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.5)" }} /> : <ChevronRight size={10} style={{ color: "rgba(255,255,255,0.5)" }} />}
                <Icon size={11} style={{ color }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>{file.name}</span>
                <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: `${color}20`, color, textTransform: "uppercase" }}>{file.type}</span>
                {file.description && (
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.description}</span>
                )}
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
                    {file.size < 1024 ? `${file.size}B` : `${(file.size / 1024).toFixed(1)}KB`}
                </span>
            </div>
            {expanded && (
                <>
                    {isMarkdown ? (
                        <div className="mt-2 pl-5 prose-invert prose-sm max-w-none text-[11px] text-white/80 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: marked.parse(file.body || file.content, { gfm: true }) as string }} />
                    ) : (
                        <pre style={{
                            marginTop: 8, marginLeft: 20, padding: 10, borderRadius: 6,
                            background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.06)",
                            fontSize: 10, lineHeight: 1.5, color: "rgba(255,255,255,0.6)",
                            overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>{file.content}</pre>
                    )}
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "4px 0 0", paddingLeft: 20, fontFamily: "monospace" }}>
                        {file.path.replace(/.*\/(Sites|\.claude)\//, (_, m) => m === "Sites" ? "~/" : "~/.claude/")}
                    </p>
                </>
            )}
        </div>
    );
}

function ProjectCard({ project, categoryFilter }: { project: ProjectBrain; categoryFilter: string | null }) {
    const [expanded, setExpanded] = useState(false);
    const filtered = categoryFilter ? project.files.filter(f => f.category === categoryFilter) : project.files;
    if (filtered.length === 0) return null;

    const categories = [...new Set(project.files.map(f => f.category))];

    return (
        <div style={{
            marginBottom: 8, borderRadius: 10,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
        }}>
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition"
                onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.5)" }} /> : <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.5)" }} />}
                <FolderOpen size={14} style={{ color: "#eab308" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{project.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                    {filtered.length} file{filtered.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                    {categories.filter(c => c !== "memory").map(c => (
                        <span key={c} style={{
                            fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                            background: `${CATEGORY_COLORS[c] ?? "#6b7280"}15`,
                            color: CATEGORY_COLORS[c] ?? "#6b7280",
                            textTransform: "uppercase",
                        }}>{c}</span>
                    ))}
                </div>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{project.sessionCount} sessions</span>
            </div>
            {expanded && (
                <div style={{ padding: "0 12px 12px" }}>
                    {filtered.map(f => <FileCard key={f.path} file={f} />)}
                </div>
            )}
        </div>
    );
}

type CategoryFilter = string | null;

export default function BrainSection() {
    const { apiBase } = useMachine();
    const [view, setView] = useState<"list" | "graph">("graph");
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);
    const [projects, setProjects] = useState<ProjectBrain[]>([]);
    const [gaps, setGaps] = useState<string[]>([]);
    const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
    const [totalFiles, setTotalFiles] = useState(0);

    useEffect(() => {
        setLoading(true);
        safeFetch<any>(apiBase("/api/claude/brain"), { projects: [], projectsWithoutMemory: [], categoryCounts: {}, totalFiles: 0 })
            .then(d => {
                setProjects(d.projects ?? []);
                setGaps(d.projectsWithoutMemory ?? []);
                setCategoryCounts(d.categoryCounts ?? {});
                setTotalFiles(d.totalFiles ?? 0);
                setLoading(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    const filteredProjects = useMemo(() => {
        let list = projects;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.map(p => ({
                ...p,
                files: p.files.filter(f =>
                    f.name.toLowerCase().includes(q) ||
                    f.description.toLowerCase().includes(q) ||
                    f.content.toLowerCase().includes(q) ||
                    f.type.toLowerCase().includes(q) ||
                    p.name.toLowerCase().includes(q)
                ),
            })).filter(p => p.files.length > 0);
        }
        if (categoryFilter) {
            list = list.map(p => ({ ...p, files: p.files.filter(f => f.category === categoryFilter) })).filter(p => p.files.length > 0);
        }
        return list.sort((a, b) => b.files.length - a.files.length);
    }, [projects, search, categoryFilter]);

    if (loading) return <p className="text-white/30 text-center py-16">Loading...</p>;

    const categories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

    return (
        <div>
            {/* View toggle - always visible */}
            <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setView("list")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition"
                    style={{
                        background: view === "list" ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.03)",
                        border: view === "list" ? "1px solid rgba(234,179,8,0.35)" : "1px solid rgba(255,255,255,0.06)",
                        color: view === "list" ? "#eab308" : "rgba(255,255,255,0.35)",
                    }}>
                    <List size={12} /> List
                </button>
                {process.env.NEXT_PUBLIC_MODE === "admin" && (
                <button onClick={() => setView("graph")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition"
                    style={{
                        background: view === "graph" ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.03)",
                        border: view === "graph" ? "1px solid rgba(234,179,8,0.35)" : "1px solid rgba(255,255,255,0.06)",
                        color: view === "graph" ? "#eab308" : "rgba(255,255,255,0.35)",
                    }}>
                    <Share2 size={12} /> Graph
                </button>
                )}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>{totalFiles} files in {projects.length} projects</span>
            </div>

            {/* Graph view */}
            {view === "graph" && process.env.NEXT_PUBLIC_MODE === "admin" && <MemoryGraph projects={projects} />}

            {/* List view */}
            {view === "list" && <>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 max-w-[240px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Search size={11} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all files..."
                        className="bg-transparent text-[10px] text-white/70 placeholder-white/25 flex-1" style={{ outline: "none", border: "none" }} />
                </div>
            </div>

            {/* Gaps warning */}
            {gaps.length > 0 && !categoryFilter && !search && (
                <div style={{
                    padding: "10px 14px", marginBottom: 12, borderRadius: 8,
                    background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.15)",
                }} className="flex items-start gap-2">
                    <AlertTriangle size={14} style={{ color: "#fb923c", flexShrink: 0, marginTop: 1 }} />
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "#fb923c", margin: 0 }}>
                            {gaps.length} project{gaps.length !== 1 ? "s" : ""} with no memory
                        </p>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>
                            {gaps.join(", ")}
                        </p>
                    </div>
                </div>
            )}

            {/* Projects */}
            {filteredProjects.map(p => (
                <ProjectCard key={p.folder} project={p} categoryFilter={categoryFilter} />
            ))}

            {filteredProjects.length === 0 && (
                <p className="text-white/20 text-center py-8 text-[11px]">
                    {search ? `No files matching "${search}"` : "No files found"}
                </p>
            )}
            </>}
        </div>
    );
}
