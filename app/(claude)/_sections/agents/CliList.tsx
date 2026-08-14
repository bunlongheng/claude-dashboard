"use client";

import { memo } from "react";
import { cliIconFor, CLI_ICON_MAP } from "../cliIcons";

const CLI_TOOLS = Object.keys(CLI_ICON_MAP);

function CliListImpl() {
    return (
        <div style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "center", padding: "8px 14px", fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span></span><span>tool</span>
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {CLI_TOOLS.map((name) => {
                    const ToolIcon = cliIconFor(name);
                    return (
                        <div key={name} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <ToolIcon size={14} style={{ color: "#22d3ee", opacity: 0.85 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.85)" }}>{name}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const CliList = memo(CliListImpl);
