"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, FolderOpen, Coins,
    ShieldCheck, BookOpen, Settings,
    Brain, Sparkles, Terminal, Webhook, Server, Puzzle,
    Menu, X, ChevronDown, Monitor, LogOut,
    Activity, Clock,
    Wand2, Search,
} from "lucide-react";
import { MACHINES, MACHINE_COLORS, ACCENT } from "./shared";
import { useMachine } from "./MachineContext";
import { signOut } from "@/app/actions";
import QrLanModal from "./QrLanModal";
import SearchModal from "./SearchModal";

export const NAV_ITEMS = [
    { href: "/dashboard", label: "Overview",  Icon: LayoutDashboard, exact: true,  color: "#f97316" },
    // ── Load order: what Claude reads at startup ──
    { href: "/global",   label: "CLAUDE.md", Icon: BookOpen,        exact: false, color: "#8b5cf6" },
    { href: "/brain",    label: "Memory",    Icon: Brain,           exact: false, color: "#eab308" },
    { href: "/rules",    label: "Rules",     Icon: ShieldCheck,     exact: false, color: "#14b8a6" },
    { href: "/mcp",      label: "MCP",       Icon: Server,          exact: false, color: "#10b981" },
    { href: "/plugins",  label: "Plugins",   Icon: Puzzle,          exact: false, color: "#8b5cf6" },
    { href: "/skills",   label: "Skills",    Icon: Sparkles,        exact: false, color: "#06b6d4" },
    { href: "/commands", label: "Commands",  Icon: Terminal,        exact: false, color: "#f472b6" },
    { href: "/hooks",    label: "Hooks",     Icon: Webhook,         exact: false, color: "#a3e635" },
    // ── Runtime ──
    { href: "/sessions", label: "Sessions",  Icon: FolderOpen,      exact: false, color: "#22c55e" },
    { href: "/tokens",   label: "Tokens",    Icon: Coins,           exact: false, color: "#f59e0b" },
    { href: "/settings", label: "Settings",  Icon: Settings,        exact: false, color: "#6b7280" },
    // ── Insights ──
    { href: "/health",    label: "Health",    Icon: Activity,        exact: false, color: "#22c55e" },
    { href: "/timeline",  label: "Timeline",  Icon: Clock,           exact: false, color: "#06b6d4" },
];

function NavItem({ href, label, Icon, exact, color, pathname, onClose, badge }: {
    href: string; label: string; Icon: React.ElementType;
    exact: boolean; color: string; pathname: string; onClose?: () => void; badge?: number;
}) {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    return (
        <Link
            href={href}
            onClick={onClose}
            style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 10px", borderRadius: 8, marginBottom: 2,
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? "#ffffff" : "rgba(255,255,255,0.45)",
                background: isActive ? `${color}15` : "transparent",
                border: isActive ? `1px solid ${color}60` : "1px solid transparent",
                textDecoration: "none",
                transition: "background 0.12s, color 0.12s",
            }}
        >
            <Icon size={16} style={{ flexShrink: 0, color }} />
            <span style={{ flex: 1 }}>{label}</span>
            {badge != null && badge > 0 && (
                <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                    background: `${color}20`, color, lineHeight: "14px", minWidth: 18, textAlign: "center",
                }}>{badge}</span>
            )}
        </Link>
    );
}

function SidebarContent({ pathname, onClose, badges, onSearchClick }: {
    pathname: string; onClose?: () => void; badges: Record<string, number>; onSearchClick?: () => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Header */}
            <div style={{ padding: "16px 12px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ position: "relative", width: 20, height: 20, flexShrink: 0 }}>
                            <img src="/claude-logo.png" alt="Claude" width={20} height={20} className="claude-jump" style={{ imageRendering: "pixelated", display: "block" }} />
                            <div className="claude-smoke" />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#ffffff", textTransform: "uppercase" }}>CLAUDE</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                            onClick={onSearchClick}
                            title="Search (⌘K)"
                            className="sidebar-search-btn"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 24, height: 24, borderRadius: 6,
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                cursor: "pointer", color: "rgba(255,255,255,0.35)",
                                transition: "background 0.12s, color 0.12s",
                            }}
                        >
                            <Search size={13} />
                        </button>
                        {onClose && (
                            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.4)", display: "flex" }}>
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Nav - all items at same level */}
            <nav style={{ padding: "8px 8px", flex: 1, overflowY: "auto" }}>
                {NAV_ITEMS.map(item => (
                    <NavItem key={item.href} {...item} pathname={pathname} onClose={onClose} badge={badges[item.href]} />
                ))}
            </nav>

            {/* LAN QR + Logout */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <QrLanModal />
                <button
                    onClick={() => signOut()}
                    className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer hover:bg-white/5"
                    style={{ color: "rgba(255,255,255,0.35)", background: "none", border: "none" }}
                >
                    <LogOut size={14} style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span>Sign out</span>
                </button>
            </div>
        </div>
    );
}

