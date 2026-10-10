"use client";

import { useEffect, useRef } from "react";
import { getModelRates } from "@/lib/pricing";
import { SECTION_COLORS } from "./sectionColors";

export const ACCENT = SECTION_COLORS.claude;

// ─── Types ───────────────────────────────────────────────────────────────────
export type HistoryEntry = { display: string; timestamp: number; project?: string; sessionId?: string };
export type Token = { session_id: string; project?: string; model?: string; machine?: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; prompt_count: number };
// Not the same union as Window4 below - this one has "1m" instead of "30d".
type Interval = "today" | "7d" | "1m" | "all";

export type SessionEntry = { id: string; filePath: string; sizeBytes: number; sizeLabel: string; lines: number; customTitle: string | null; title: string; createdAt: string; updatedAt: string; stale: boolean; live?: boolean };
export type ProjectSessions = { project: string; path: string; sessions: SessionEntry[] };

// ─── Tab color palette ───────────────────────────────────────────────────────
export const TAB_PALETTE = ["#f97316","#22c55e","#eab308","#3b82f6","#ef4444","#f97316","#ec4899","#06b6d4","#14b8a6","#f59e0b","#84cc16","#f97316"];
export function tabColor(sessionId: string): string {
    let h = 0;
    for (let i = 0; i < sessionId.length; i++) h = Math.imul(31, h) + sessionId.charCodeAt(i) | 0;
    return TAB_PALETTE[Math.abs(h) % TAB_PALETTE.length];
}

// ─── Machines ────────────────────────────────────────────────────────────────
// Static fallback - overridden by dynamic machine list from /api/claude/machines
export const MACHINES: string[] = [];
export const MACHINE_COLORS: Record<string, string> = {};
// Color palette for dynamic machines
export const MACHINE_COLOR_PALETTE = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#f59e0b", "#10b981"];
export const MACHINE_META: Record<string, { hostname: string; ip?: string }> = {};
export function machineLabel(key: string): string {
    const meta = MACHINE_META[key];
    if (!meta) return key;
    if (meta.hostname && meta.hostname !== "Unknown") return meta.hostname;
    if (meta.ip) return meta.ip;
    return key;
}

