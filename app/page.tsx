import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isLocalHost } from "@/lib/is-local";
import { auth } from "@/lib/db";
import LandingPage from "./LandingPage";

export default async function Home({ searchParams }: { searchParams: Promise<{ logged_out?: string; landing?: string }> }) {
    const params = await searchParams;
    const loggedOut = params.logged_out === "1";

    if (loggedOut) return <LandingPage />;

    const h = await headers();
    const local = isLocalHost(h.get("host") || "");

    // When a password is configured, it must gate EVERY host - including
    // local/LAN/tailnet. (Previously the local check ran first, so setting
    // ADMIN_PASSWORD protected nothing on the LAN.)
    if (auth.configured) {
        let user = null;
        try {
            user = await auth.getUser();
        } catch {}
        if (user) redirect("/dashboard");
        return <LandingPage />;
    }

    // Zero-config default: no password set - local/LAN hosts go straight in.
    if (local && !params.landing) redirect("/dashboard");

    return <LandingPage />;
}
