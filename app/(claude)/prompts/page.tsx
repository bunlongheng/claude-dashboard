import type { Metadata } from "next";
import { withTimeout, fetchHistory, fetchNotes } from "../_sections/data";
import PromptsSection from "../_sections/PromptsSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Prompts",
    icons: {
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>",
    },
};

export default async function PromptsPage() {
    const [{ entries, total }, notes] = await Promise.all([
        withTimeout(fetchHistory(), { entries: [], total: 0 }),
        withTimeout(fetchNotes(), []),
    ]);

    return (
        <PromptsSection
            initialHistory={entries}
            totalHistory={total}
            initialNotes={notes}
        />
    );
}
