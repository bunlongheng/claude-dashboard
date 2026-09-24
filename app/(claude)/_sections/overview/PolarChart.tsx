"use client";

// Polar area chart: every segment gets the same angle, the value drives the
// radius. Reads differently from the config donut next to it, and a tier that
// is 65x another still stays visible because of the minimum radius.
export function PolarChart({ segments, size = 130 }: { segments: { value: number; color: string; label: string }[]; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;
    const max = Math.max(...segments.map(s => s.value));
    const R = (size - 8) / 2;
    const cx = size / 2, cy = size / 2;
    const step = (Math.PI * 2) / segments.length;
    const rings = [0.25, 0.5, 0.75, 1];

    return (
        <div className="flex items-center justify-center gap-4 flex-wrap">
            <svg width={size} height={size}>
                {rings.map(k => (
                    <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                ))}
                {segments.map((seg, i) => {
                    const start = -Math.PI / 2 + i * step;
                    const end = start + step;
                    const r = seg.value > 0 ? Math.max(R * 0.12, R * Math.sqrt(seg.value / max)) : 0;
                    if (r === 0) return null;
                    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
                    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
                    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${step > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
                    return (
                        <path key={seg.label} d={path} fill={seg.color} fillOpacity={0.7} stroke={seg.color} strokeWidth={1} strokeLinejoin="round" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                            <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin={`${i * 0.1}s`} fill="freeze" />
                        </path>
                    );
                })}
                <circle cx={cx} cy={cy} r={2} fill="rgba(255,255,255,0.6)" />
            </svg>
            <div className="space-y-1">
                {segments.map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: s.color, marginLeft: "auto" }}>{s.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
