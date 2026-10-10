"use client";

import { useState, useEffect } from "react";

// Isolated live clock - ticks every second (with seconds) so ONLY this tiny
// component re-renders each tick, not the whole Overview tree.
export function LiveClock() {
    const [now, setNow] = useState<{ date: string; time: string } | null>(null);
    useEffect(() => {
        const tick = () => {
            const d = new Date();
            setNow({
                date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }),
            });
        };
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, []);
    if (!now) return null;
    return (
        <span suppressHydrationWarning style={{ fontSize: 11, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {now.date}, <b style={{ fontWeight: 800, color: "#FF3B30" }}>{now.time}</b>
        </span>
    );
}
