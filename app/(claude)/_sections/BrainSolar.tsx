"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { Brain, X, Check, ChevronRight, Calendar, Cloud } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MemNode {
    id: string; text: string; x: number; y: number; color: string;
    connections: string[]; hidden?: boolean; depth?: number; scale?: number; ruleCount?: number;
}
interface Rule {
    id: string; category: string; title: string; instruction: string;
    created_at?: string; updated_at?: string; confidence?: number; source?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = ["#a855f7","#22d3ee","#4ade80","#ec4899","#fb923c","#facc15","#60a5fa","#2dd4bf","#f87171","#34d399","#818cf8","#c084fc"];
const CAT_COLORS: Record<string, string> = {
    architecture:"#60a5fa", workflow:"#4ade80", css:"#f472b6", db:"#fb923c",
    security:"#f87171", infra:"#a78bfa", performance:"#facc15", general:"#94a3b8",
};
const NODE_R = 46, RULE_NODE_R = 26, ORBIT_CY = 240, FRONT_ANGLE = Math.PI / 2;

function catNodeR(text: string) { return Math.round(Math.max(40, Math.min(62, 38 + text.length * 1.5))); }
function orbitRx(w: number) { return Math.min(w * 0.37, 340); }
function orbitRy(rx: number) { return rx * 0.26; }

function buildOrbitNodes(rules: Rule[], categories: string[], w: number, angle: number, expandedCat: string | null): MemNode[] {
    const cx = w / 2, cy = ORBIT_CY, rx = orbitRx(w), ry = orbitRy(rx), n = categories.length;
    const nodes: MemNode[] = [];
    nodes.push({ id: "brain-root", text: "Claude\nBrain", x: cx, y: cy, color: "#a855f7", connections: [], depth: expandedCat ? 0.5 : 1, scale: expandedCat ? 0.6 : 1 });
    categories.forEach((cat, i) => {
        const theta = (2 * Math.PI * i) / n + angle, sinT = Math.sin(theta), depth = (sinT + 1) / 2;
        const x = cx + rx * Math.cos(theta), y = cy + ry * sinT;
        const color = CAT_COLORS[cat] || COLORS[i % COLORS.length];
        const catRules = rules.filter(r => r.category === cat), catId = `cat-${cat}`, isFocused = expandedCat === catId, anyExpanded = expandedCat !== null;
        nodes.push({ id: catId, text: cat, ruleCount: catRules.length, x: isFocused ? cx : x, y: isFocused ? cy + ry + 90 : y, color, connections: ["brain-root"], depth: anyExpanded && !isFocused ? 0.2 : isFocused ? 1 : depth, scale: anyExpanded && !isFocused ? 0.45 : isFocused ? 1.15 : 1 });
        if (isFocused) {
            const spacing = Math.min(80, (w - 120) / Math.max(catRules.length, 1)), totalW = spacing * (catRules.length - 1), startX = (w - totalW) / 2;
            catRules.forEach((rule, ri) => { nodes.push({ id: rule.id, text: rule.title.replace(/\[project:[^\]]*\]\s*[--]\s*/i, "").slice(0, 18), x: startX + ri * spacing, y: cy + ry + 260, color, connections: [catId], depth: 1 }); });
        }
    });
    return nodes;
}

function OrbitTrack({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
    return (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
            <defs><filter id="orbit-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={2.5} strokeDasharray="4 8" filter="url(#orbit-glow)" />
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="4 8" />
        </svg>
    );
}

function Starfield() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        let raf: number, t = 0;
        const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
        resize(); window.addEventListener("resize", resize);
        const stars = Array.from({ length: 180 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.2 + 0.2, speed: Math.random() * 0.4 + 0.1, phase: Math.random() * Math.PI * 2, color: ["#a855f7","#60a5fa","#f472b6","#22d3ee","#ffffff"][Math.floor(Math.random() * 5)] }));
        const glows = Array.from({ length: 6 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: 80 + Math.random() * 120, phase: Math.random() * Math.PI * 2, color: ["#a855f730","#60a5fa20","#f472b620","#22d3ee18","#4ade8018"][Math.floor(Math.random() * 5)] }));
        const draw = () => {
            t += 0.008; ctx.clearRect(0, 0, canvas.width, canvas.height);
            glows.forEach(g => { const pulse = 0.7 + 0.3 * Math.sin(t * 0.4 + g.phase); const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r * pulse); grad.addColorStop(0, g.color); grad.addColorStop(1, "transparent"); ctx.beginPath(); ctx.arc(g.x, g.y, g.r * pulse, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill(); });
            stars.forEach(s => { const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(t * s.speed + s.phase)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.globalAlpha = twinkle * 0.8; ctx.fill(); ctx.globalAlpha = 1; if (s.r > 1) { ctx.strokeStyle = s.color; ctx.globalAlpha = twinkle * 0.3; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(s.x - s.r * 2.5, s.y); ctx.lineTo(s.x + s.r * 2.5, s.y); ctx.moveTo(s.x, s.y - s.r * 2.5); ctx.lineTo(s.x, s.y + s.r * 2.5); ctx.stroke(); ctx.globalAlpha = 1; } });
            raf = requestAnimationFrame(draw);
        };
        draw();
        return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
    }, []);
    return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

