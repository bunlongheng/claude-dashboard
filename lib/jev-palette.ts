// Jev router palette shared by the overview card and the /jev page so a tier
// or health state reads the same color everywhere. The ladder reads left to
// right cheapest first, so the order has to stay stable across every chart.
import type { JevHealth } from "@/lib/jev-log";

export const TIER_ORDER = ["haiku", "sonnet", "opus", "fable"] as const;

export const TIER_COLORS: Record<string, string> = {
    haiku: "#22C55E",
    sonnet: "#4A9EFF",
    opus: "#A855F7",
    fable: "#F97316",
};

export const HEALTH_STYLE: Record<JevHealth, { color: string; label: string; note: string }> = {
    live: { color: "#22C55E", label: "LIVE", note: "routed in the last 15 minutes" },
    stale: { color: "#E8A23B", label: "STALE", note: "no routing decision recently" },
    never: { color: "#6B7280", label: "NEVER", note: "the router has not answered yet" },
};

// Days asked of /api/claude/jev per Overview window; the route caps at 365.
export const JEV_DAYS: Record<"today" | "7d" | "30d" | "all", number> = { today: 1, "7d": 7, "30d": 30, all: 365 };
