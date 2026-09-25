import type { Metadata } from "next";
import { withTimeout, fetchJev, emptyJev } from "../_sections/data";
import JevSection from "../_sections/JevSection";
import { getRouterState } from "@/lib/jev-router-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Jev",
    icons: { icon: "/claude-logo.png" },
};

const DAYS = [7, 30, 90];
const TIERS = ["haiku", "sonnet", "opus", "fable"];

// ?days=7&tier=haiku is what the overview card links to, so the page opens on
// the same window and rung the user clicked instead of the 30d default.
export default async function JevPage({ searchParams }: { searchParams: Promise<{ days?: string; tier?: string }> }) {
    const sp = await searchParams;
    const days = DAYS.includes(Number(sp.days)) ? Number(sp.days) : 30;
    const tier = sp.tier && TIERS.includes(sp.tier) ? sp.tier : undefined;
    const initial = await withTimeout(fetchJev(days), emptyJev(days));
    const router = getRouterState();

    return <JevSection initial={initial} router={router} tier={tier} />;
}
