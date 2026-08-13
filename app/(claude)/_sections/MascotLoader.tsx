"use client";

/**
 * Center-screen loading splash with the pixel-art mascot.
 *
 * The mascot SVG (claude-mascot.svg) is inlined here so we can drive the body
 * color from CSS instead of fetching an immutable file. The body cycles through
 * an orange/pink/purple/cyan gradient while a soft pulse runs underneath.
 * Stop spinning when the parent flips `loading` to false.
 */
export function MascotLoader({ label = "Loading" }: { label?: string }) {
    return (
        <div style={{
            // Fill the full content area (parent reserves the rest of the viewport)
            // so the mascot lands dead-center horizontally AND vertically, not just
            // 320 px from the top edge.
            minHeight: "calc(100vh - 120px)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 16, padding: "48px 0",
        }}>
            <style>{`
                @keyframes mascot-hue { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
                @keyframes mascot-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
                @keyframes mascot-pulse { 0%,100%{opacity:.45;transform:scale(0.95)} 50%{opacity:0.85;transform:scale(1.05)} }
                @keyframes mascot-dots { 0%{opacity:.25} 25%{opacity:1} 50%{opacity:.25} 75%{opacity:.25} 100%{opacity:.25} }
                @keyframes mascot-dots-2 { 0%{opacity:.25} 25%{opacity:.25} 50%{opacity:1} 75%{opacity:.25} 100%{opacity:.25} }
                @keyframes mascot-dots-3 { 0%{opacity:.25} 25%{opacity:.25} 50%{opacity:.25} 75%{opacity:1} 100%{opacity:.25} }
            `}</style>

            <div style={{ position: "relative", width: 96, height: 96, animation: "mascot-bob 1.8s ease-in-out infinite" }}>
                {/* Soft radial glow behind the mascot - same hue cycle so it stays in sync */}
                <div style={{
                    position: "absolute", inset: -16, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(249,115,22,0.35) 0%, rgba(249,115,22,0) 70%)",
                    animation: "mascot-pulse 1.6s ease-in-out infinite, mascot-hue 4s linear infinite",
                }} />

                <svg viewBox="0 0 16 16" width="96" height="96"
                    shapeRendering="crispEdges"
                    style={{ position: "relative", animation: "mascot-hue 4s linear infinite", filter: "drop-shadow(0 0 8px rgba(249,115,22,0.45))" }}>
                    {/* body */}
                    <rect x="3" y="2" width="10" height="8" fill="#f97316" />
                    {/* arms */}
                    <rect x="1" y="4" width="2" height="2" fill="#f97316" />
                    <rect x="13" y="4" width="2" height="2" fill="#f97316" />
                    {/* eyes */}
                    <rect x="5" y="4" width="2" height="2" fill="#1a1a1a" />
                    <rect x="9" y="4" width="2" height="2" fill="#1a1a1a" />
                    {/* legs - half height for a stubbier proportion */}
                    <rect x="5" y="10" width="2" height="2" fill="#f97316" />
                    <rect x="9" y="10" width="2" height="2" fill="#f97316" />
                </svg>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>
                <span>{label}</span>
                <span style={{ animation: "mascot-dots 1.2s steps(1) infinite" }}>.</span>
                <span style={{ animation: "mascot-dots-2 1.2s steps(1) infinite" }}>.</span>
                <span style={{ animation: "mascot-dots-3 1.2s steps(1) infinite" }}>.</span>
            </div>
        </div>
    );
}
