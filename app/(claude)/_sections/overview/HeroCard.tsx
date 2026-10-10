"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const start = display;
        const diff = value - start;
        if (diff === 0) return;
        const startTime = performance.now();
        const animate = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + diff * ease));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, duration]);
    return <>{display.toLocaleString()}</>;
}

// Unified hero card: section name, the headline number (stats[0]) and its
// label, with a big faded icon in the corner. Extra stats in the array are intentionally not rendered
// here (the compact single-number look); color matches the left-nav color.
export function HeroCard({ name, icon: Icon, color, href, stats }: {
    name: string; icon: React.ElementType; color: string; href: string;
    stats: { label: string; value: number | string; color?: string }[];
}) {
    return (
        <Link
            href={href}
            className="group hover:shadow-lg"
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 20px ${color}15`; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            style={{
                position: "relative", overflow: "hidden", display: "block", borderRadius: 12, padding: 1,
                background: `${color}40`, transition: "box-shadow 0.3s", textDecoration: "none", cursor: "pointer",
            }}
        >
            {/* snake: a short colored arc that runs around the border while hovered (from 3pi HeroCard) */}
            <div className="opacity-0 group-hover:opacity-100 [animation-play-state:paused] group-hover:[animation-play-state:running]"
                style={{
                    position: "absolute", inset: "-150%", pointerEvents: "none", transition: "opacity 0.3s",
                    background: `conic-gradient(transparent 0deg, ${color} 40deg, transparent 80deg)`,
                    animation: "heroSnake 2s linear infinite",
                }} />
            <div className="px-3 sm:px-4 py-3" style={{
                position: "relative", overflow: "hidden", borderRadius: 11,
                background: `linear-gradient(135deg, ${color}20 0%, ${color}08 100%), #08090d`,
            }}>
            {/* big faded icon cut off in the bottom right corner (Color Admin hero look) */}
            <Icon size={64} style={{ position: "absolute", right: -7, bottom: -7, color, opacity: 0.05, mixBlendMode: "screen", pointerEvents: "none" }} />
            <div className="text-[10px] sm:text-[11px] tracking-[0.06em]" style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}><Icon size={16} style={{ color, flexShrink: 0 }} />{name}</div>
            <div className="text-[24px] sm:text-[28px]" style={{ position: "relative", fontWeight: 800, color: stats[0].color ?? color, lineHeight: 1.1, marginTop: 6, whiteSpace: "nowrap" }}>
                {typeof stats[0].value === "number" ? <AnimatedNumber value={stats[0].value} /> : stats[0].value}
            </div>
            </div>
        </Link>
    );
}
