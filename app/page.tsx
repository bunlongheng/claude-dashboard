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

    if (local && !params.landing) redirect("/dashboard");

    // Check if logged in
    try {
        if (auth.configured) {
            const user = await auth.getUser();
            if (user) redirect("/dashboard");
        }
    } catch {}

    return <LandingPage />;
}
