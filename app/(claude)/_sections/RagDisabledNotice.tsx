import { DatabaseZap } from "lucide-react";

// Shown on /rag and /context when RAG is not enabled. RAG is opt-in in the
// open-source edition (see lib/features.ts).
export default function RagDisabledNotice({ feature = "RAG" }: { feature?: string }) {
    return (
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{
                maxWidth: 520, width: "100%", textAlign: "center",
                border: "1px solid rgba(255,59,48,0.2)", borderRadius: 16,
                background: "rgba(255,59,48,0.04)", padding: "40px 32px",
            }}>
                <div style={{
                    width: 56, height: 56, borderRadius: 14, margin: "0 auto 20px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,59,48,0.12)", color: "#FF3B30",
                }}>
                    <DatabaseZap size={28} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: "0 0 10px" }}>
                    {feature} is an optional feature
                </h2>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", margin: "0 0 20px" }}>
                    Semantic memory search over your Claude Code history runs a local
                    index and a small on-device embedding model. It needs no external
                    service and no API key. It is off by default to keep the dashboard
                    zero-setup.
                </p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 8px" }}>
                    To turn it on, add this to your <code style={{ color: "rgba(255,255,255,0.75)" }}>.env</code> and restart:
                </p>
                <pre style={{
                    display: "inline-block", textAlign: "left", margin: 0,
                    background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "10px 14px", fontSize: 13.5,
                    color: "#FF8A80", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}>NEXT_PUBLIC_RAG_ENABLED=1</pre>
            </div>
        </div>
    );
}
