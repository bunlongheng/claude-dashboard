import type { Metadata } from "next";
import { db } from "@/lib/db";
import RulesSection from "../_sections/RulesSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Claude | Rules",
    icons: { icon: "/claude-logo.png" },
};

export default async function RulesPage() {
    let instructions: any[] = [];
    try {
        instructions = await db.query("claude_global_instructions", {
            select: "id,category,title,instruction,source,project,confidence,created_at,updated_at",
            orderBy: "category",
        });
    } catch {}

    return <RulesSection initialInstructions={instructions} />;
}
