"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./ClaudeSidebarNav";
import { hexToRgba } from "./shared";

const PAGE_SUBTITLES: Record<string, string> = {
    "/dashboard": "Dashboard & monitoring",
    "/global":   "Identity, rules & instructions",
    "/brain":    "Per-project memory files",
    "/rules":    "Global rules database",
    "/settings": "settings.json & settings.local.json",
    "/mcp":      "MCP server connections",
    "/plugins":  "Installed plugins & extensions",
    "/skills":   "Skills & capabilities",
    "/commands": "Slash commands",
    "/hooks":    "Event hooks & automation",
    "/sessions": "Active & past sessions",
    "/tokens":   "Token usage & cost tracking",
    "/monitor":  "App process monitor",
    "/monitor/crons": "24-hour automation schedule",
    "/monitor/gallery": "App screenshots & GIFs",
};

export default function PageHero() {
    const pathname = usePathname();
    const current = NAV_ITEMS.find(item =>
        item.exact ? pathname === item.href : pathname.startsWith(item.href)
    );

    if (!current) return null;

    const { label, Icon, color } = current;
    const subtitle = PAGE_SUBTITLES[current.href] ?? "";

    return (
        <div style={{
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(135deg, ${hexToRgba(color, 0.18)} 0%, ${hexToRgba(color, 0.05)} 60%, rgba(8,9,13,0.9) 100%)`,
            border: `1px solid ${hexToRgba(color, 0.2)}`,
            borderRadius: 16,
            padding: "24px 28px",
            marginBottom: 20,
        }}>
            {/* Grid overlay */}
            <div style={{
                position: "absolute", inset: 0, opacity: 0.06,
                backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`,
                backgroundSize: "20px 20px",
                pointerEvents: "none",
            }} />

            {/* Hero content */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
                <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: `linear-gradient(135deg, ${hexToRgba(color, 0.3)}, ${hexToRgba(color, 0.1)})`,
                    border: `1px solid ${hexToRgba(color, 0.25)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                }}>
                    <Icon size={28} style={{ color }} />
                </div>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", margin: 0, lineHeight: 1.2 }}>{label}</h1>
                    {subtitle && (
                        <p style={{ fontSize: 13, color: hexToRgba(color, 0.7), margin: 0, marginTop: 4, fontWeight: 500 }}>{subtitle}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
