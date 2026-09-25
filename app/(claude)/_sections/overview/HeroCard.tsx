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

// Unified hero card: one line - icon + section name + the section's headline
// number (stats[0]). Extra stats in the array are intentionally not rendered
// here (the compact single-number look); color matches the left-nav color.
export function HeroCard({ name, icon: Icon, color, href, stats }: {
    name: string; icon: React.ElementType; color: string; href: string;
    stats: { label: string; value: number | string; color?: string }[];
}) {
    return (
        <Link
            href={href}
            className="hover:shadow-lg gap-2 sm:gap-[11px] px-3 sm:px-4 py-3.5"
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.boxShadow = `0 0 20px ${color}15`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}20`; e.currentTarget.style.boxShadow = "none"; }}
            style={{
                display: "flex", alignItems: "center", borderRadius: 12,
                background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`,
                border: `1px solid ${color}20`,
                transition: "border-color 0.3s, box-shadow 0.3s",
                textDecoration: "none", cursor: "pointer",
            }}
        >
            {/* single line: icon + name + the one number */}
            <Icon size={22} style={{ color, flexShrink: 0 }} />
            <span className="text-[10px] sm:text-[11px] tracking-[0.04em] sm:tracking-[0.06em]" style={{ flex: 1, minWidth: 0, fontWeight: 600, textTransform: "uppercase", lineHeight: 1.15, color: "rgba(255,255,255,0.6)" }}>{name}</span>
            <span className="font-light sm:font-normal md:font-semibold lg:font-extrabold text-lg sm:text-[22px]" style={{ color: stats[0].color ?? color, lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}>
                {typeof stats[0].value === "number" ? <AnimatedNumber value={stats[0].value} /> : stats[0].value}
            </span>
        </Link>
    );
}