function nodeVisualRadius(n: MemNode): number {
    const baseR = n.id === "brain-root" ? NODE_R + 8 : n.id.startsWith("cat-") ? catNodeR(n.text) : RULE_NODE_R;
    return baseR * (n.id.startsWith("cat-") ? (0.6 + 0.4 * (n.depth ?? 1)) : 1) * (n.scale ?? 1);
}

function ConnectionLines({ nodes, dims, expandedCat }: { nodes: MemNode[]; dims: { w: number; h: number }; expandedCat: string | null }) {
    const pairs = useMemo(() => {
        const seen = new Set<string>(), result: { from: MemNode; to: MemNode }[] = [];
        const map = new Map(nodes.map(n => [n.id, n]));
        for (const n of nodes) { if (n.hidden) continue; for (const cid of n.connections) { const key = [n.id, cid].sort().join("|"); if (!seen.has(key)) { seen.add(key); const other = map.get(cid); if (other && !other.hidden) result.push({ from: n, to: other }); } } }
        return result;
    }, [nodes]);
    return (
        <svg width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 2 }}>
            {pairs.map(({ from, to }) => {
                const dx = to.x - from.x, dy = to.y - from.y, dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 2) return null;
                const ux = dx / dist, uy = dy / dist, fr = nodeVisualRadius(from), tr = nodeVisualRadius(to);
                const x1 = from.x + ux * fr, y1 = from.y + uy * fr, x2 = to.x - ux * tr, y2 = to.y - uy * tr;
                const color = from.id.startsWith("cat-") ? from.color : to.id.startsWith("cat-") ? to.color : from.color;
                const isSelected = from.id === expandedCat || to.id === expandedCat;
                return (
                    <g key={`conn-${from.id}-${to.id}`}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={isSelected ? 5.8 : 5} strokeOpacity={isSelected ? 0.15 : 0.06} />
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={isSelected ? 1.8 : 1} strokeOpacity={isSelected ? 0.85 : 0.45} />
                    </g>
                );
            })}
        </svg>
    );
}

function PlanetRing({ r, color, tilt, duration }: { r: number; color: string; tilt: number; duration: number }) {
    return (
        <div className="absolute inset-0 pointer-events-none" style={{ transform: `rotateX(${tilt}deg)`, zIndex: 100 }}>
            <svg style={{ position: "absolute", inset: -r * 0.6, width: "160%", height: "160%" }} viewBox="-80 -80 160 160">
                <ellipse cx="0" cy="0" rx="70" ry="18" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.35">
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={`${duration}s`} repeatCount="indefinite" />
                </ellipse>
                <circle r="4" fill={color} fillOpacity="0.7">
                    <animateMotion dur={`${duration}s`} repeatCount="indefinite" path="M70,0 A70,18 0 1,1 69.9,-0.1 Z" />
                </circle>
            </svg>
        </div>
    );
}

