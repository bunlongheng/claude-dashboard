import type { Metadata } from "next";
import RagSection from "../../_sections/RagSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | RAG Context" };

export default function RagContextPage() {
    return <RagSection initialTab="context" />;
}
