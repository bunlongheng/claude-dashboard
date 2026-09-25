"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, FolderOpen, Coins, DollarSign,
    BookOpen, Settings,
    Sparkles, Terminal, Blocks, Server, SquareTerminal,
    Menu, X, ChevronDown, ChevronLeft, ChevronRight, Monitor, PanelLeftClose, PanelLeftOpen,
    Bot,
    Search, DatabaseZap, FileText, SlidersHorizontal, Wand2,
} from "lucide-react";
import JevMark, { JEV_PINK } from "./JevMark";
import { MACHINES, MACHINE_COLORS, ACCENT, fmtCompact, type ProjectSessions } from "./shared";
import { CLI_ICON_MAP } from "./cliIcons";
import { RAG_ENABLED } from "@/lib/features";

const CLI_TOOL_COUNT = Object.keys(CLI_ICON_MAP).length;
import { useMachine } from "./MachineContext";
import QrLanModal from "./QrLanModal";
import SearchModal from "./SearchModal";

type NavItem = {
    href: string; label: string; Icon: React.ElementType;
    exact: boolean; color: string;
    children?: { href: string; label: string; Icon: React.ElementType; color: string }[];
};
type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
    { label: "", items: [
        { href: "/dashboard", label: "Overview",  Icon: LayoutDashboard, exact: true,  color: "#ffffff" },
        { href: "/agents",   label: "Agents",    Icon: Bot,             exact: false, color: "#ffffff" },
    ]},
    { label: "Memory", items: [
        // RAG + local vector search are opt-in (NEXT_PUBLIC_RAG_ENABLED=1).
        ...(RAG_ENABLED ? [
            { href: "/rag",      label: "RAG",       Icon: DatabaseZap,     exact: false, color: "#FF3B30" },
        ] : []),
        { href: "/global",   label: "CLAUDE.md", Icon: BookOpen,        exact: false, color: "#FF9500" },
    ]},
    { label: "Config", items: [
        { href: "/mcp",      label: "MCP",       Icon: Server,          exact: false, color: "#FFCC00" },
        { href: "/skills",   label: "Skills",    Icon: Sparkles,        exact: false, color: "#8AC249" },
        { href: "/cli",      label: "CLI",       Icon: SquareTerminal,  exact: false, color: "#34C759" },
        { href: "/extensions", label: "Extensions", Icon: Blocks,        exact: false, color: "#30D158" },
        { href: "/settings", label: "Settings",  Icon: Settings,        exact: false, color: "#5AC8FA" },
    ]},
    { label: "Activity", items: [
        { href: "/sessions", label: "Sessions",  Icon: FolderOpen,      exact: false, color: "#007AFF" },
        { href: "/tokens",   label: "Tokens",    Icon: Coins,           exact: false, color: "#5856D6" },
        { href: "/jev",      label: "Jev",       Icon: JevMark,         exact: false, color: JEV_PINK },
        { href: "/usage",    label: "Usage",     Icon: DollarSign,      exact: false, color: "#FF6347" },
    ]},
];

// Flat list for badge lookups
export const NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

function NavItem({ href, label, Icon, exact, color, pathname, onClose, badge, collapseLevel }: {
    href: string; label: string; Icon: React.ElementType;
    exact: boolean; color: string; pathname: string; onClose?: () => void; badge?: number | string;
    collapseLevel?: 0 | 1 | 2;
}) {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    const [hovered, setHovered] = useState(false);
    const level = collapseLevel ?? 0;
    const iconOnly = level >= 2;
    return (
        <Link
            href={href}
            onClick={onClose}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={iconOnly ? label : undefined}
            style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: iconOnly ? "8px" : "8px 10px", borderRadius: 8, marginBottom: 2,
                justifyContent: iconOnly ? "center" : "flex-start",
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? color : hovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)",
                background: isActive ? `${color}10` : hovered ? "rgba(255,255,255,0.04)" : "transparent",
                border: isActive ? `1px solid rgba(255,255,255,0.15)` : "1px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s ease",
            }}
        >
            <Icon size={16} style={{ flexShrink: 0, color }} />
            {!iconOnly && (
                <span style={{ flex: 1 }}>
                    <span style={{
                        display: "inline",
                        color: hovered && !isActive ? color : undefined,
                        backgroundImage: hovered && !isActive ? `linear-gradient(${color}, ${color})` : "none",
                        backgroundSize: hovered && !isActive ? "100% 1.5px" : "0% 1.5px",
                        backgroundPosition: "left bottom",
                        backgroundRepeat: "no-repeat",
                        paddingBottom: 2,
                        transition: "background-size 1s ease, color 1s ease",
                    }}>{label}</span>
                </span>
            )}
            {level < 1 && badge != null && badge !== 0 && badge !== "" && (
                <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                    background: `${color}20`, color, lineHeight: "14px", minWidth: 18, textAlign: "center",
                }}>{badge}</span>
            )}
        </Link>
    );
}

