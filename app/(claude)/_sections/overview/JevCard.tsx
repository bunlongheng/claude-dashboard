"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cardShell } from "@/lib/ui-tokens";
import { useMachine } from "../MachineContext";
import { safeFetch } from "../shared";
import { PolarChart } from "./PolarChart";
import JevMark, { JEV_PINK } from "../JevMark";
// Type-only: jev-log reads files, so a value import would pull fs into the bundle.
import type { JevPayload } from "@/lib/jev-log";

// Same palette as the /jev page so a tier reads the same color everywhere.
const TIERS: { key: "haiku" | "sonnet" | "opus" | "fable"; color: string }[] = [
    { key: "haiku", color: "#22C55E" },
    { key: "sonnet", color: "#4A9EFF" },
    { key: "opus", color: "#A855F7" },
    { key: "fable", color: "#F97316" },
];
const HEALTH: Record<JevPayload["health"], { color: string; label: string }> = {
    live: { color: "#22C55E", label: "LIVE" },
    stale: { color: "#E8A23B", label: "STALE" },
    never: { color: "#6B7280", label: "NEVER" },
};

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{ textAlign: "center", minWidth: 0, padding: "6px 4px", borderRadius: 8, background: `${color}14`, border: `1px solid ${color}33` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{label}</div>
        </div>
    );
}

// Last 7 days of the Jev router: tier donut plus the 3 numbers that say
// whether the hook is earning its keep. Drills into /jev for the rest.
export function JevCard() {
    const { apiBase } = useMachine();
    const router = useRouter();
    const url = `${apiBase("/api/claude/jev")}?days=7`;
    const q = useQuery<JevPayload | null>({
        queryKey: ["overview-jev", url],
        queryFn: () => safeFetch<JevPayload | null>(url, null),
        refetchInterval: 60_000,
    });
    const data = q.data ?? null;
    const health = data ? HEALTH[data.health] : HEALTH.never;
    const segments = data ? TIERS.map(t => ({ label: t.key, color: t.color, value: data.tiers[t.key] ?? 0 })) : [];
    const routed = segments.reduce((s, x) => s + x.value, 0);
    const t = data?.totals;
    const cost = t ? (t.estCostUsd < 0.01 ? `${(t.estCostUsd * 100).toFixed(2)}c` : `$${t.estCostUsd.toFixed(2)}`) : "-";

    return (
        <div style={{ ...cardShell, display: "flex", flexDirection: "column" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 8 }}>
                <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: JEV_PINK, margin: 0 }}><JevMark size={14} />Jev Router <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>7d{routed > 0 ? ` \u00b7 ${routed}` : ""}</span></p>
                <Link href="/jev" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: health.color, textDecoration: "none" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: health.color, boxShadow: `0 0 8px ${health.color}` }} />
                    {health.label}
                </Link>
            </div>
            {routed > 0 && t ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120, padding: "8px 0" }}>
                        <PolarChart segments={segments} size={156} onSelect={tier => router.push(`/jev?days=7&tier=${tier}#tier-split`)} />
                    </div>
                    <div className="grid grid-cols-3" style={{ gap: 8, marginTop: 8 }}>
                        <Stat label="Routed" value={`${Math.round(t.routedPct)}%`} color="#22C55E" />
                        <Stat label="Avg ms" value={String(Math.round(t.avgLatencyMs))} color="#4A9EFF" />
                        <Stat label="Cost" value={cost} color="#F97316" />
                    </div>
                </div>
            ) : (
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                    {q.isPending ? "Loading" : "No routed prompts in the last 7 days."} <Link href="/jev" style={{ color: "rgba(255,255,255,0.7)" }}>Open Jev</Link>
                </p>
            )}
        </div>
    );
}
