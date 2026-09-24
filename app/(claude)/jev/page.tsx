import type { Metadata } from "next";
import { withTimeout, fetchJev, emptyJev } from "../_sections/data";
import JevSection from "../_sections/JevSection";
import { getRouterState } from "@/lib/jev-router-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Jev",
    icons: { icon: "/claude-logo.png" },
};

export default async function JevPage() {
    const initial = await withTimeout(fetchJev(30), emptyJev(30));
    const router = getRouterState();

    return <JevSection initial={initial} router={router} />;
}
