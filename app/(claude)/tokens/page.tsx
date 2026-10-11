import type { Metadata } from "next";
import TokensSection from "../_sections/TokensSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Tokens",
    icons: { icon: "/claude-logo.png" },
};

export default function TokensPage() {
    return <TokensSection />;
}
