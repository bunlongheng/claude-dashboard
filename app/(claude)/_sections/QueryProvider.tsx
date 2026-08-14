"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// Shared React Query client for the dashboard's data fetching. A stable instance
// per mount (useState initializer) with sensible local-tool defaults: data is
// fresh for a few seconds, refetch on window focus so the board updates when you
// come back to the tab, and no aggressive ret/refetch storms.
export function QueryProvider({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 5_000,
                        refetchOnWindowFocus: true,
                        retry: 1,
                    },
                },
            })
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
