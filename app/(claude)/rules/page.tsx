import type { Metadata } from "next";
import { withTimeout, fetchGlobalInstructions } from "../_sections/data";
import RulesSection from "../_sections/RulesSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Rules",
    icons: {
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>",
    },
};

export default async function RulesPage() {
    const instructions = await withTimeout(fetchGlobalInstructions(), []);

    return <RulesSection initialInstructions={instructions} />;
}
