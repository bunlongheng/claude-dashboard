"use client";

import { useMemo } from "react";
import { PolarArea } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { TOOLTIP } from "./chartjs";

type Segment = { value: number; color: string; label: string };

// Polar area chart (Chart.js): every segment gets the same angle, the value
// drives the radius. Plotted on a square-root scale so a tier that is 65x
// another still stays visible; the tooltip and legend show the real counts.
export function PolarChart({ segments, size = 130, onSelect }: { segments: Segment[]; size?: number; onSelect?: (label: string) => void }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const data = useMemo(() => ({
        labels: segments.map(s => s.label),
        datasets: [{
            data: segments.map(s => Math.sqrt(s.value)),
            backgroundColor: segments.map(s => `${s.color}B3`),
            hoverBackgroundColor: segments.map(s => s.color),
            borderColor: segments.map(s => s.color),
            borderWidth: 1,
        }],
    }), [segments]);
    const options = useMemo<ChartOptions<"polarArea">>(() => ({
        responsive: false,
        animation: { duration: 700, animateRotate: true, animateScale: true },
        onClick: (_e, els) => { if (onSelect && els[0]) onSelect(segments[els[0].index].label); },
        onHover: (e, els) => { const t = e.native?.target as HTMLElement | null; if (t) t.style.cursor = onSelect && els.length ? "pointer" : "default"; },
        scales: { r: { grid: { color: "rgba(255,255,255,0.07)" }, angleLines: { display: false }, ticks: { display: false }, beginAtZero: true } },
        plugins: {
            legend: { display: false },
            tooltip: { ...TOOLTIP, callbacks: { label: ctx => `${segments[ctx.dataIndex].value.toLocaleString()}` } },
        },
    }), [segments, onSelect]);
    if (total === 0) return null;

    return (
        <div className="flex items-center justify-center gap-4 flex-wrap">
            <PolarArea data={data} options={options} width={size} height={size} aria-label="Tier split" />
            <div className="space-y-1">
                {segments.map(s => {
                    const Row = onSelect ? "button" : "div";
                    return (
                        <Row key={s.label} className="flex items-center gap-2" onClick={onSelect ? () => onSelect(s.label) : undefined}
                            style={onSelect ? { cursor: "pointer", width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", font: "inherit" } : undefined}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: s.color, marginLeft: "auto" }}>{s.value}</span>
                        </Row>
                    );
                })}
            </div>
        </div>
    );
}
