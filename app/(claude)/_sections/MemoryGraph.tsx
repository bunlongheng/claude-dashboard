"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { X, Brain, FileText, Settings, ShieldCheck, FolderOpen } from "lucide-react";
import { marked } from "marked";

const CATEGORY_COLORS: Record<string, string> = {
    memory: "#eab308", config: "#22d3ee", rules: "#8b5cf6", session: "#22c55e", other: "#fb923c",
};
const TYPE_COLORS: Record<string, string> = {
    user: "#60a5fa", feedback: "#f472b6", project: "#4ade80", reference: "#fb923c",
    unknown: "#ef4444", "claude-md": "#8b5cf6", settings: "#94a3b8",
    instructions: "#eab308", hooks: "#a3e635", commands: "#f472b6",
    md: "#fb923c",
};

interface ClaudeFile {
    name: string; category: string; type: string; description: string;
    content: string; body: string; path: string; size: number;
}
interface ProjectBrain {
    name: string; folder: string; files: ClaudeFile[];
    sessionCount: number; memoryCount: number;
}

interface Node {
    id: string; label: string; x: number; y: number;
    color: string; r: number; type: "root" | "project" | "file";
    data?: ClaudeFile; project?: string; fileCount?: number;
}

function Starfield() {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const c = ref.current; if (!c) return;
        const ctx = c.getContext("2d"); if (!ctx) return;
        let raf: number, t = 0;
        const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
        resize(); window.addEventListener("resize", resize);
        const stars = Array.from({ length: 120 }, () => ({
            x: Math.random() * c.width, y: Math.random() * c.height,
            r: Math.random() * 1 + 0.2, speed: Math.random() * 0.3 + 0.1,
            phase: Math.random() * Math.PI * 2,
        }));
        const draw = () => {
            t += 0.008; ctx.clearRect(0, 0, c.width, c.height);
            stars.forEach(s => {
                const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * s.speed + s.phase));
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${tw * 0.4})`; ctx.fill();
            });
            raf = requestAnimationFrame(draw);
        };
        draw();
        return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
    }, []);
    return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

function buildNodes(projects: ProjectBrain[], w: number, h: number, expandedProject: string | null, panelRight: boolean): Node[] {
    const cx = panelRight ? w * 0.25 : w / 2;
    const cy = panelRight ? h * 0.45 : h * 0.4;
    const nodes: Node[] = [];

    // Root node — center
    nodes.push({ id: "root", label: "Memory", x: cx, y: cy, color: "#eab308", r: 34, type: "root" });

    const filtered = projects.filter(p => p.files.length > 0);
    const n = filtered.length;
    const orbitR = Math.min(w * 0.3, h * 0.3, 220);

    // Find expanded project index to calculate rotation offset
    const expandedIdx = expandedProject ? filtered.findIndex(p => p.name === expandedProject) : -1;
    // Wide: rotate to 3 o'clock (0 rad), narrow: rotate to 6 o'clock (PI/2)
    const targetAngle = panelRight ? 0 : Math.PI / 2;
    const rotationOffset = expandedIdx >= 0
        ? targetAngle - ((2 * Math.PI * expandedIdx) / n - Math.PI / 2)
        : 0;

    filtered.forEach((proj, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2 + rotationOffset;
        const px = Math.max(45, Math.min(w - 45, cx + orbitR * Math.cos(angle)));
        const py = Math.max(45, Math.min(h - 45, cy + orbitR * Math.sin(angle)));
        const isExpanded = expandedProject === proj.name;
        const nameLen = proj.name.length;
        const baseR = Math.max(26, Math.min(36, 22 + nameLen * 1.2));
        nodes.push({ id: `proj-${proj.name}`, label: proj.name, x: px, y: py, color: "#eab308", r: isExpanded ? 38 : baseR, type: "project", fileCount: proj.files.length });

        if (isExpanded) {
            const fileCount = proj.files.length;

            if (panelRight) {
                // Wide: arc from project node toward the panel
                const arcCx = (px + w * 0.57) / 2;
                const arcCy = h / 2;
                const arcR = Math.min(h * 0.35, 180);

                proj.files.forEach((file, fi) => {
                    // Spread evenly in a semicircle (-90 to +90 degrees)
                    const angleRange = Math.min(Math.PI * 0.8, fileCount * 0.4);
                    const startAngle = -angleRange / 2;
                    const step = fileCount > 1 ? angleRange / (fileCount - 1) : 0;
                    const fAngle = startAngle + fi * step;
                    const fx = Math.max(30, Math.min(w * 0.55, arcCx + arcR * Math.cos(fAngle)));
                    const fy = Math.max(30, Math.min(h - 30, arcCy + arcR * Math.sin(fAngle)));
                    const color = TYPE_COLORS[file.type] ?? CATEGORY_COLORS[file.category] ?? "#6b7280";
                    const fileNameLen = file.name.length;
                    const fileR = Math.max(18, Math.min(26, 12 + fileNameLen * 1));
                    nodes.push({ id: `file-${proj.name}-${fi}`, label: file.name.slice(0, 16), x: fx, y: fy, color, r: fileR, type: "file", data: file, project: proj.name });
                });
            } else {
                // Narrow: fan out below
                const panelTop = h * 0.52;
                const fileY = py + 55;
                const spacing = Math.min(60, (w - 60) / Math.max(fileCount, 1));
                const totalW = spacing * (fileCount - 1);
                const startX = px - totalW / 2;

                proj.files.forEach((file, fi) => {
                    const row = Math.floor(fi / Math.min(fileCount, 8));
                    const fx = Math.max(30, Math.min(w - 30, startX + (fi % 8) * spacing));
                    const fy = Math.min(fileY + row * 48, panelTop - 20);
                const color = TYPE_COLORS[file.type] ?? CATEGORY_COLORS[file.category] ?? "#6b7280";
                const fileNameLen = file.name.length;
                const fileR = Math.max(18, Math.min(26, 12 + fileNameLen * 1));
                nodes.push({ id: `file-${proj.name}-${fi}`, label: file.name.slice(0, 16), x: fx, y: fy, color, r: fileR, type: "file", data: file, project: proj.name });
            });
            }
        }
    });

    return nodes;
}

function playBoop() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const t = ctx.currentTime;

        // PSP-style soft chime — two layered sine tones with gentle attack
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(1200, t);
        osc1.frequency.exponentialRampToValueAtTime(1400, t + 0.06);
        gain1.gain.setValueAtTime(0, t);
        gain1.gain.linearRampToValueAtTime(0.08, t + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1800, t);
        osc2.frequency.exponentialRampToValueAtTime(2000, t + 0.04);
        gain2.gain.setValueAtTime(0, t);
        gain2.gain.linearRampToValueAtTime(0.04, t + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc1.start(t); osc1.stop(t + 0.15);
        osc2.start(t); osc2.stop(t + 0.1);
    } catch {}
}

function NodeCircle({ node, isSelected, dimmed, onClick }: {
    node: Node; isSelected: boolean; dimmed?: boolean; onClick: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    const d = node.r * 2;
    const useColor = node.type === "root" || isSelected;
    const c = useColor ? node.color : "rgba(255,255,255,0.6)";
    const borderC = useColor ? `${node.color}60` : "rgba(255,255,255,0.15)";
    return (
        <div
            onClick={e => { e.stopPropagation(); onClick(); }}
            onMouseEnter={() => { setHovered(true); playBoop(); }}
            onMouseLeave={() => setHovered(false)}
            className="absolute select-none cursor-pointer"
            style={{
                left: node.x, top: node.y,
                transform: `translate(-50%, -50%) scale(${dimmed ? 0.85 : hovered ? 1.1 : 1})`,
                width: d, height: d,
                zIndex: node.type === "root" ? 20 : node.type === "project" ? 15 : 10,
                transition: "left 0.5s ease, top 0.5s ease, opacity 0.4s, transform 0.2s ease",
                opacity: dimmed ? 0.3 : 1,
            }}
        >
            <div className="w-full h-full rounded-full flex flex-col items-center justify-center overflow-hidden"
                style={{
                    border: `2px solid ${borderC}`,
                    background: hovered
                        ? `radial-gradient(circle, ${c}25 0%, ${c}10 50%, #08090d 80%)`
                        : `radial-gradient(circle at 38% 32%, ${c}12 0%, #08090d 70%)`,
                    boxShadow: isSelected ? `0 0 20px ${node.color}60` : hovered ? `0 0 16px ${c}30` : "none",
                    animation: isSelected ? `nodePulse 2s ease-in-out infinite` : "none",
                    "--nc": node.color,
                } as React.CSSProperties}>
                {node.type === "root" ? (
                    <Brain size={20} style={{ color: node.color }} />
                ) : (
                    <>
                <span style={{
                    fontSize: node.type === "project" ? 9 : 7,
                    fontWeight: 700, color: c,
                    textAlign: "center", lineHeight: 1.2,
                    padding: "0 2px",
                    overflow: "hidden", textOverflow: "ellipsis",
                }}>{node.label}</span>
                {node.fileCount != null && (
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)" }}>{node.fileCount} files</span>
                )}
                    </>
                )}
            </div>
        </div>
    );
}

