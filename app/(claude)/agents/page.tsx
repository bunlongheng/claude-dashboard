import type { Metadata } from "next";
import AgentsSection from "../_sections/AgentsSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Agents",
    icons: {
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>",
    },
};

export default function AgentsPage() {
    return <AgentsSection />;
}
