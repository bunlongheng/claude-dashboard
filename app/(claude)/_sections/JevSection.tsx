"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SegmentedTabs, WINDOW_TABS, safeFetch, type Window4 } from "./shared";
import { HeroSlot } from "./PageHero";
import { useMachine } from "./MachineContext";
import JevCharts from "./JevCharts";
import JevRouterSwitch from "./JevRouterSwitch";
import { JEV_DAYS } from "@/lib/jev-palette";
import type { JevPayload } from "@/lib/jev-log";
import type { JevRouterState } from "@/lib/jev-router-state";

export default function JevSection({ initial, router, tier, win: initialWin }: { initial: JevPayload; router: JevRouterState; tier?: string; win: Window4 }) {
    const { machine, apiBase } = useMachine();
    const [win, setWin] = useState<Window4>(initialWin);
    const days = String(JEV_DAYS[win]);

    const { data } = useQuery<JevPayload>({
        queryKey: ["jev", machine, days],
        queryFn: () => safeFetch<JevPayload>(apiBase(`/api/claude/jev?days=${days}`), initial),
        // The hook appends on every prompt, so the page is worth keeping warm
        // while it is open - the route itself caches for 30 s behind this.
        refetchInterval: 30_000,
        initialData: String(initial.days) === days ? initial : undefined,
    });

    const payload = data ?? initial;

    return (
        <div>
            <HeroSlot>
                <SegmentedTabs<Window4> tabs={WINDOW_TABS} value={win} onChange={setWin} />
            </HeroSlot>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <JevRouterSwitch initial={router} />
                <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "ui-monospace, monospace" }}>
                    {payload.logPath}
                </span>
            </div>
            <JevCharts data={payload} tier={tier} win={win} />
        </div>
    );
}
