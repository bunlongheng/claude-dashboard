"use client";

import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { TOOLTIP } from "./chartjs";

type Segment = { value: number; color: string; label: string };

// Doughnut (Chart.js): grows in on mount and tweens the arcs when the data
// changes. The total sits in the hole as plain HTML over the canvas.
export function DonutChart({ segments, size = 120, centerLabel = "TOTAL" }: { segments: Segment[]; size?: number; centerLabel?: string }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const data = useMemo(() => ({
        labels: segments.map(s => s.label),
        datasets: [{
            data: segments.map(s => s.value),
            backgroundColor: segments.map(s => `${s.color}BF`),
            hoverBackgroundColor: segments.map(s => s.color),
            borderColor: "#08090d",
            borderWidth: 2,
        }],
    }), [segments]);
    const options = useMemo<ChartOptions<"doughnut">>(() => ({
        responsive: false,
        cutout: "58%",
        animation: { duration: 700, animateRotate: true, animateScale: false },
        plugins: {
            legend: { display: false },
            tooltip: { ...TOOLTIP, callbacks: { label: ctx => `${segments[ctx.dataIndex].value.toLocaleString()}` } },
        },
    }), [segments]);
    if (total === 0) return null;

    return (
        <div className="flex items-center justify-center gap-4 flex-wrap">
            <div style={{ position: "relative", width: size, height: size }}>
                <Doughnut data={data} options={options} width={size} height={size} aria-label={`${centerLabel} ${total}`} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{total.toLocaleString()}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{centerLabel}</span>
                </div>
            </div>
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
