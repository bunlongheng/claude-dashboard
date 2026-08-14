import { redirect } from "next/navigation";

// This is a local, single-user developer tool - no accounts, no login, no gate.
// Opening the app drops you straight into the dashboard.
export default function Home() {
    redirect("/dashboard");
}
