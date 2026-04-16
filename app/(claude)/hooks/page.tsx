import type { Metadata } from "next";
import HooksSection from "../_sections/HooksSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Hooks" };

export default function HooksPage() {
    return <HooksSection />;
}
