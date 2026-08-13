import type { Metadata } from "next";
import SettingsSection from "../_sections/SettingsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Settings" };

export default function SettingsPage() {
    return <SettingsSection />;
}
