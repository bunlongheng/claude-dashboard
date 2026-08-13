import type { Metadata } from "next";
import RagSection, { type RagTab } from "../_sections/RagSection";
import RagDisabledNotice from "../_sections/RagDisabledNotice";
import { RAG_ENABLED } from "@/lib/features";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | RAG" };

const RAG_TABS: readonly RagTab[] = ["overview", "documents", "search", "preferences", "context", "eval"];

export default async function RagPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
    if (!RAG_ENABLED) return <RagDisabledNotice feature="RAG" />;
    const params = await searchParams;
    const raw = params.tab || "overview";
    const tab: RagTab = RAG_TABS.includes(raw as RagTab) ? (raw as RagTab) : "overview";
    return <RagSection initialTab={tab} />;
}
