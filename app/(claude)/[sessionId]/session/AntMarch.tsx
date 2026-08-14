"use client";

import { memo, type RefObject } from "react";
import Image from "next/image";

export const AntMarch = memo(function AntMarch({ thinking, antCount, containerRef }: {
    thinking: boolean;
    antCount: number;
    containerRef: RefObject<HTMLDivElement | null>;
}) {
    return (
        <div className="shrink-0 px-3 pt-2 pb-1" style={{ background: "#09090b" }}>
            <div ref={containerRef} className="flex items-center gap-2">
                <span className="text-[9px] font-bold tracking-wider shrink-0 animate-pulse" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {thinking ? "Thinking..." : "Working..."}
                </span>
                <div className="flex items-end gap-0 flex-1 overflow-hidden" style={{ animation: "claudeMarch 10s linear infinite" }}>
                    {Array.from({ length: antCount }).map((_, i) => {
                        const hue = (i * 35) % 360;
                        return (
                            <Image key={i} src="/claude-logo.png" alt="" width={20} height={20}
                                style={{
                                    imageRendering: "pixelated",
                                    opacity: 0.7,
                                    animation: `antStep 0.4s ease-in-out infinite`,
                                    animationDelay: `${i * 0.1}s`,
                                    filter: `brightness(0.7) sepia(1) saturate(5) hue-rotate(${hue}deg)`,
                                }} />
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
