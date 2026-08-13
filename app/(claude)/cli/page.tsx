import type { Metadata } from "next";
import CliSection from "../_sections/CliSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | CLI" };

export default function CliPage() {
    return <CliSection />;
}