function NodeCircle({ node, isDragging, isSelected, onMouseDown, onClick }: {
    node: MemNode; isDragging: boolean; isSelected: boolean;
    onMouseDown: (e: React.MouseEvent) => void; onClick: (e: React.MouseEvent) => void;
}) {
    const lines = node.text.split("\n").filter(Boolean);
    const isRoot = node.id === "brain-root", isCat = node.id.startsWith("cat-");
    const r = isRoot ? NODE_R + 8 : isCat ? catNodeR(node.text) : RULE_NODE_R;
    const depth = node.depth ?? 1, finalScale = (node.scale ?? 1) * (isCat ? (0.6 + 0.4 * depth) : 1), d = r * 2;
    return (
        <div style={{
            left: node.x, top: node.y, transform: `translate(-50%, -50%) scale(${finalScale})`,
            zIndex: isDragging ? 50 : isSelected ? 30 : isCat ? Math.round(depth * 20) + 5 : isRoot ? 25 : 10,
            width: d, height: d, opacity: node.hidden ? 0 : isCat ? (0.65 + 0.35 * depth) : 1,
            transition: "left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease, transform 0.6s cubic-bezier(0.4,0,0.2,1)",
            animation: (!isRoot && !isCat) ? "nodeIn 0.35s ease-out both" : undefined,
            pointerEvents: node.hidden ? "none" : "auto",
        }} className="absolute select-none" onMouseDown={onMouseDown} onClick={onClick}>
            {isSelected && <div className="absolute rounded-full pointer-events-none" style={{ inset: -5, borderRadius: "50%", border: `2px solid ${node.color}`, boxShadow: `0 0 20px ${node.color}60` }} />}
            {(isRoot || isCat) && <div className="absolute rounded-full pointer-events-none" style={{ inset: -6, borderRadius: "50%", background: `radial-gradient(circle, ${node.color}18 0%, transparent 70%)` }} />}
            <div className="relative w-full h-full rounded-full flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                style={{
                    border: `${isRoot ? 2 : 1.5}px solid ${node.color}`,
                    background: `radial-gradient(circle at 38% 32%, ${node.color}${isRoot ? "22" : isCat ? "18" : "12"} 0%, #08090d 65%)`,
                    boxShadow: isSelected ? `0 0 28px ${node.color}95, 0 0 8px ${node.color}70` : isDragging ? `0 0 36px ${node.color}60` : (isRoot || isCat) ? `0 0 18px ${node.color}40` : "none",
                    "--nc": node.color, animation: (isRoot || isCat) ? `nodePulse ${2.5 + (node.id.charCodeAt(0) % 10) * 0.2}s ease-in-out infinite` : "none",
                } as React.CSSProperties}>
                {isCat ? (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: node.color, textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>{node.text}</span>
                ) : (
                    <div className="relative px-1.5 text-center z-10">
                        {lines.map((l, i) => <div key={i} style={{ fontSize: isRoot ? 11 : 8, color: i === 0 ? node.color : "#cbd5e1", fontWeight: i === 0 ? 700 : 400, lineHeight: 1.3 }}>{l}</div>)}
                    </div>
                )}
            </div>
            {isRoot && <PlanetRing r={r} color="#a855f7" tilt={60} duration={8} />}
            {isRoot && <PlanetRing r={r} color="#60a5fa" tilt={72} duration={13} />}
            {isCat && node.ruleCount != null && (
                <div className="absolute flex items-center justify-center rounded-full text-[8px] font-bold tabular-nums"
                    style={{ minWidth: 17, height: 17, padding: "0 4px", top: "8%", right: "8%", transform: "translate(50%, -50%)", background: node.color, color: "#08090d", border: "1.5px solid #08090d", boxShadow: `0 0 6px ${node.color}80`, zIndex: 20 }}>
                    {node.ruleCount}
                </div>
            )}
        </div>
    );
}

