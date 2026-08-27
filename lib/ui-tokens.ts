import type { CSSProperties } from "react";

// ── Card shell ──────────────────────────────────────────────────────────
// The standard "panel" look used across the dashboard: subtle raised
// background, hairline border, rounded corners. Single source of truth so
// a theme change is a one-line edit instead of a ~36-site find/replace.
const CARD_BG = "rgba(255,255,255,0.02)";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const CARD_RADIUS = 14;

export const cardShell: CSSProperties = {
    padding: "20px 24px",
    borderRadius: CARD_RADIUS,
    background: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
};

// ── Heatmap intensity ramp ──────────────────────────────────────────────
// Single source for the white-alpha ramp used by activity heatmaps.
// Callers normalize their own raw value into a 0..1 intensity (their
// "max" divisor can differ - e.g. maxTurns * 0.6 vs maxHour * 0.7 - that
// per-call scaling is intentionally left to the caller) and pass it here.
export function heatRamp(intensity: number): string {
    if (intensity <= 0) return "rgba(255,255,255,0.04)";
    if (intensity < 0.25) return "rgba(255,255,255,0.15)";
    if (intensity < 0.5) return "rgba(255,255,255,0.35)";
    if (intensity < 0.75) return "rgba(255,255,255,0.6)";
    return "rgba(255,255,255,0.9)";
}