export function MachineFilter({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
    const pills: { label: string; val: string | null }[] = [
        { label: "All", val: null },
        ...MACHINES.map(m => ({ label: m, val: m })),
    ];
    return (
        <div className="flex gap-1.5 mb-4">
            {pills.map(({ label, val }) => {
                const active = value === val;
                const color = val ? MACHINE_COLORS[val] : ACCENT;
                return (
                    <button key={label} onClick={() => onChange(val)}
                        className="px-2 py-1 rounded-md text-[10px] font-bold transition-colors"
                        style={{
                            background: active ? `${color}20` : "rgba(255,255,255,0.04)",
                            border: `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                            color: active ? color : "rgba(255,255,255,0.52)",
                        }}>{label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Pricing (rates live in lib/pricing.ts - single source of truth) ─────────
export function calcCost(t: Token) {
    const p = getModelRates(t.model);
    return (
        (t.input_tokens            / 1_000_000) * p.input +
        (t.output_tokens           / 1_000_000) * p.output +
        (t.cache_read_tokens       / 1_000_000) * p.cache_read +
        (t.cache_creation_tokens   / 1_000_000) * p.cache_write_5m
    );
}
export function fmtCost(usd: number) { return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`; }

/** Safe fetch - checks r.ok before parsing JSON, returns fallback on error.
 * Times out after 15s so a hanging endpoint doesn't strand the page on
 * "Loading dashboard...". Tolerates AbortController not being available.
 * Pass onError to SURFACE the failure (e.g. a "data unavailable" banner) so a
 * failed load is not silently rendered as real zeros - the fallback is still
 * returned for layout, but the caller learns the value is not trustworthy. */
export async function safeFetch<T>(url: string, fallback: T, onError?: () => void): Promise<T> {
    try {
        const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout
            ? AbortSignal.timeout(15000)
            : undefined;
        const r = await fetch(url, signal ? { signal } : undefined);
        if (!r.ok) { onError?.(); return fallback; }
        return await r.json();
    } catch { onError?.(); return fallback; }
}
/** Like safeFetch but throws on a non-2xx or network failure so react-query's
 * isError is set and the section can render <FetchError> instead of the
 * "No ... found" empty state. */
export async function fetchJson<T>(url: string): Promise<T> {
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? AbortSignal.timeout(15000)
        : undefined;
    const r = await fetch(url, signal ? { signal } : undefined);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
}
/** Error state for a failed section fetch - same banner as the Overview one. */
export function FetchError({ what, onRetry }: { what: string; onRetry: () => void }) {
    return (
        <div role="alert" style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5", fontSize: 12, fontWeight: 600,
        }}>
            <span>Could not load {what}.</span>
            <button type="button" onClick={onRetry} style={{
                marginLeft: "auto", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>Retry</button>
        </div>
    );
}
/** Dialog behaviour for the modal overlays: Escape closes, focus moves into
 * the panel on open and returns to the opener on close. Spread the returned
 * props onto the panel element (the one that stops click propagation). */
export function useDialog(onClose: () => void, labelId: string, open = true) {
    const ref = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    useEffect(() => { close.current = onClose; });
    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const el = ref.current;
        const first = el?.querySelector<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])");
        (first ?? el)?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close.current(); } };
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
    }, [open]);
    return { ref, role: "dialog" as const, "aria-modal": true as const, "aria-labelledby": labelId, tabIndex: -1 };
}
export function fmtNum(n: number)    { return n >= 1_000_000_000 ? `${(n/1_000_000_000).toFixed(1)}B` : n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }
// Compact, uppercase suffix (930K / 1.2M / 3.4B) - used for token counts so the
// dashboard card and the nav badge render identically from the same source.
export function fmtCompact(n: number) {
    if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n/1000)}K`;
    return String(n);
}
export function hexToRgba(hex: string, alpha: number) {
    const raw = hex.replace("#", "");
    const r = parseInt(raw.slice(0,2),16), g = parseInt(raw.slice(2,4),16), b = parseInt(raw.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Accepts an epoch-ms number, an ISO string, or a Date - the one relative-time
// formatter for the whole app (was duplicated in 3 components).
export function timeAgo(ts: number | string | Date) {
    const ms = typeof ts === "number" ? ts : new Date(ts).getTime();
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
}
export function fmtTs(ts: number) {
    return new Date(ts).toLocaleString("en-US", {
        timeZone: "America/New_York", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
    });
}
export function filterByInterval(entries: HistoryEntry[], interval: Interval) {
    const now = Date.now();
    if (interval === "today") { const s = new Date(); s.setHours(0,0,0,0); return entries.filter(e => e.timestamp >= s.getTime()); }
    if (interval === "7d") return entries.filter(e => e.timestamp >= now - 7*86400_000);
    if (interval === "1m") return entries.filter(e => e.timestamp >= now - 30*86400_000);
    return entries;
}
export function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const t of arr) { const k = key(t); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); }
    return m;
}

// ─── Shared UI components ─────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = ACCENT, onClick }: {
    label: string; value: string | number; sub?: string; color?: string; onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-[#0f1117] border border-white/[0.08] rounded-xl p-3 text-left w-full transition-all hover:border-white/[0.15] active:scale-[0.98] group"
        >
            <p className="text-[10px] font-semibold tracking-wide text-white/40 uppercase mb-1 flex items-center justify-between">
                {label}
                <span className="text-[9px] text-white/20 group-hover:text-white/40 transition-colors">↗</span>
            </p>
            <p className="text-xl font-bold leading-none" style={{ color }}>{value}</p>
            {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
        </button>
    );
}

export function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
            <Icon className="w-3 h-3" style={{ color: ACCENT, flexShrink: 0 }} />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", lineHeight: 1 }}>{title}</span>
        </div>
    );
}

// Segmented pill tabs - matches the [24h | 7d | 30d | ALL] control style.
// Used wherever the user toggles between mutually-exclusive views.
const SEGMENT_ACTIVE = "#f97316";
// The 3 standard time windows every usage card offers, in this order. No "All":
// Claude Code purges transcripts after 30 days (cleanupPeriodDays), so 30d is all there is.
export type Window4 = "today" | "7d" | "30d";
export const WINDOW_TABS: { key: Window4; label: string }[] = [{ key: "today", label: "Today" }, { key: "7d", label: "7d" }, { key: "30d", label: "30d" }];

// White window badge at the top right of every windowed Overview card.
export function WindowBadge({ win }: { win: Window4 }) {
    const label = WINDOW_TABS.find(t => t.key === win)?.label ?? win;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: "#fff", color: "#0b0b0d", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: "14px", whiteSpace: "nowrap" }}>{label}</span>
    );
}
export function SegmentedTabs<K extends string>({ tabs, value, onChange, accent = SEGMENT_ACTIVE }: {
    tabs: { key: K; label: string; count?: number }[];
    value: K;
    onChange: (k: K) => void;
    accent?: string;
}) {
    return (
        <div style={{
            display: "inline-flex", gap: 2, padding: 4, borderRadius: 999,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
        }}>
            {tabs.map(t => {
                const isActive = value === t.key;
                return (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => onChange(t.key)}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "5px 14px", borderRadius: 999, cursor: "pointer",
                            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                            background: isActive ? hexToRgba(accent, 0.18) : "transparent",
                            border: "none",
                            color: isActive ? accent : "rgba(255,255,255,0.45)",
                            transition: "background 0.15s, color 0.15s",
                        }}>
                        <span>{t.label}</span>
                        {typeof t.count === "number" && <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 600 }}>{t.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}
