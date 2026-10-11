"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cardShell } from "@/lib/ui-tokens";
// Type-only: jev-log reads files, so a value import would pull fs into the bundle.
import type { JevTier } from "@/lib/jev-log";
import type { JevRouterState } from "@/lib/jev-router-state";
import { safeFetch, timeAgo } from "./shared";
import { useMachine } from "./MachineContext";
import { JEV_PINK } from "./JevMark";

const ON_COLOR = "#22C55E";
const OFF_COLOR = "#6B7280";
const PINKS = [JEV_PINK, "#F472B6", "#EC4899", "#FBCFE8", "#DB2777", "#FF8AD8"];
type Piece = { left: number; delay: number; dur: number; size: number; spin: number; drift: number; color: string };

// Switching Jev on throws 5 s of pink confetti and flashes the page pink twice in the first 2 s.
function makeParty(): Piece[] {
    return Array.from({ length: 140 }, (_, i) => ({
        left: Math.random() * 100, delay: Math.random() * 1.6, dur: 2.4 + Math.random() * 1.2,
        size: 5 + Math.random() * 6, spin: Math.random() * 1080 - 540, drift: Math.random() * 160 - 80,
        color: PINKS[i % PINKS.length],
    }));
}

// The router's on/off switch. On = Jev picks a tier per prompt. Off = every
// prompt is pinned to 1 tier and the session never delegates down. The hook
// reads the state file on each prompt, so a flip lands on the next message.
// bare = no card shell, for the page hero slot.
export default function JevRouterSwitch({ initial, bare = false, offSince = null }: { initial: JevRouterState; bare?: boolean; offSince?: string | null }) {
    const { machine, apiBase } = useMachine();
    const qc = useQueryClient();
    const key = ["jev-router", machine];
    const [saving, setSaving] = useState(false);
    // Remembered so flipping off comes back to the tier you last forced.
    const [lastTier, setLastTier] = useState<JevTier>(initial.force ?? "fable");
    const [party, setParty] = useState<Piece[] | null>(null);

    const { data } = useQuery<JevRouterState>({
        queryKey: key,
        queryFn: () => safeFetch<JevRouterState>(apiBase("/api/claude/jev/router"), initial),
        initialData: initial,
    });
    const state = data ?? initial;
    const on = state.force === null;
    const accent = on ? ON_COLOR : OFF_COLOR;

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
                // The flip is logged, so the page's on/off cards refresh straight away.
                qc.invalidateQueries({ queryKey: ["jev", machine] });
                if (next.force) setLastTier(next.force);
                else { setParty(makeParty()); setTimeout(() => setParty(null), 5000); }
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={bare
            ? { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }
            : { ...cardShell, padding: "14px 20px", borderColor: `${accent}33`, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <style>{`@keyframes jevSwitchGlow { 0%,100% { box-shadow: 0 0 0 0 ${accent}55 } 50% { box-shadow: 0 0 0 6px ${accent}00 } }
@keyframes jevFlash { 0%,100% { opacity: 0 } 50% { opacity: 1 } }
@keyframes jevFall { 0% { transform: translate(0,-5vh) rotate(0deg); opacity: 1 } 85% { opacity: 1 } 100% { transform: translate(var(--dx),105vh) rotate(var(--spin)); opacity: 0 } }`}</style>
            {party && createPortal(
                <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 40%, ${JEV_PINK}55, ${JEV_PINK}22 70%)`, opacity: 0, animation: "jevFlash 1s ease-in-out 2" }} />
                    {party.map((p, i) => (
                        <span key={i} style={{
                            position: "absolute", top: 0, left: `${p.left}%`, width: p.size, height: p.size * 0.6, borderRadius: 1, background: p.color,
                            animation: `jevFall ${p.dur}s cubic-bezier(.25,.46,.45,.94) ${p.delay}s both`,
                            "--dx": `${p.drift}px`, "--spin": `${p.spin}deg`,
                        } as React.CSSProperties} />
                    ))}
                </div>,
                document.body,
            )}

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
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                <b style={{ color: accent, fontWeight: 800, letterSpacing: "0.08em" }}>{on ? "ON" : "OFF"}</b>
                {on ? " - Jev picks a tier per prompt"
                    : <>{offSince && <> since <b style={{ color: "#fff" }}>{new Date(offSince).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b> ({timeAgo(offSince)})</>}{state.force && <> - pinned to {state.force}</>}</>}
            </span>
        </div>
    );
}
