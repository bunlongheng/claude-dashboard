"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useMachine } from "./MachineContext";
import { type MemMode } from "./MemoryGraph";

const MODES: { key: MemMode; label: string; color: string; blurb: string }[] = [
    { key: "nothing", label: "Nothing", color: "#6b7280", blurb: "Control. No memory loaded - Claude starts cold from the repo path only." },
    { key: "rag", label: "RAG", color: "#10b981", blurb: "Keyword retrieval (FTS5/BM25) over preferences + docs. The baseline memory." },
    { key: "rag_vector", label: "RAG + Vector", color: "#3b82f6", blurb: "Adds semantic reach via local embeddings, so paraphrased recall still hits." },
    { key: "rag_vector_kp", label: "RAG + Vector + KP", color: "#8b5cf6", blurb: "Retrieval, then synthesized into a compact brief. ~38x smaller context." },
    { key: "kp", label: "KP only", color: "#f59e0b", blurb: "Whole wiki synthesized, no retrieval. Loses specific facts (benchmarked 1.4/5)." },
];

export default function ContextSection() {
    const { machine, apiBase } = useMachine();
    const [mode, setMode] = useState<MemMode>("rag");
    const [saved, setSaved] = useState(false);
    const [heroSlot, setHeroSlot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setHeroSlot(document.getElementById("page-hero-slot"));
    }, []);

    useEffect(() => {
        fetch(apiBase("/api/rag/mode"))
            .then(r => r.json())
            .then(d => { if (d?.mode) setMode(d.mode as MemMode); })
            .catch(() => {});
    }, [machine, apiBase]);

    // Persist the mode so the rag-memory MCP / live sessions actually use it.
    function changeMode(m: MemMode) {
        setMode(m);
        fetch(apiBase("/api/rag/mode"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: m }) })
            .then(() => { setSaved(true); setTimeout(() => setSaved(false), 1800); })
            .catch(() => {});
    }

    const active = MODES.find(m => m.key === mode)!;

    // Mode picker + active-mode blurb — rendered into the shared page hero's right-side slot.
    const modeControl = (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, maxWidth: 460 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ position: "relative", display: "inline-flex" }}>
                    <select value={mode} onChange={e => changeMode(e.target.value as MemMode)}
                        style={{
                            appearance: "none", WebkitAppearance: "none", outline: "none",
                            background: `${active.color}1f`, border: `1px solid ${active.color}`, color: active.color,
                            fontSize: 12, fontWeight: 700, padding: "9px 36px 9px 14px", borderRadius: 10, cursor: "pointer",
                        }}>
                        {MODES.map(m => (
                            <option key={m.key} value={m.key} style={{ background: "#15151c", color: "#fff" }}>{m.label}</option>
                        ))}
                    </select>
                    <ChevronDown size={15} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: active.color }} />
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                    {saved ? "Saved" : "Live"}
                </span>
            </div>
            {/* Active mode blurb — sits directly under the dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 10, background: `${active.color}10`, border: `1px solid ${active.color}30` }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: active.color, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{active.label}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{active.blurb}</span>
            </div>
        </div>
    );

    return (
        <div>
            {heroSlot
                ? createPortal(modeControl, heroSlot)
                : <div style={{ marginBottom: 14 }}>{modeControl}</div>}

            {/* Memory graph renders from your local RAG index once preferences
                have been ingested. */}
            <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", background: "#0b0b0f", padding: "48px 24px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.6 }}>
                The memory graph builds from your local RAG index. Ingest your
                sessions and preferences from the <strong style={{ color: "rgba(255,255,255,0.75)" }}>RAG</strong> tab,
                then reload to see the force-directed network of every preference.
            </div>
        </div>
    );
}