export default function ClaudeSidebarNav() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [mobileDD, setMobileDD] = useState(false);
    const mobileDDRef = useRef<HTMLDivElement>(null);
    const { machine, setMachine } = useMachine();
    const [badges, setBadges] = useState<Record<string, number>>({});

    // Fetch badge counts - re-fetch when machine changes
    useEffect(() => {
        const q = machine ? `?machine=${machine}` : "";
        Promise.all([
            fetch(`/api/claude/sessions${q}`).then(r => r.json()).catch(() => ({ projects: [] })),
            fetch(`/api/claude/skills${q}`).then(r => r.json()).catch(() => ({ summary: {} })),
            fetch("/api/claude/brain").then(r => r.json()).catch(() => ({ categoryCounts: {}, globalRules: [], totalFiles: 0 })),
            fetch("/api/claude/token-stats").then(r => r.json()).catch(() => ({ totals: { sessions: 0 } })),
            fetch("/api/claude/health").then(r => r.json()).catch(() => ({ projects: [] })),
            fetch("/api/claude/memory-timeline").then(r => r.json()).catch(() => ({ timeline: [] })),
        ]).then(([sessions, skills, brain, tokens, health, timeline]) => {
            const totalSessions = (sessions.projects ?? []).reduce((sum: number, p: any) => sum + (p.sessions?.length ?? 0), 0);
            setBadges({
                "/dashboard": brain.totalProjects ?? 0,
                "/global": skills.summary?.claudeMd ?? 0,
                "/brain": brain.categoryCounts?.memory ?? brain.totalFiles ?? 0,
                "/rules": (brain.globalRules ?? []).length,
                "/mcp": skills.summary?.mcp ?? 0,
                "/plugins": skills.summary?.plugins ?? 0,
                "/skills": skills.summary?.skills ?? 0,
                "/commands": skills.summary?.commands ?? 0,
                "/hooks": skills.summary?.hooks ?? 0,
                "/sessions": totalSessions,
                "/tokens": tokens.totals?.session_count ?? tokens.tokens?.length ?? 0,
                "/settings": (skills.settings ? Object.keys(skills.settings).length : 0) + (skills.localSettings ? Object.keys(skills.localSettings).length : 0),
                "/health": (health.projects ?? []).length,
                "/timeline": (timeline.timeline ?? []).length,
            });
        });
    }, [machine]);

    useEffect(() => { setOpen(false); setMobileDD(false); }, [pathname]);

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
            <SearchModal />
            {/* Desktop sidebar */}
            <aside className="hidden md:flex" style={{
                width: 200, minWidth: 200, background: "#111118",
                borderRight: "1px solid rgba(255,255,255,0.05)", flexDirection: "column",
            }}>
                <SidebarContent pathname={pathname} badges={badges} onSearchClick={openSearch} />
            </aside>

            {/* Mobile top bar */}
            <div className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 z-40"
                style={{ background: "#111118", borderColor: "rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <img src="/claude-logo.png" alt="Claude" width={20} height={20} style={{ imageRendering: "pixelated" }} />
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: "#ffffff", textTransform: "uppercase" }}>CLAUDE</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Machine dropdown (mobile) */}
                    <div ref={mobileDDRef} style={{ position: "relative" }}>
                        <button onClick={() => setMobileDD(!mobileDD)}
                            style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                                background: `${mColor}15`, border: `1px solid ${mColor}40`, color: mColor,
                                cursor: "pointer",
                            }}>
                            <Monitor size={11} />
                            <span>{mLabel}</span>
                            <ChevronDown size={10} style={{ opacity: 0.6, transform: mobileDD ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                        </button>
                        {mobileDD && (
                            <div style={{
                                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                                background: "#14151a", border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 8, padding: 3, minWidth: 110, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                            }}>
                                {[{ label: "All", val: null as string | null }, ...MACHINES.map(m => ({ label: m, val: m as string | null }))].map(({ label, val }) => {
                                    const active = machine === val;
                                    const color = val ? MACHINE_COLORS[val] : ACCENT;
                                    return (
                                        <button key={label} onClick={() => { setMachine(val); setMobileDD(false); }}
                                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-[10px] font-semibold transition-colors cursor-pointer"
                                            style={{ background: active ? `${color}15` : "transparent", color: active ? color : "rgba(255,255,255,0.5)" }}>
                                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                            <span style={{ flex: 1 }}>{label}</span>
                                            {active && <span style={{ fontSize: 9 }}>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
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
                        <SidebarContent pathname={pathname} onClose={() => setOpen(false)} badges={badges} onSearchClick={openSearch} />
                    </aside>
                </div>
            )}
        </>
    );
}
