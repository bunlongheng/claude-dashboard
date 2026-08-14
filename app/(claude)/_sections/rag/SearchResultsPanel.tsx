"use client";

import { memo } from "react";
import { ACCENT, type SearchResult } from "./types";

// Search results banner - shown above whichever tab is active when there
// are live results from the header search box. Lifted verbatim from
// RagSection.tsx (was the "Search results - shown on any tab" block).
function SearchResultsPanel({ results, onClear }: { results: SearchResult[]; onClear: () => void }) {
    if (results.length === 0) return null;
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Search Results ({results.length})
                </span>
                <button onClick={onClear}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 9 }}>Clear</button>
            </div>
            {results.map((r, i) => (
                <div key={i} style={{
                    padding: "10px 14px", marginBottom: 3, borderRadius: 8,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>{r.title}</span>
                        <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>{r.project}</span>
                        <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)" }}>{r.source_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {r.content.slice(0, 200)}{r.content.length > 200 ? "..." : ""}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default memo(SearchResultsPanel);
