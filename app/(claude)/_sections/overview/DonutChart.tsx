"use client";

import { useEffect, useState } from "react";

// Donut built from stroked circles: each segment is a dash on its own ring,
// so a data change slides the arcs with a CSS transition instead of
// redrawing wedges. On mount the arcs grow in from 0.
export function DonutChart({ segments, size = 120, centerLabel = "TOTAL" }: { segments: { value: number; color: string; label: string }[]; size?: number; centerLabel?: string }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;
    const stroke = size * 0.22;
    const r = (size - stroke) / 2 - 2;
    const cx = size / 2, cy = size / 2;
    const C = 2 * Math.PI * r;

    // Running offset so each dash starts where the previous one ends.
    const arcs = segments.reduce<{ len: number; offset: number }[]>((acc, seg) => {
        const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
        return [...acc, { len: mounted ? (seg.value / total) * C : 0, offset }];
    }, []);

    return (
        <div className="flex items-center justify-center gap-4 flex-wrap">
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
                {segments.map((seg, i) => (
                    <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} opacity={0.75}
                        strokeDasharray={`${arcs[i].len} ${C}`} strokeDashoffset={-arcs[i].offset}
                        style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}>
                        <title>{`${seg.label}: ${seg.value.toLocaleString()}`}</title>
                    </circle>
                ))}
                <g style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px` }}>
                    <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="16" fontWeight="800">{total.toLocaleString()}</text>
                    <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontWeight="600">{centerLabel}</text>
                </g>
            </svg>
            <div className="space-y-1">
                {segments.filter(s => s.value > 0).map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: s.color, marginLeft: "auto" }}>{s.value.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
