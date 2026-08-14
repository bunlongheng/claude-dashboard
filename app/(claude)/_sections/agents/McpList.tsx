"use client";

import { memo } from "react";
import AppIcon from "../AppIcon";

function McpListImpl({ servers }: { servers: { name: string; type?: string }[] }) {
    return (
        <div style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center", padding: "8px 14px", fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span></span><span>server</span><span>transport</span>
            </div>
            {servers.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 11 }}>no MCP servers</div>
            ) : (
                <div style={{ maxHeight: 560, overflowY: "auto" }}>
                    {servers.map((m) => (
                        <div key={m.name} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <AppIcon project={m.name} size={16} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#FFCC00", textTransform: "uppercase", letterSpacing: 0.5, padding: "2px 8px", borderRadius: 6, background: "rgba(255,204,0,0.1)" }}>{m.type || "mcp"}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const McpList = memo(McpListImpl);