function FilePanel({ file, project, onClose, wide }: { file: ClaudeFile; project: string; onClose: () => void; wide: boolean }) {
    const color = TYPE_COLORS[file.type] ?? CATEGORY_COLORS[file.category] ?? "#6b7280";
    return (
        <div className={`absolute z-50 flex flex-col ${wide ? "top-0 right-0 bottom-0 w-[40%]" : "left-0 right-0 bottom-0"}`}
            style={{ background: "#0f1117", border: `1px solid ${color}40`, height: wide ? "auto" : "45%", borderRadius: 16, margin: 8, boxShadow: `0 0 20px ${color}20` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{file.name}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: `${color}20`, color, textTransform: "uppercase" }}>{file.type}</span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{project}</span>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition cursor-pointer ml-auto"><X size={14} /></button>
                </div>
                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", margin: "3px 0 0", paddingLeft: 18 }}>
                    {file.path.replace(/.*\/(Sites|\.claude)\//, (_, m) => m === "Sites" ? "~/" : "~/.claude/")}
                </p>
            </div>
            <div className="flex-1 overflow-auto p-4">
                {file.name.endsWith(".json") ? (
                    <pre style={{
                        fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.75)",
                        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                    }}>{file.content}</pre>
                ) : (
                    <div className="prose-invert prose-sm max-w-none text-[12px] leading-relaxed"
                        style={{ color: "rgba(255,255,255,0.8)" }}
                        dangerouslySetInnerHTML={{ __html: marked.parse(file.body || file.content, { gfm: true }) as string }} />
                )}
            </div>
        </div>
    );
}

export default function MemoryGraph({ projects }: { projects: ProjectBrain[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 800, h: 500 });
    const [selected, setSelected] = useState<{ file: ClaudeFile; project: string } | null>(null);
    const [selectedProject, setSelectedProject] = useState<string | null>(null);

    useLayoutEffect(() => {
        const el = containerRef.current; if (!el) return;
        const measure = () => { const r = el.getBoundingClientRect(); setDims({ w: r.width, h: r.height }); };
        measure();
        const ro = new ResizeObserver(measure); ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const isWide = dims.w > 1000;
    const panelRight = isWide && !!selected;
    const nodes = useMemo(() => buildNodes(projects, dims.w, dims.h, selectedProject, panelRight), [projects, dims, selectedProject, panelRight]);

    // Connection lines
    const lines = useMemo(() => {
        const result: { from: Node; to: Node }[] = [];
        const map = new Map(nodes.map(n => [n.id, n]));
        const root = map.get("root");
        for (const n of nodes) {
            if (n.type === "project" && root) result.push({ from: root, to: n });
            if (n.type === "file" && n.project) {
                const proj = map.get(`proj-${n.project}`);
                if (proj) result.push({ from: proj, to: n });
            }
        }
        return result;
    }, [nodes]);

    const handleClick = useCallback((node: Node) => {
        if (node.type === "file" && node.data && node.project) {
            setSelected({ file: node.data, project: node.project });
        } else if (node.type === "project") {
            const isToggling = selectedProject === node.label;
            if (isToggling) {
                setSelected(null);
                setSelectedProject(null);
            } else {
                setSelectedProject(node.label);
                // Auto-open first file
                const proj = projects.find(p => p.name === node.label);
                if (proj && proj.files.length > 0) {
                    setSelected({ file: proj.files[0], project: proj.name });
                } else {
                    setSelected(null);
                }
            }
        } else if (node.type === "root") {
            setSelected(null);
            setSelectedProject(null);
        }
    }, [projects, selectedProject]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, []);

    const hasPanel = !!selected || !!selectedProject;

    return (
        <div className="relative" style={{ height: "calc(100vh - 280px)", minHeight: 400, overflow: "hidden", borderRadius: 12 }}>
            <style>{`
                @keyframes nodePulse { 0%, 100% { box-shadow: 0 0 8px var(--nc); } 50% { box-shadow: 0 0 18px var(--nc), 0 0 5px var(--nc); } }
            `}</style>

            <div ref={containerRef} className="relative w-full h-full"
                style={{ background: "#08090d", overflow: "hidden" }}
                onClick={() => { setSelected(null); setSelectedProject(null); }}>
                <Starfield />

                {/* Lines */}
                <svg width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
                    {lines.map(({ from, to }, i) => {
                        const dx = to.x - from.x, dy = to.y - from.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 2) return null;
                        const ux = dx / dist, uy = dy / dist;
                        const x1 = from.x + ux * from.r, y1 = from.y + uy * from.r;
                        const x2 = to.x - ux * to.r, y2 = to.y - uy * to.r;
                        // Color line only for root→selected project, else white
                        const isSelectedLine = from.type === "root" && to.type === "project" && selectedProject === to.label;
                        const lineColor = isSelectedLine ? to.color : "rgba(255,255,255,0.5)";
                        return (
                            <line key={i}
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke={lineColor}
                                strokeWidth={to.type === "file" ? 1.5 : 2}
                                strokeOpacity={isSelectedLine ? 0.4 : to.type === "file" ? 0.15 : 0.08} />
                        );
                    })}
                    {/* Curved connector from selected file to panel */}
                    {selected && (() => {
                        const fileNode = nodes.find(n => n.type === "file" && n.data?.path === selected.file.path);
                        if (!fileNode) return null;
                        if (isWide) {
                            return (
                                <line
                                    x1={fileNode.x + fileNode.r} y1={fileNode.y}
                                    x2={dims.w * 0.6} y2={fileNode.y}
                                    stroke="rgba(255,255,255,0.5)"
                                    strokeWidth={1} strokeOpacity={0.25} />
                            );
                        }
                        return (
                            <line
                                x1={fileNode.x} y1={fileNode.y + fileNode.r}
                                x2={fileNode.x} y2={dims.h}
                                stroke="rgba(255,255,255,0.5)"
                                strokeWidth={1} strokeOpacity={0.25} />
                        );
                    })()}
                </svg>

                {/* Nodes */}
                {nodes.map(node => (
                    <NodeCircle key={node.id} node={node}
                        isSelected={
                            (node.type === "file" && node.data && selected?.file?.path === node.data.path) ||
                            (node.type === "project" && selectedProject === node.label)
                        }
                        onClick={() => handleClick(node)} />
                ))}
            </div>


            {/* File detail panel */}
            {selected && (
                <FilePanel file={selected.file} project={selected.project} onClose={() => setSelected(null)} wide={isWide} />
            )}

        </div>
    );
}
