import type { Metadata } from "next";
import McpSection from "../_sections/McpSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | MCP" };

export default function McpPage() {
    return <McpSection />;
}
