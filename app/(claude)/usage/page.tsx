import type { Metadata } from "next";
import { withTimeout, fetchUsageBreakdown } from "../_sections/data";
import UsageSection from "../_sections/UsageSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Usage",
    icons: { icon: "/claude-logo.png" },
};

export default async function UsagePage() {
    const rows = await withTimeout(fetchUsageBreakdown(), [], 20000);
    return <UsageSection initialRows={rows} />;
}
