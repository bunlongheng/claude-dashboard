import type { Metadata } from "next";
import GlobalSection from "../_sections/GlobalSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Global",
    icons: {
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>",
    },
};

export default function GlobalPage() {
    return <GlobalSection />;
}
