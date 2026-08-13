import type { Metadata } from "next";
import ExtensionsSection from "../_sections/ExtensionsSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claude | Extensions" };

export default function ExtensionsPage() {
    return <ExtensionsSection />;
}
