import type { Metadata } from "next";
import OverviewSection from "../_sections/OverviewSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard | Overview" };

export default function OverviewPage() {
    return <OverviewSection />;
}
