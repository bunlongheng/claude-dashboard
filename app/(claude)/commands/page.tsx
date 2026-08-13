import type { Metadata } from "next";
import CommandsSection from "../_sections/CommandsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Commands" };

export default function CommandsPage() {
    return <CommandsSection />;
}