function RulePanel({ rule, onClose }: { rule: Rule; onClose: () => void }) {
    const color = CAT_COLORS[rule.category] || "#94a3b8";
    return (
        <div className="absolute left-0 right-0 bottom-0 z-50 flex flex-col"
            style={{ background: "#0f1117", border: `1px solid ${color}40`, height: "40%", borderRadius: 16, margin: 8, boxShadow: `0 0 20px ${color}20` }}
            onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{rule.title}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: `${color}22`, color, textTransform: "uppercase" }}>{rule.category}</span>
                    {rule.created_at && (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{new Date(rule.created_at).toLocaleDateString()}</span>
                    )}
                    <button onClick={onClose} className="text-white/30 hover:text-white transition cursor-pointer ml-auto"><X size={14} /></button>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
                <p style={{ fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap" }}>{rule.instruction}</p>
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BrainSolar() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 1000, h: 600 });
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
    const [expandedCat, setExpandedCat] = useState<string | null>(null);
    const [orbitAngle, setOrbitAngle] = useState(0);
    const orbitAngleRef = useRef(0);
    const orbitAnimRef = useRef<{ from: number; to: number; startTime: number } | null>(null);
    const isRotatingRef = useRef(false);
    const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
    const mouseStartRef = useRef<{ x: number; y: number } | null>(null);
    const didDragRef = useRef(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    const categories = useMemo(() => rules.length > 0 ? [...new Set(rules.map(r => r.category))].sort() : [], [rules]);
    const nodes = useMemo(() => buildOrbitNodes(rules, categories, dims.w, orbitAngle, expandedCat), [rules, categories, dims.w, orbitAngle, expandedCat]);

    useLayoutEffect(() => {
        const el = containerRef.current; if (!el) return;
        const measure = () => { const r = el.getBoundingClientRect(); setDims({ w: r.width, h: r.height }); };
        measure(); const ro = new ResizeObserver(measure); ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        fetch("/api/claude/brain").then(r => r.json()).then(d => {
            setRules(d.globalRules ?? []);
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    useEffect(() => { orbitAngleRef.current = orbitAngle; }, [orbitAngle]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setExpandedCat(null); setSelectedRule(null); } };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const rotateToCat = useCallback((catIndex: number) => {
        const n = categories.length, baseAngle = (2 * Math.PI * catIndex) / n;
        let delta = (FRONT_ANGLE - baseAngle) - orbitAngleRef.current;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        if (Math.abs(delta) < 0.05) return;
        const from = orbitAngleRef.current, to = from + delta;
        isRotatingRef.current = true;
        orbitAnimRef.current = { from, to, startTime: performance.now() };
        const animate = (now: number) => {
            if (!orbitAnimRef.current) return;
            const { from: f, to: t, startTime } = orbitAnimRef.current;
            const progress = Math.min((now - startTime) / 700, 1), ease = 1 - Math.pow(1 - progress, 3);
            setOrbitAngle(f + (t - f) * ease);
            if (progress < 1) requestAnimationFrame(animate);
            else { setOrbitAngle(t); orbitAnimRef.current = null; isRotatingRef.current = false; }
        };
        requestAnimationFrame(animate);
    }, [categories.length]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => { if (!dragRef.current) return; const start = mouseStartRef.current; if (start && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 6) didDragRef.current = true; };
        const onUp = () => { dragRef.current = null; mouseStartRef.current = null; setDraggingId(null); };
        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, []);

    const handleNodeMouseDown = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation(); const node = nodes.find(n => n.id === id); if (!node) return;
        dragRef.current = { id, ox: node.x - e.clientX, oy: node.y - e.clientY };
        mouseStartRef.current = { x: e.clientX, y: e.clientY }; didDragRef.current = false; setDraggingId(id);
    }, [nodes]);

    const handleNodeClick = useCallback((node: MemNode, e: React.MouseEvent) => {
        e.stopPropagation(); if (didDragRef.current) return;
        if (node.id === "brain-root") { setExpandedCat(null); setSelectedRule(null); return; }
        if (node.id.startsWith("cat-")) {
            const catName = node.id.replace("cat-", ""), catIndex = categories.indexOf(catName);
            if (catIndex >= 0) rotateToCat(catIndex);
            setExpandedCat(prev => prev === node.id ? null : node.id); setSelectedRule(null); return;
        }
        const rule = rules.find(r => r.id === node.id);
        if (rule) setSelectedRule(prev => prev?.id === rule.id ? null : rule);
    }, [rules, categories, rotateToCat]);

    return (
        <div className="relative" style={{ height: "calc(100vh - 260px)", minHeight: 400, overflow: "hidden", borderRadius: 12 }}>
            <style>{`
                @keyframes nodePulse { 0%, 100% { box-shadow: 0 0 8px var(--nc); } 50% { box-shadow: 0 0 22px var(--nc), 0 0 6px var(--nc); } }
                @keyframes nodeIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.3); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
            `}</style>

            <div ref={containerRef} className="relative w-full h-full rounded-xl"
                onClick={() => { if (expandedCat) { setExpandedCat(null); setSelectedRule(null); } }}
                style={{ overflow: "hidden", background: "#08090d" }}>
                <Starfield />
                {!expandedCat && <OrbitTrack cx={dims.w / 2} cy={ORBIT_CY} rx={orbitRx(dims.w)} ry={orbitRy(orbitRx(dims.w))} />}
                {nodes.length > 0 && <ConnectionLines nodes={nodes} dims={dims} expandedCat={expandedCat} />}
                {nodes.map(node => (
                    <NodeCircle key={node.id} node={node} isDragging={draggingId === node.id} isSelected={selectedRule?.id === node.id}
                        onMouseDown={e => handleNodeMouseDown(node.id, e)} onClick={e => handleNodeClick(node, e)} />
                ))}
                {!loading && nodes.length > 0 && !selectedRule && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] text-zinc-600 pointer-events-none" style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <ChevronRight size={10} />
                        {expandedCat ? "Click root or press Esc to go back" : "Click a planet to explore"}
                    </div>
                )}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-center gap-2 text-zinc-600 text-xs"><Cloud size={14} className="animate-pulse" style={{ color: "#a855f7" }} />Loading...</div>
                    </div>
                )}
            </div>
            {selectedRule && <RulePanel rule={selectedRule} onClose={() => setSelectedRule(null)} />}
        </div>
    );
}
