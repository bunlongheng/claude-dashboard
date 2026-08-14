"use client";

import { memo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type Pref } from "./types";

const catColors: Record<string, string> = {
    stack: "#3b82f6", style: "#8b5cf6", workflow: "#22c55e", feedback: "#f59e0b",
    infra: "#06b6d4", security: "#ef4444", ui: "#ec4899", general: "#64748b",
};

// Preferences tab - collapsible per-category preference list. Lifted
// verbatim from RagSection.tsx's `tab === "preferences"` block.
function PreferencesTab({ prefs }: { prefs: Pref[] }) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggleCat = (cat: string) => {
        setCollapsed(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
    };

    const grouped: Record<string, Pref[]> = {};
    for (const p of prefs) { if (!grouped[p.category]) grouped[p.category] = []; grouped[p.category].push(p); }

    return (
        <div>
            {Object.entries(grouped).sort().map(([cat, items]) => {
                const color = catColors[cat] || "#64748b";
                const isCollapsed = collapsed.has(cat);
                return (
                    <div key={cat} style={{ marginBottom: 8 }}>
                        <button onClick={() => toggleCat(cat)} style={{
                            width: "100%", padding: "10px 12px", borderRadius: 8,
                            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                            color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                            fontFamily: "inherit", fontSize: 11, fontWeight: 600, textAlign: "left",
                        }}>
                            {isCollapsed ? <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.55)" }} /> : <ChevronDown size={12} style={{ color: "rgba(255,255,255,0.55)" }} />}
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                            <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10, color }}>{cat}</span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>{items.length}</span>
                        </button>
                        {!isCollapsed && items.map(p => (
                            <div key={p.id} style={{
                                padding: "8px 12px 8px 34px", borderBottom: "1px solid rgba(255,255,255,0.03)",
                                display: "flex", gap: 10,
                            }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color, minWidth: 140, flexShrink: 0 }}>{p.key}</span>
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>{p.value}</span>
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

export default memo(PreferencesTab);
