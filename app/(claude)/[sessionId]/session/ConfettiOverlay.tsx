"use client";

import { memo } from "react";
import { createPortal } from "react-dom";

const CONFETTI_COLORS = ["#f87171","#fb923c","#facc15","#4ade80","#22d3ee","#60a5fa","#a78bfa","#f472b6","#34d399","#c084fc"];

export const ConfettiOverlay = memo(function ConfettiOverlay({ confetti }: { confetti: { id: number; x: number; y: number }[] }) {
    if (confetti.length === 0 || typeof document === "undefined") return null;

    return createPortal(
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647 }}>
            {confetti.map(p => {
                return Array.from({ length: 12 }, (_, j) => {
                    const angle = (j / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
                    const dist = 40 + Math.random() * 60;
                    const rotation = Math.floor(Math.random() * 720 - 360);
                    return (
                        <div key={`${p.id}-${j}`} className="confetti-particle"
                            style={{
                                left: p.x, top: p.y,
                                background: CONFETTI_COLORS[j % CONFETTI_COLORS.length],
                                "--cx": `${Math.cos(angle) * dist}px`,
                                "--cy": `${Math.sin(angle) * dist - 30}px`,
                                "--cr": `${rotation}deg`,
                            } as React.CSSProperties} />
                    );
                });
            })}
        </div>,
        document.body,
    );
});
