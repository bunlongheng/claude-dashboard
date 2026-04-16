import type { Metadata } from "next";
import { withTimeout, fetchTokens } from "../_sections/data";
import TokensSection from "../_sections/TokensSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Tokens",
    icons: { icon: "/claude-logo.png" },
};

export default async function TokensPage() {
    const tokens = await withTimeout(fetchTokens(), []);

    return <TokensSection initialTokens={tokens} />;
}
