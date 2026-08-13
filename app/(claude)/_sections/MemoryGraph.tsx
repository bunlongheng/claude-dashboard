"use client";

import { useMemo, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";

type Pref = { id: number; category: string; key: string; value: string };
export type MemMode = "nothing" | "rag" | "rag_vector" | "rag_vector_kp" | "kp";

// Mermaid palette from prefs — deterministic per-category color so new
// categories still get a stable, distinct hue.
const PALETTE = ["#f59e0b", "#22c55e", "#8b5cf6", "#06b6d4", "#3b82f6", "#ec4899", "#ef4444", "#14b8a6", "#f97316", "#eab308", "#f43f5e", "#84cc16"];
function hueFor(cat: string, fallbackIdx: number, colors: Record<string, string>): string {
    return colors[cat] ?? PALETTE[fallbackIdx % PALETTE.length];
}

const W = 1000, H = 560, CX = W / 2, CY = H / 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // phyllotaxis angle

export default function MemoryGraph({ prefs, colors, mode = "rag" }: { prefs: Pref[]; colors: Record<string, string>; mode?: MemMode }) {
    const [selected, setSelected] = useState<string | null>(null);
    const [hoverCat, setHoverCat] = useState<string | null>(null);
    const [hoverLeaf, setHoverLeaf] = useState<{ x: number; y: number; key: string; value: string } | null>(null);
    const [hoverKey, setHoverKey] = useState<string | null>(null);

    const empty = mode === "nothing";
    const synthesized = mode === "kp" || mode === "rag_vector_kp";

    const cats = useMemo(() => {
        const m = new Map<string, Pref[]>();
        for (const p of prefs) {
            const arr = m.get(p.category); if (arr) arr.push(p); else m.set(p.category, [p]);
        }
        const list = [...m.entries()].map(([name, items]) => ({ name, items, count: items.length }))
            .sort((a, b) => b.count - a.count);
        const maxC = Math.max(1, ...list.map(c => c.count));
        const n = list.length;
        return list.map((c, i) => {
            const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
            const r = 20 + 24 * Math.sqrt(c.count) / Math.sqrt(maxC);
            return { ...c, color: hueFor(c.name, i, colors), x: CX + 350 * Math.cos(a), y: CY + 188 * Math.sin(a), r, idx: i };
        });
    }, [prefs, colors]);

    const sel = selected ? cats.find(c => c.name === selected) ?? null : null;

    // Leaf nodes for the selected category, bloomed around center via phyllotaxis.
    const leaves = useMemo(() => {
        if (!sel) return [];
        const base = Math.min(15, 260 / Math.sqrt(sel.count));
        return sel.items.map((p, i) => {
            const rad = base * Math.sqrt(i + 1);
            const ang = i * GOLDEN;
            return { key: p.key, value: p.value, x: CX + rad * Math.cos(ang), y: CY + rad * Math.sin(ang), r: 3.4 + 4 / Math.sqrt(i + 2) };
        });
    }, [sel]);

    const total = prefs.length;

    // "Nothing" mode = the control: no memory is reachable, only the repo root.
    if (empty) {
        return (
            <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "radial-gradient(110% 80% at 50% 40%, #121016 0%, #0b0b0f 70%)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                    <defs>
                        <pattern id="grid0" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect width={W} height={H} fill="url(#grid0)" />
                    <circle cx={CX} cy={CY} r={48} fill="#16161c" stroke="rgba(255,255,255,0.14)" strokeWidth={1.5} strokeDasharray="4 4" />
                    <foreignObject x={CX - 70} y={CY - 34} width={140} height={68}>
                        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.45)" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em" }}>REPO ROOT</div>
                            <div style={{ fontSize: 9, fontFamily: "ui-monospace,monospace", marginTop: 2 }}>0 memories</div>
                        </div>
                    </foreignObject>
                </svg>
                <div style={{ padding: "0 14px 14px", fontSize: 11, color: "rgba(255,255,255,0.52)", textAlign: "center" }}>
                    Control mode - no memory loaded. Claude starts cold from the project path only.
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "radial-gradient(110% 80% at 50% 40%, #14141c 0%, #0b0b0f 70%)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Category selector — dropdown keeps the page clean instead of bombarding with chips */}
            <div style={{ padding: "12px 14px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ position: "relative", display: "inline-flex" }}>
                    <select value={selected ?? ""}
                        onChange={e => { setSelected(e.target.value || null); setHoverKey(null); setHoverLeaf(null); }}
                        style={{
                            appearance: "none", WebkitAppearance: "none", outline: "none",
                            background: sel ? `${sel.color}1a` : "rgba(255,255,255,0.04)",
                            border: `1px solid ${sel ? sel.color : "rgba(255,255,255,0.12)"}`,
                            color: sel ? sel.color : "#fff",
                            fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                            padding: "9px 36px 9px 14px", borderRadius: 10, cursor: "pointer",
                        }}>
                        <option value="" style={{ background: "#15151c", color: "#fff" }}>All categories ({total})</option>
                        {cats.map(c => (
                            <option key={c.name} value={c.name} style={{ background: "#15151c", color: "#fff" }}>
                                {c.name} ({c.count})
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={15} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: sel ? sel.color : "rgba(255,255,255,0.5)" }} />
                </div>
                {sel && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: sel.color }} />
                        {sel.count} preferences
                    </span>
                )}
            </div>

            <div className="mg-row" style={{ display: "flex", alignItems: "stretch" }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ flex: 1, minWidth: 0, width: "100%", height: "auto", maxHeight: "min(560px, 62vh)", display: "block" }}>
                <defs>
                    <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ff9500" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#ff9500" stopOpacity="0" />
                    </radialGradient>
                    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" />
                    </filter>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width={W} height={H} fill="url(#grid)" />

                {/* ===== Constellation (no category selected) ===== */}
                <g style={{ opacity: sel ? 0 : 1, transition: "opacity .35s", pointerEvents: sel ? "none" : "auto" }}>
                    {cats.map(c => {
                        const dim = hoverCat && hoverCat !== c.name;
                        return (
                            <line key={`l-${c.name}`} x1={CX} y1={CY} x2={c.x} y2={c.y}
                                stroke={c.color} strokeWidth={1 + (c.r - 22) / 12}
                                strokeOpacity={dim ? 0.08 : 0.32} style={{ transition: "stroke-opacity .2s" }} />
                        );
                    })}
                    {/* Hub */}
                    <circle cx={CX} cy={CY} r={100} fill="url(#hubGlow)" />
                    <circle cx={CX} cy={CY} r={46} fill="#1a160c" stroke="#ff9500" strokeWidth={2} />
                    <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: "mg-pulse 3.5s ease-in-out infinite" }}>
                        <circle cx={CX} cy={CY} r={46} fill="none" stroke="#ff9500" strokeWidth={1} strokeOpacity={0.4} />
                    </g>
                    <foreignObject x={CX - 60} y={CY - 30} width={120} height={64}>
                        <div style={{ textAlign: "center", color: "#ff9500" }}>
                            <Brain size={18} style={{ margin: "0 auto" }} />
                            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", marginTop: 1 }}>MEMORY</div>
                            <div style={{ fontSize: 10, fontFamily: "ui-monospace,monospace", color: "rgba(255,255,255,0.45)" }}>{total}</div>
                            {synthesized && <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", marginTop: 2, color: "#8b5cf6", border: "1px solid #8b5cf6", borderRadius: 10, padding: "0 5px", display: "inline-block" }}>SYNTHESIZED</div>}
                        </div>
                    </foreignObject>

                    {/* Category nodes */}
                    {cats.map(c => {
                        const dim = hoverCat && hoverCat !== c.name;
                        return (
                            <g key={c.name} onClick={() => setSelected(c.name)}
                                onMouseEnter={() => setHoverCat(c.name)} onMouseLeave={() => setHoverCat(null)}
                                style={{ cursor: "pointer", opacity: dim ? 0.35 : 1, transition: "opacity .2s", animation: `mg-in .5s ${0.04 * c.idx}s both` }}>
                                <circle cx={c.x} cy={c.y} r={c.r + 6} fill={c.color} opacity={0.12} filter="url(#soft)" />
                                <circle cx={c.x} cy={c.y} r={c.r} fill="#0e0e14" stroke={c.color} strokeWidth={2} />
                                <circle cx={c.x} cy={c.y} r={c.r} fill={c.color} opacity={hoverCat === c.name ? 0.18 : 0.07} style={{ transition: "opacity .2s" }} />
                                {/* count sits inside the node; the name rides just below so long labels never clip */}
                                <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize={13} fontWeight={800}
                                    fill={c.color} fontFamily="ui-monospace,monospace">{c.count}</text>
                                <text x={c.x} y={c.y + c.r + 13} textAnchor="middle" fontSize={11} fontWeight={800}
                                    fill="#fff" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.name}</text>
                            </g>
                        );
                    })}
                </g>

                {/* ===== Bloom (a category is selected) ===== */}
                {sel && (
                    <g style={{ animation: "mg-fade .35s both" }}>
                        {leaves.map((lf, i) => (
                            <line key={`ll-${i}`} x1={CX} y1={CY} x2={lf.x} y2={lf.y} stroke={sel.color} strokeOpacity={0.06} strokeWidth={0.6} />
                        ))}
                        {leaves.map((lf, i) => {
                            const lit = hoverLeaf?.key === lf.key || hoverKey === lf.key;
                            return (
                                <circle key={`ln-${i}`} cx={lf.x} cy={lf.y} r={lit ? lf.r + 2.5 : lf.r} fill={sel.color}
                                    fillOpacity={lit ? 1 : (hoverKey || hoverLeaf ? 0.28 : 0.66)}
                                    stroke={lit ? "#fff" : "none"} strokeWidth={1}
                                    onMouseEnter={() => setHoverLeaf(lf)} onMouseLeave={() => setHoverLeaf(null)}
                                    style={{ cursor: "pointer", transition: "fill-opacity .15s, r .15s", animation: `mg-pop .4s ${Math.min(0.5, 0.004 * i)}s both` }} />
                            );
                        })}
                        {/* center node */}
                        <circle cx={CX} cy={CY} r={150} fill={sel.color} opacity={0.06} />
                        <circle cx={CX} cy={CY} r={34} fill="#0e0e14" stroke={sel.color} strokeWidth={2} />
                        <text x={CX} y={CY + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill={sel.color} fontFamily="ui-monospace,monospace">{sel.count}</text>
                        <text x={CX} y={CY + 34 + 15} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{sel.name}</text>

                        {/* tooltip */}
                        {hoverLeaf && (() => {
                            const tw = 250, th = 58;
                            const tx = Math.max(8, Math.min(W - tw - 8, hoverLeaf.x + 10));
                            const ty = Math.max(8, Math.min(H - th - 8, hoverLeaf.y - th - 6));
                            return (
                                <foreignObject x={tx} y={ty} width={tw} height={th} style={{ pointerEvents: "none" }}>
                                    <div style={{ background: "rgba(10,10,14,0.96)", border: `1px solid ${sel.color}`, borderRadius: 8, padding: "6px 9px" }}>
                                        <div style={{ fontSize: 10, fontWeight: 800, color: sel.color, fontFamily: "ui-monospace,monospace", marginBottom: 2 }}>{hoverLeaf.key}</div>
                                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{hoverLeaf.value}</div>
                                    </div>
                                </foreignObject>
                            );
                        })()}
                    </g>
                )}
            </svg>

            {/* Linked index panel — readable list of the bloomed preferences */}
            {sel && (
                <aside className="mg-aside" style={{ flex: "0 0 300px", maxWidth: 300, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", maxHeight: 600 }}>
                    <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: sel.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{sel.name}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>{sel.count} preferences</div>
                    </div>
                    <div style={{ overflowY: "auto", padding: "4px 0" }}>
                        {sel.items.map(p => {
                            const lit = hoverKey === p.key || hoverLeaf?.key === p.key;
                            return (
                                <div key={p.key} onMouseEnter={() => setHoverKey(p.key)} onMouseLeave={() => setHoverKey(null)}
                                    style={{ padding: "6px 14px", cursor: "default", background: lit ? `${sel.color}1a` : "transparent", borderLeft: `2px solid ${lit ? sel.color : "transparent"}`, transition: "background .12s" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: lit ? sel.color : "rgba(255,255,255,0.78)", fontFamily: "ui-monospace,monospace" }}>{p.key}</div>
                                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", lineHeight: 1.35, marginTop: 1, display: "-webkit-box", WebkitLineClamp: lit ? 4 : 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.value}</div>
                                </div>
                            );
                        })}
                    </div>
                </aside>
            )}
            </div>

            <div style={{ padding: "0 14px 12px", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                {sel ? `Hover a node to read the preference - ${sel.count} in "${sel.name}"` : "Click a category node to bloom its preferences"}
            </div>

            <style>{`
                @keyframes mg-pulse { 0%,100%{ transform:scale(1); opacity:.4 } 50%{ transform:scale(1.25); opacity:0 } }
                @keyframes mg-in { from{ opacity:0 } to{ opacity:1 } }
                @keyframes mg-pop { from{ opacity:0 } to{ opacity:1 } }
                @keyframes mg-fade { from{ opacity:0 } to{ opacity:1 } }
                @media (max-width: 680px) {
                    .mg-row { flex-direction: column !important; }
                    .mg-aside { flex: 1 1 auto !important; max-width: 100% !important; border-left: none !important; border-top: 1px solid rgba(255,255,255,0.06) !important; max-height: 320px !important; }
                }
            `}</style>
        </div>
    );
}
