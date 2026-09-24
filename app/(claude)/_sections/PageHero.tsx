"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS, NAV_SECTIONS } from "./ClaudeSidebarNav";

const PAGE_SUBTITLES: Record<string, string> = {
    "/dashboard": "Dashboard & monitoring",
    "/global":   "Identity, rules & instructions",
    "/settings": "settings.json & settings.local.json",
    "/mcp":      "MCP server connections",
    "/plugins":  "Installed plugins & extensions",
    "/cli":      "Built-in CLI tools",
    "/skills":   "Skills & capabilities",
    "/commands": "Slash commands",
    "/hooks":    "Event hooks & automation",
    "/extensions": "Hooks, commands & plugins",
    "/sessions": "Active & past sessions",
    "/agents":   "Background agents, peers, tool logs",
    "/tokens":   "Token usage & cost tracking",
    "/usage":    "Per-model spend breakdown in exact USD",
    "/jev":      "Router hook activity - per message, per session, per day",
    "/rag":              "Personal knowledge base & retrieval",
    "/rag/documents":    "All indexed documents",
    "/rag/search":       "Search your knowledge base",
    "/rag/preferences":  "Extracted preferences & patterns",
    "/monitor":  "App process monitor",
    "/monitor/crons": "24-hour automation schedule",
    "/monitor/gallery": "App screenshots & GIFs",
};

export default function PageHero() {
    const pathname = usePathname();
    // Check sub-pages first (e.g. /rag/documents), then parent items
    let current = NAV_ITEMS.find(item =>
        item.exact ? pathname === item.href : pathname.startsWith(item.href)
    );

    // For sub-pages, find the child match and use parent's icon/color but child's label
    let displayLabel = current?.label ?? "";
    let displaySubtitle = PAGE_SUBTITLES[pathname] ?? PAGE_SUBTITLES[current?.href ?? ""] ?? "";

    if (current?.children && pathname !== current.href) {
        const child = current.children.find(c => pathname === c.href);
        if (child) displayLabel = `${current.label} / ${child.label}`;
    }

    if (!current) return null;

    const { Icon, color } = current;

    return (
        <div style={{
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 60%, rgba(8,9,13,0.9) 100%)`,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: "24px 28px",
            marginBottom: 20,
        }}>
            {/* Grid overlay - brightens on parent hover */}
            <div className="hero-dots" style={{
                position: "absolute", inset: 0, opacity: 0.04,
                backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
                pointerEvents: "none",
                transition: "opacity 0.3s",
            }} />
            <style>{`div:has(> .hero-dots):hover .hero-dots { opacity: 0.12 !important; }`}</style>

            {/* Hero content */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", flexWrap: "wrap" }}>
                <Icon size={32} style={{ color, flexShrink: 0 }} />
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", margin: 0, lineHeight: 1.2 }}>{displayLabel}</h1>
                    {displaySubtitle && (
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.52)", margin: 0, marginTop: 4, fontWeight: 500 }}>{displaySubtitle}</p>
                    )}
                </div>
                {/* Right-side slot — pages portal page-specific controls here (e.g. Context mode picker) */}
                <div id="page-hero-slot" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }} />
            </div>
        </div>
    );
}
