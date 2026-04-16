import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/db";
import { isLocalHost } from "@/lib/is-local";
import ClaudeSidebarNav from "./_sections/ClaudeSidebarNav";
import ClaudeContentArea from "./_sections/ClaudeContentArea";
import { MachineProvider } from "./_sections/MachineContext";
import { ToastProvider } from "./_sections/ToastContext";
import { checkSetup, SetupBanner } from "./_sections/SetupCheck";

export default async function ClaudeLayout({ children }: { children: React.ReactNode }) {
    const h = await headers();
    const local = isLocalHost(h.get("host") || "");
    if (!local) {
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail && auth.configured) {
            const user = await auth.getUser();
            if (!user || user.email !== adminEmail) {
                redirect("/");
            }
        }
    }

    return (
        <MachineProvider>
            <ToastProvider>
                <div className="flex flex-col md:flex-row text-white font-sans antialiased" style={{ background: "#08090d", minHeight: "100dvh" }}>
                    <ClaudeSidebarNav />
                    <ClaudeContentArea>
                        <SetupBanner status={checkSetup()} />
                        {children}
                    </ClaudeContentArea>
                </div>
            </ToastProvider>
        </MachineProvider>
    );
}
