import type { Metadata } from "next";
import RagSection from "../../_sections/RagSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | RAG Documents" };

export default function RagDocumentsPage() {
    return <RagSection initialTab="documents" />;
}
