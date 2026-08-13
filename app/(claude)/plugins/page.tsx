import type { Metadata } from "next";
import PluginsSection from "../_sections/PluginsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Plugins" };

export default function PluginsPage() {
    return <PluginsSection />;
}
