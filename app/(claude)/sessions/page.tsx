import type { Metadata } from "next";
import SessionsSection from "../_sections/SessionsSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Sessions",
    icons: {
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>",
    },
};

export default function SessionsPage() {
    return <SessionsSection />;
}
