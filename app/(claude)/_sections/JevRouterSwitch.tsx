"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cardShell } from "@/lib/ui-tokens";
// Type-only: jev-log reads files, so a value import would pull fs into the bundle.
import type { JevTier } from "@/lib/jev-log";
import type { JevRouterState } from "@/lib/jev-router-state";
import { safeFetch } from "./shared";
import { useMachine } from "./MachineContext";

// Same ladder palette as JevCharts, so the forced tier reads as the same color
// it has in the split donut and the message pills.
const TIER_COLORS: Record<JevTier, string> = {
    haiku: "#22C55E",
    sonnet: "#4A9EFF",
    opus: "#A855F7",
    fable: "#F97316",
};
const TIERS = Object.keys(TIER_COLORS) as JevTier[];
const ON_COLOR = "#22C55E";
const MONO = "ui-monospace, monospace";

// The router's on/off switch. On = Jev picks a tier per prompt. Off = every
// prompt is pinned to 1 tier and the session never delegates down. The hook
// reads the state file on each prompt, so a flip lands on the next message.
export default function JevRouterSwitch({ initial }: { initial: JevRouterState }) {
    const { machine, apiBase } = useMachine();
    const qc = useQueryClient();
    const key = ["jev-router", machine];
    const [saving, setSaving] = useState(false);
    // Remembered so flipping off comes back to the tier you last forced.
    const [lastTier, setLastTier] = useState<JevTier>(initial.force ?? "fable");

    const { data } = useQuery<JevRouterState>({
        queryKey: key,
        queryFn: () => safeFetch<JevRouterState>(apiBase("/api/claude/jev/router"), initial),
        initialData: initial,
    });
    const state = data ?? initial;
    const on = state.force === null;
    const accent = on ? ON_COLOR : TIER_COLORS[state.force ?? "fable"];

    async function write(force: JevTier | null) {
        setSaving(true);
        try {
            const res = await fetch(apiBase("/api/claude/jev/router"), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force }),
            });
            if (res.ok) {
                const next = (await res.json()) as JevRouterState;
                qc.setQueryData(key, next);
                if (next.force) setLastTier(next.force);
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ ...cardShell, padding: "14px 20px", borderColor: `${accent}33`, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <style>{`@keyframes jevSwitchGlow { 0%,100% { box-shadow: 0 0 0 0 ${accent}55 } 50% { box-shadow: 0 0 0 6px ${accent}00 } }`}</style>

            {/* Switch */}
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label="Jev router"
                disabled={saving}
                onClick={() => write(on ? lastTier : null)}
                style={{
                    position: "relative", width: 46, height: 26, borderRadius: 999, border: "none",
                    background: on ? `${ON_COLOR}33` : `${accent}22`,
                    boxShadow: `inset 0 0 0 1px ${accent}66`,
                    cursor: saving ? "wait" : "pointer", padding: 0, flexShrink: 0,
                    transition: "background 0.2s",
                }}
            >
                <span style={{
                    position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%",
                    background: accent, transition: "left 0.2s cubic-bezier(.4,0,.2,1)",
                    animation: "jevSwitchGlow 2.4s ease-in-out infinite",
                }} />
            </button>

            {/* Label */}
            <div style={{ minWidth: 150 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
                    Jev router
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 2 }}>
                    {on ? "Jev decides" : `Forced: ${state.force}`}
                </div>
            </div>

            {/* Tier picker - only when forced */}
            {!on && (
                <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {TIERS.map(t => {
                        const active = state.force === t;
                        return (
                            <button
                                key={t}
                                type="button"
                                disabled={saving}
                                onClick={() => write(t)}
                                style={{
                                    padding: "4px 11px", borderRadius: 999, border: "none", cursor: "pointer",
                                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                    background: active ? `${TIER_COLORS[t]}2E` : "transparent",
                                    color: active ? TIER_COLORS[t] : "rgba(255,255,255,0.4)",
                                    transition: "background 0.15s, color 0.15s",
                                }}
                            >
                                {t}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* What the session runs on */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 22, flexWrap: "wrap" }}>
                <Readout label="Per prompt" value={on ? "haiku > sonnet > opus > fable" : state.force ?? ""} color={on ? undefined : accent} />
                <Readout label="Main thread" value={state.mainModel} />
                <Readout label="Subagents" value={on ? state.subagentModel : state.force ?? ""} color={on ? undefined : accent} />
            </div>
        </div>
    );
}

function Readout({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{label}</div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: color ?? "rgba(255,255,255,0.7)", marginTop: 2 }}>{value}</div>
        </div>
    );
}