function SidebarContent({ pathname, onClose, badges, onSearchClick, isLocalMachine, collapseLevel, onToggleCollapse }: {
    pathname: string; onClose?: () => void; badges: Record<string, number | string>; onSearchClick?: () => void; isLocalMachine?: boolean;
    collapseLevel?: 0 | 1 | 2; onToggleCollapse?: () => void;
}) {
    const level = collapseLevel ?? 0;
    const iconOnly = level >= 2;
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Header */}
            <div style={{ padding: iconOnly ? "16px 8px 12px" : "16px 12px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: iconOnly ? "center" : "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ position: "relative", width: 20, height: 20, flexShrink: 0 }}>
                            <Image src="/claude-logo.png" alt="Claude" width={20} height={20} className="claude-jump" style={{ imageRendering: "pixelated", display: "block" }} />
                            <div className="claude-smoke" />
                        </div>
                        {!iconOnly && (
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#ffffff", textTransform: "uppercase" }}>CLAUDE</span>
                        )}
                    </div>
                    {!iconOnly && onClose && (
                        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.52)", display: "flex" }}>
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Nav */}
            <nav style={{ padding: "8px 8px", flex: 1, overflowY: "auto" }}>
                {NAV_SECTIONS.map((section, si) => (
                    <div key={si}>
                        {section.label && !iconOnly && (
                            <div style={{
                                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                                color: "rgba(255,255,255,0.5)", padding: "10px 10px 4px",
                                marginTop: si > 0 ? 4 : 0,
                            }}>{section.label}</div>
                        )}
                        {section.items.map(item => {
                            const hasChildren = !!item.children;
                            const isRagActive = hasChildren && pathname.startsWith(item.href);
                            const isLocal = isLocalMachine !== false;
                            return (
                                <div key={item.href}>
                                    <NavItem {...item} pathname={pathname} onClose={hasChildren ? undefined : onClose} badge={badges[item.href]} collapseLevel={level} />
                                    {!iconOnly && hasChildren && isLocal && (isRagActive || pathname === item.href) && (
                                        <div style={{ paddingLeft: 20, marginBottom: 4 }}>
                                            {item.children!.map((child) => {
                                                const childActive = pathname === child.href;
                                                return (
                                                    <Link key={child.href} href={child.href} onClick={onClose}
                                                        style={{
                                                            display: "flex", alignItems: "center", gap: 7,
                                                            padding: "5px 10px", borderRadius: 6, marginBottom: 1,
                                                            fontSize: 11, fontWeight: childActive ? 600 : 400,
                                                            color: childActive ? "#ffffff" : "rgba(255,255,255,0.5)",
                                                            background: childActive ? `${child.color}12` : "transparent",
                                                            textDecoration: "none", transition: "all 0.12s",
                                                        }}>
                                                        <child.Icon size={12} style={{ color: child.color, opacity: childActive ? 1 : 0.5 }} />
                                                        {child.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Bottom utility rail: LAN QR, Search, Collapse */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
                <QrLanModal iconOnly={iconOnly} />
                {onSearchClick && (
                    <button
                        onClick={onSearchClick}
                        title="Search (⌘K)"
                        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer hover:bg-white/5"
                        style={{ color: "rgba(255,255,255,0.5)", background: "none", border: "none", justifyContent: iconOnly ? "center" : "flex-start" }}
                    >
                        <Search size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
                        {!iconOnly && <span>Search</span>}
                    </button>
                )}
                {onToggleCollapse && (
                    <button
                        onClick={onToggleCollapse}
                        title={level === 0 ? "Hide badges" : level === 1 ? "Icon only" : "Show all"}
                        className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer hover:bg-white/5"
                        style={{ color: "rgba(255,255,255,0.5)", background: "none", border: "none", justifyContent: iconOnly ? "center" : "flex-start" }}
                    >
                        {iconOnly
                            ? <PanelLeftOpen size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
                            : <PanelLeftClose size={14} style={{ color: "rgba(255,255,255,0.5)" }} />}
                        {!iconOnly && <span>{level === 0 ? "Hide badges" : "Icon only"}</span>}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function ClaudeSidebarNav() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [mobileDD, setMobileDD] = useState(false);
    const mobileDDRef = useRef<HTMLDivElement>(null);
    const { machine, setMachine, machines, apiBase } = useMachine();
    const [badges, setBadges] = useState<Record<string, number | string>>({});
    const [collapseLevel, setCollapseLevel] = useState<0 | 1 | 2>(0);

    // Auto-collapse as the window narrows relative to the full screen:
    // < 50% of screen width -> icons only (level 2)
    // < 60% of screen width -> hide badges (level 1)
    // otherwise              -> full (level 0)
    // A manual toggle persists until the next resize crosses a new threshold.
    useEffect(() => {
        if (typeof window === "undefined") return;
        let lastAuto: 0 | 1 | 2 | null = null;
        const apply = () => {
            const screenW = window.screen?.width || window.innerWidth;
            const ratio = window.innerWidth / screenW;
            const auto: 0 | 1 | 2 = ratio < 0.5 ? 2 : ratio < 0.6 ? 1 : 0;
            if (auto !== lastAuto) { lastAuto = auto; setCollapseLevel(auto); }
        };
        apply();
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, []);

    const cycleCollapse = () => setCollapseLevel(((collapseLevel + 1) % 3) as 0 | 1 | 2);

    const sidebarWidth = collapseLevel === 0 ? 200 : collapseLevel === 1 ? 170 : 56;

    // Fetch badge counts. null + the local machine both map to "local", so the
    // fetch runs once even as the machine context settles on mount (no double
    // load); only a real remote switch re-fetches.
    const selectedMachine = machines.find(m => m.id === machine);
    const isRemoteMachine = !!selectedMachine && !selectedMachine.isLocal;
    const badgeKey = isRemoteMachine ? String(machine) : "local";
    useEffect(() => {
        // apiBase already routes to the right host; the legacy `?machine=` query
        // makes the remote try to proxy to itself and returns empty - drop it here.
        // `cache: 'no-store'` so switching the dropdown bypasses the disk cache
        // on the browser side; otherwise badges can pin to the first machine the
        // tab ever fetched.
        const opts = { cache: "no-store" as RequestCache };
        Promise.all([
            fetch(apiBase("/api/claude/sessions"), opts).then(r => r.json()).catch(() => ({ projects: [] })),
            fetch(apiBase("/api/claude/skills?slim=1"), opts).then(r => r.json()).catch(() => ({ summary: {} })),
            fetch(apiBase("/api/claude/brain?slim=1"), opts).then(r => r.json()).catch(() => ({ categoryCounts: {}, globalRules: [], totalFiles: 0 })),
            fetch(apiBase("/api/claude/token-stats/daily"), opts).then(r => r.json()).catch(() => ({ daily: [] })),
            fetch(apiBase("/api/rag/stats"), opts).then(r => r.json()).catch(() => ({ documents: 0 })),
            fetch(apiBase("/api/claude/jev?days=1"), opts).then(r => r.json()).catch(() => ({ daily: [] })),
        ]).then(([sessions, skills, brain, tokens, rag, jev]) => {
            // The badge is calls *today*, so read the day bucket rather than the
            // rolling 24 h total the days=1 window returns.
            const todayKey = new Date().toLocaleDateString("en-CA");
            const jevToday = (jev.daily ?? []).find((d: { day: string }) => d.day === todayKey);
            const jevCalls = jevToday ? jevToday.routed + jevToday.skipped + jevToday.errors : 0;
            const totalSessions = (sessions.projects ?? []).reduce((sum: number, p: ProjectSessions) => sum + (p.sessions?.length ?? 0), 0);
            const totalTokens = (tokens.daily ?? []).reduce((s: number, d: { input?: number; output?: number }) => s + (d.input ?? 0) + (d.output ?? 0), 0);
            setBadges(prev => ({
                ...prev,
                "/dashboard": brain.totalProjects ?? 0,
                "/global": skills.summary?.claudeMd ?? 0,
                "/mcp": skills.summary?.mcp ?? 0,
                "/cli": CLI_TOOL_COUNT,
                "/skills": skills.summary?.skills ?? 0,
                "/extensions": (skills.summary?.hooks ?? 0) + (skills.summary?.commands ?? 0) + (skills.summary?.plugins ?? 0),
                "/sessions": totalSessions,
                "/tokens": fmtCompact(totalTokens),
                "/settings": skills.summary?.settings ?? 0,
                "/rag": rag.documents ?? 0,
                "/jev": jevCalls,
            }));
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [badgeKey]);

    // /agents badge is just the machine count (no fetch) — derived at render time
    // instead of synced back into `badges` via an effect.
    const displayBadges = useMemo(() => ({ ...badges, "/agents": machines.length || 0 }), [badges, machines.length]);

    // Close the mobile drawer/dropdown on navigation. Adjusted during render
    // (React's documented pattern for resetting state when a prop changes)
    // rather than via an effect, so it doesn't cause an extra commit.
    const [prevPathname, setPrevPathname] = useState(pathname);
    if (pathname !== prevPathname) {
        setPrevPathname(pathname);
        setOpen(false);
        setMobileDD(false);
    }

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (mobileDDRef.current && !mobileDDRef.current.contains(e.target as Node)) setMobileDD(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const mColor = machine ? MACHINE_COLORS[machine] : ACCENT;
    const mLabel = machine ?? "All";

    const openSearch = () => window.dispatchEvent(new Event("open-search"));

    return (
        <>
            <style>{`
                @keyframes navShake {
                    0% { transform: rotate(0); }
                    20% { transform: rotate(-14deg); }
                    40% { transform: rotate(10deg); }
                    60% { transform: rotate(-6deg); }
                    80% { transform: rotate(3deg); }
                    100% { transform: rotate(0); }
                }
            `}</style>
            <SearchModal />
            {/* Desktop sidebar */}
            <aside className="hidden md:flex" style={{
                width: sidebarWidth, minWidth: sidebarWidth, background: "#111118",
                borderRight: "1px solid rgba(255,255,255,0.05)", flexDirection: "column",
                position: "sticky", top: 0, height: "100vh", overflow: "hidden",
                transition: "width 0.18s ease, min-width 0.18s ease",
            }}>
                <SidebarContent pathname={pathname} badges={displayBadges} onSearchClick={openSearch} isLocalMachine={machines.find(m => m.id === machine)?.isLocal ?? true} collapseLevel={collapseLevel} onToggleCollapse={cycleCollapse} />
            </aside>

            {/* Mobile top bar */}
            <div className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 z-40"
                style={{ background: "#111118", borderColor: "rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Image src="/claude-logo.png" alt="Claude" width={20} height={20} style={{ imageRendering: "pixelated" }} />
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#ffffff", textTransform: "uppercase" }}>CLAUDE</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Machine switch lives in the content-area top bar (one place, all sizes) */}
                    <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.7)", display: "flex" }}>
                        <Menu size={20} />
                    </button>
                </div>
            </div>

            {/* Mobile drawer */}
            {open && (
                <div className="md:hidden fixed inset-0 z-50" onClick={() => setOpen(false)}
                    style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}>
                    <aside onClick={e => e.stopPropagation()}
                        style={{ width: 240, height: "100%", background: "#111118", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
                        <SidebarContent pathname={pathname} onClose={() => setOpen(false)} badges={displayBadges} onSearchClick={openSearch} isLocalMachine={machines.find(m => m.id === machine)?.isLocal ?? true} />
                    </aside>
                </div>
            )}
        </>
    );
}
