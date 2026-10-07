import type { Metadata } from "next";
import { withTimeout, fetchJev, emptyJev } from "../_sections/data";
import JevSection from "../_sections/JevSection";
import { getRouterState } from "@/lib/jev-router-state";
import { TIER_ORDER, JEV_DAYS } from "@/lib/jev-palette";
import type { Window4 } from "../_sections/shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Jev",
    icons: { icon: "/claude-logo.png" },
};

const TIERS: readonly string[] = TIER_ORDER;

// ?days=1/7/30/365&tier=haiku is what the overview card links to, so the page
// opens on the same window and rung the user clicked instead of the 30d default.
export default async function JevPage({ searchParams }: { searchParams: Promise<{ days?: string; tier?: string }> }) {
    const sp = await searchParams;
    const win: Window4 = sp.days === "1" ? "today" : sp.days === "7" ? "7d" : sp.days === "30" ? "30d" : sp.days === "365" || sp.days === "90" ? "all" : "30d";
    const days = JEV_DAYS[win];
    const tier = sp.tier && TIERS.includes(sp.tier) ? sp.tier : undefined;
    const initial = await withTimeout(fetchJev(days), emptyJev(days));
    const router = getRouterState();

    return <JevSection initial={initial} router={router} tier={tier} win={win} />;
}
