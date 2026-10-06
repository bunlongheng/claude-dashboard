"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cardShell } from "@/lib/ui-tokens";
import { useMachine } from "../MachineContext";
import { safeFetch, WindowBadge, type Window4 } from "../shared";
import { PolarChart } from "./PolarChart";
import JevMark, { JEV_PINK } from "../JevMark";
// Type-only: jev-log reads files, so a value import would pull fs into the bundle.
import type { JevPayload } from "@/lib/jev-log";
import { TIER_ORDER, TIER_COLORS, HEALTH_STYLE } from "@/lib/jev-palette";
import { formatUsd } from "@/lib/format";

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{ textAlign: "center", minWidth: 0, padding: "6px 4px", borderRadius: 8, background: `${color}14`, border: `1px solid ${color}33` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{label}</div>
        </div>
    );
}

// Days the Jev API is asked for per Overview window. "all" is capped by the
// route at 365.
const JEV_DAYS: Record<Window4, number> = { today: 1, "7d": 7, "30d": 30, all: 365 };

// The Jev router in the Overview window: tier donut plus the 3 numbers that
// say whether the hook is earning its keep. Drills into /jev for the rest.
export function JevCard({ win }: { win: Window4 }) {
    const { apiBase } = useMachine();
    const router = useRouter();
    const days = JEV_DAYS[win];
    const url = `${apiBase("/api/claude/jev")}?days=${days}`;
    const q = useQuery<JevPayload | null>({
        queryKey: ["overview-jev", url],
        queryFn: () => safeFetch<JevPayload | null>(url, null),
        refetchInterval: 60_000,
    });
    const data = q.data ?? null;
    const health = data ? HEALTH_STYLE[data.health] : HEALTH_STYLE.never;
    const segments = data ? TIER_ORDER.map(t => ({ label: t, color: TIER_COLORS[t], value: data.tiers[t] ?? 0 })) : [];
    const routed = segments.reduce((s, x) => s + x.value, 0);
    const t = data?.totals;
    const cost = t ? formatUsd(t.estCostUsd) : "-";
    // Per-day view of the window: 1 bar per day that had calls, routed share in pink.
    const dayCalls = (data?.daily ?? []).map(d => ({ day: d.day, calls: d.routed + d.skipped + d.errors, routed: d.routed }));
    const maxCalls = Math.max(1, ...dayCalls.map(d => d.calls));
    const dayCount = Math.max(1, dayCalls.length);
    const callsPerDay = t ? Math.round(t.calls / dayCount) : 0;
    const costPerDay = t ? formatUsd(t.estCostUsd / dayCount) : "-";

    return (
        <div style={{ ...cardShell, display: "flex", flexDirection: "column" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 8 }}>
                <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: JEV_PINK, margin: 0 }}><JevMark size={14} />Jev Router {routed > 0 ? <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{routed}</span> : null}
                    {/* Health dot only - the label lives in the tooltip and aria-label */}
                    <Link href="/jev" aria-label={health.label} title={health.label} style={{ display: "inline-flex", width: 6, height: 6, borderRadius: 999, background: health.color, boxShadow: `0 0 8px ${health.color}` }} />
                </p>
                <WindowBadge win={win} />
            </div>
            {routed > 0 && t ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120, padding: "8px 0" }}>
                        <PolarChart segments={segments} size={156} onSelect={tier => router.push(`/jev?days=${days}&tier=${tier}#tier-split`)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28, marginTop: 10 }} aria-label="Jev calls per day">
                        {dayCalls.map(d => (
                            <div key={d.day} title={`${d.day} - ${d.calls} calls, ${d.routed} routed`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                                <div style={{ height: `${Math.max(4, (d.calls / maxCalls) * 100)}%`, borderRadius: 2, background: "rgba(255,255,255,0.12)", position: "relative", overflow: "hidden" }}>
                                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${d.calls ? (d.routed / d.calls) * 100 : 0}%`, background: JEV_PINK }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-3" style={{ gap: 8, marginTop: 8 }}>
                        <Stat label="Routed" value={`${Math.round(t.routedPct)}%`} color="#22C55E" />
                        <Stat label="Avg ms" value={String(Math.round(t.avgLatencyMs))} color="#4A9EFF" />
                        <Stat label="Cost" value={cost} color="#F97316" />
                    </div>
                    <div className="grid grid-cols-2" style={{ gap: 8, marginTop: 8 }}>
                        <Stat label="Calls / day" value={String(callsPerDay)} color={JEV_PINK} />
                        <Stat label="Cost / day" value={costPerDay} color="#F97316" />
                    </div>
                </div>
            ) : (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                    {q.isPending ? "Loading" : "No routed prompts in this window."} <Link href="/jev" style={{ color: "rgba(255,255,255,0.7)" }}>Open Jev</Link>
                </p>
            )}
        </div>
    );
}
