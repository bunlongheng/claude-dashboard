import type { Metadata } from "next";
import AgentsSection from "../_sections/AgentsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Agents" };

export default function AgentsPage() {
    return <AgentsSection />;
}
