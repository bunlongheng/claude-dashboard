import type { Metadata } from "next";
import SkillsSection from "../_sections/SkillsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Skills" };

export default function SkillsPage() {
    return <SkillsSection />;
}
