"use client";

import { useState, useEffect } from "react";

// Isolated live clock - ticks every second (with seconds) so ONLY this tiny
// component re-renders each tick, not the whole Overview tree.
export function LiveClock() {
    const [now, setNow] = useState<string>("");
    useEffect(() => {
        const tick = () => setNow(new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }));
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, []);
    if (!now) return null;
    return <span suppressHydrationWarning style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{now}</span>;
}
