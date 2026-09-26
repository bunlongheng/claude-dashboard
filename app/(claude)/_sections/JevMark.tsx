import type { CSSProperties } from "react";

export const JEV_PINK = "#E85DBF";

// Jev's mark (the typesafe.ai cube) drawn as a lucide-style stroke icon so it
// sits next to the other section icons: same 24 grid, 2px stroke, no filled
// disc. Colour comes from `color` (currentColor) and defaults to Jev pink.
export default function JevMark({ size = 16, style }: { size?: number; style?: CSSProperties }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ color: JEV_PINK, flexShrink: 0, ...style }}>
            {/* outer isometric cube */}
            <path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5z" />
            {/* front edges */}
            <path d="M3.5 7.25 12 12l8.5-4.75M12 12v9.5" />
            {/* inner cut-out cube on the top face */}
            <path d="M12 7.25 15.75 9.4 12 11.5 8.25 9.4z" />
        </svg>
    );
}
