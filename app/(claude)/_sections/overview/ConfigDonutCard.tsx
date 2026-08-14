"use client";

import { cardShell } from "@/lib/ui-tokens";
import { DonutChart } from "./DonutChart";

// Config donut - content vertically centered so it fills the card height
// (matches the taller siblings) and stays responsive.
export function ConfigDonutCard({ segments }: { segments: { value: number; color: string; label: string }[] }) {
    return (
        <div style={{ ...cardShell, display: "flex", flexDirection: "column" }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>Configuration</p>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                <DonutChart segments={segments} size={156} />
            </div>
        </div>
    );
}
