import ClaudeSidebarNav from "./_sections/ClaudeSidebarNav";
import ClaudeContentArea from "./_sections/ClaudeContentArea";
import { QueryProvider } from "./_sections/QueryProvider";
import { MachineProvider } from "./_sections/MachineContext";
import { ToastProvider } from "./_sections/ToastContext";
import { checkSetup, SetupBanner } from "./_sections/SetupCheck";

// Local developer tool: no auth, no gate. Render the dashboard shell directly.
export default function ClaudeLayout({ children }: { children: React.ReactNode }) {
    return (
        <QueryProvider>
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
        </QueryProvider>
    );
}
