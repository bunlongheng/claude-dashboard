"use client";

import { SECTION_COLORS } from "./sectionColors";
import {
    CpuChipIcon,
    DocumentTextIcon,
    FireIcon,
    CursorArrowRaysIcon,
    SwatchIcon,
    BoltIcon,
    ChartBarIcon,
    ShieldCheckIcon,
    SparklesIcon,
    CircleStackIcon,
    LockClosedIcon,
    Squares2X2Icon,
} from "@heroicons/react/24/outline";

export const ACCENT = SECTION_COLORS.claude;

// ─── Types ───────────────────────────────────────────────────────────────────
export type HistoryEntry = { display: string; timestamp: number; project?: string; sessionId?: string };
export type Note = { id: string; title: string; content: string; folder_color: string; created_at: string };
export type Token = { session_id: string; project?: string; model?: string; machine?: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; prompt_count: number };
export type GlobalInstruction = { id: string; category: string; title: string; instruction: string; source: string; project?: string; confidence: number; last_used_at: string | null; violations_count: number; created_at: string; updated_at: string };
export type Interval = "today" | "7d" | "1m" | "all";
export type DrillTarget = "prompts" | "sessions" | "projects" | "tokens" | null;

export type SessionEntry = { id: string; filePath: string; sizeBytes: number; sizeLabel: string; lines: number; customTitle: string | null; title: string; createdAt: string; updatedAt: string; stale: boolean };
export type ProjectSessions = { project: string; path: string; sessions: SessionEntry[] };

// ─── Tab color palette ───────────────────────────────────────────────────────
export const TAB_PALETTE = ["#f97316","#22c55e","#eab308","#3b82f6","#ef4444","#f97316","#ec4899","#06b6d4","#14b8a6","#f59e0b","#84cc16","#f97316"];
export function tabColor(sessionId: string): string {
    let h = 0;
    for (let i = 0; i < sessionId.length; i++) h = Math.imul(31, h) + sessionId.charCodeAt(i) | 0;
    return TAB_PALETTE[Math.abs(h) % TAB_PALETTE.length];
}

// ─── Agents ──────────────────────────────────────────────────────────────────
export const AGENTS = [
    { id: 1,  name: "Snow",   role: "Orchestrator",  color: "#ffffff", status: "online",  Icon: DocumentTextIcon      },
    { id: 2,  name: "Blaze",  role: "Architecture",  color: "#ff3333", status: "online",  Icon: FireIcon              },
    { id: 3,  name: "Arrow",  role: "UX / QA",       color: "#ff66cc", status: "online",  Icon: CursorArrowRaysIcon   },
    { id: 4,  name: "Venus",  role: "UI / Branding", color: "#ff8800", status: "online",  Icon: SwatchIcon            },
    { id: 5,  name: "Zap",    role: "Performance",   color: "#ffdd00", status: "online",  Icon: BoltIcon              },
    { id: 6,  name: "Frost",  role: "Metrics",       color: "#00ffff", status: "online",  Icon: ChartBarIcon          },
    { id: 7,  name: "Blitz",  role: "Code Quality",  color: "#0099ff", status: "online",  Icon: ShieldCheckIcon       },
    { id: 8,  name: "Earth",  role: "Cleanup",       color: "#00ff00", status: "standby", Icon: SparklesIcon          },
    { id: 9,  name: "Pulse",  role: "Automation",    color: "#9933ff", status: "standby", Icon: CpuChipIcon           },
    { id: 10, name: "Sand",   role: "Storage",       color: "#cc6633", status: "standby", Icon: CircleStackIcon       },
    { id: 11, name: "Shadow", role: "Security",      color: "#999999", status: "online",  Icon: LockClosedIcon        },
    { id: 12, name: "Rock",   role: "Dashboard",     color: "#7a7a7a", status: "standby", Icon: Squares2X2Icon        },
] as const;

export const STATUS_COLORS = { online: "#22c55e", standby: "#eab308", offline: "#6b7280" } as const;

// ─── Agent Details ────────────────────────────────────────────────────────────
export type AgentDetail = { description: string; responsibilities: string[]; iconPrompt: string };
export const AGENT_DETAILS: Record<string, AgentDetail> = {
    "Snow": {
        description: "The master orchestrator of Snow Prime. Snow receives high-level goals, decomposes them into tasks, and delegates work across all 12 specialist agents. Every major decision passes through Snow.",
        responsibilities: [
            "Receive goals from the user and decompose into sub-tasks",
            "Assign work to the right specialist agents",
            "Track in-progress work and resolve blockers",
            "Synthesize outputs from all agents into coherent results",
            "Final review before any deployment or delivery",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Snow" - Orchestrator.\n• Color: Pure white #ffffff glow on jet-black\n• Symbol: Geometric snowflake with 12 radiating spokes, each tip a node representing a sub-agent\n• Style: Flat vector, clean hub-and-spoke pattern, ultra-futuristic\n• Mood: Calm authority, all-seeing command center\n• Size: 512×512 PNG, black bg, no text`,
    },
    "Blaze": {
        description: "Blaze owns the technical architecture of every system. It designs data models, defines API contracts, enforces service boundaries, and ensures the codebase scales long-term.",
        responsibilities: [
            "Design system architecture and component structure",
            "Define API contracts and data schemas",
            "Review PRs for architectural violations",
            "Enforce separation of concerns and SOLID principles",
            "Document architectural decisions (ADRs)",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Blaze" - Architecture.\n• Color: Fire red #ff3333, ember glow on dark background\n• Symbol: A flame morphing into a structured hexagonal architecture diagram\n• Style: Sharp geometric edges, red-to-orange gradient, clean vector\n• Mood: Intense, structured, foundational power\n• Size: 512×512 PNG, black bg, no text`,
    },
    "Arrow": {
        description: "Arrow is the user's advocate. It runs accessibility audits, writes E2E and unit tests, validates user flows, and ensures every interaction is intuitive and bug-free before it ships.",
        responsibilities: [
            "Write and maintain unit, integration, and E2E tests",
            "Run accessibility (a11y) audits with axe / Lighthouse",
            "Identify UX friction points and propose fixes",
            "Validate responsive layouts on all breakpoints",
            "File detailed bug reports with reproduction steps",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Arrow" - UX / QA.\n• Color: Hot pink #ff66cc on dark background\n• Symbol: A sleek cursor arrow intersecting a target crosshair\n• Style: Minimal, sharp, motion-forward - arrow should feel precise and fast\n• Mood: Focused, user-centered, meticulous\n• Size: 512×512 PNG, dark bg, no text`,
    },
    "Venus": {
        description: "Venus defines how everything looks and feels. It owns the design system, color tokens, typography, component styling, and brand voice - ensuring every pixel is intentional.",
        responsibilities: [
            "Maintain the design system (colors, typography, spacing)",
            "Craft component UI with Tailwind and CSS",
            "Define brand identity and visual language",
            "Review UI for consistency across all pages",
            "Generate mockups and design explorations",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Venus" - UI / Branding.\n• Color: Warm orange #ff8800, rich sunset tones\n• Symbol: Artist's palette transforming into a color-wheel constellation\n• Style: Soft gradients, flowing curves, vibrant but refined\n• Mood: Creative, aesthetic-forward, sensual beauty\n• Size: 512×512 PNG, dark bg, no text`,
    },
    "Zap": {
        description: "Zap obsesses over speed. It measures Core Web Vitals, optimizes bundle sizes, eliminates render-blocking resources, and ensures the site scores 100 on every Lighthouse metric.",
        responsibilities: [
            "Audit bundle sizes and eliminate dead code",
            "Optimize images, fonts, and static assets",
            "Profile runtime performance and fix bottlenecks",
            "Enforce Core Web Vitals: LCP, FID, CLS",
            "Configure caching strategies and CDN rules",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Zap" - Performance.\n• Color: Electric yellow #ffdd00, lightning energy\n• Symbol: Lightning bolt composed of speed lines and circuit traces\n• Style: Sharp, kinetic, high-contrast yellow on black\n• Mood: Fast, electric, unstoppable kinetic force\n• Size: 512×512 PNG, black bg, no text`,
    },
    "Frost": {
        description: "Frost tracks everything that matters. It instruments analytics, builds dashboards, monitors uptime, and surfaces the insights that drive all product decisions.",
        responsibilities: [
            "Instrument analytics events (pageviews, clicks, conversions)",
            "Build real-time dashboards and charts",
            "Monitor error rates, uptime, and performance metrics",
            "Alert on anomalies and threshold breaches",
            "Produce weekly / monthly insight reports",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Frost" - Metrics.\n• Color: Cyan #00ffff, icy data streams\n• Symbol: Bar chart composed of crystalline ice shards, data rising upward\n• Style: Cold, precise, glassy - crystalline geometric patterns\n• Mood: Analytical, cool intelligence, data-driven clarity\n• Size: 512×512 PNG, deep dark bg, no text`,
    },
    "Blitz": {
        description: "Blitz is the code quality guardian. It enforces linting rules, runs static analysis, reviews logic for edge cases, and ensures every PR meets the quality bar before merge.",
        responsibilities: [
            "Run ESLint, TypeScript strict checks, and Prettier",
            "Review code for logic bugs, edge cases, anti-patterns",
            "Enforce test coverage thresholds",
            "Flag security issues like XSS, injection, exposed secrets",
            "Provide actionable PR review comments",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Blitz" - Code Quality.\n• Color: Electric blue #0099ff on dark background\n• Symbol: Shield with a checkmark inside, overlaid with code brackets\n• Style: Solid, protective, technical - angular shield with circuit details\n• Mood: Vigilant, trustworthy, zero-tolerance for bugs\n• Size: 512×512 PNG, dark bg, no text`,
    },
    "Earth": {
        description: "Earth keeps the codebase clean and healthy. It removes dead code, refactors legacy patterns, updates dependencies, and eliminates technical debt before it compounds.",
        responsibilities: [
            "Identify and remove unused files, imports, and variables",
            "Refactor legacy code to modern patterns",
            "Run npm audit and update outdated dependencies",
            "Simplify over-engineered abstractions",
            "Maintain consistent code formatting across the repo",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Earth" - Cleanup.\n• Color: Fresh green #00ff00 on dark background\n• Symbol: A leaf sprouting from a circuit board, clean and growing\n• Style: Organic meets technical, rounded shapes, nature-inspired\n• Mood: Renewal, growth, sustainable maintenance\n• Size: 512×512 PNG, dark bg, no text`,
    },
    "Pulse": {
        description: "Pulse automates the tedious. It writes GitHub Actions workflows, creates scripts, manages CI/CD pipelines, and ensures the development loop is fast, repeatable, and hands-free.",
        responsibilities: [
            "Write and maintain GitHub Actions CI/CD pipelines",
            "Create npm scripts and shell automation",
            "Manage deployment workflows for Vercel and other platforms",
            "Schedule automated tasks (cron jobs, syncs)",
            "Generate changelogs and release notes automatically",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Pulse" - Automation.\n• Color: Purple #9933ff, electric rhythm\n• Symbol: Pulsing heartbeat/waveform line transforming into a gear or cog\n• Style: Dynamic curves transitioning into mechanical precision, purple glow\n• Mood: Rhythmic, relentless, always running in the background\n• Size: 512×512 PNG, dark bg, no text`,
    },
    "Sand": {
        description: "Sand manages all data persistence. It designs database schemas, writes migration files, optimizes queries, configures caching layers, and ensures data integrity across the stack.",
        responsibilities: [
            "Design and migrate SQLite / PostgreSQL schemas",
            "Write optimized queries and add proper indexes",
            "Configure Redis / edge caching strategies",
            "Manage file storage (local, S3)",
            "Ensure data backups and disaster recovery plans",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Sand" - Storage.\n• Color: Warm terracotta #cc6633 on dark background\n• Symbol: Database cylinder built from layered sand strata, like geological cross-section\n• Style: Earthy, structured, stacked circles suggesting depth and data layers\n• Mood: Solid, ancient reliability, foundational strength\n• Size: 512×512 PNG, dark bg, no text`,
    },
    "Shadow": {
        description: "Shadow is always watching. It audits authentication flows, scans for vulnerabilities, enforces CSP headers, reviews permissions, and ensures nothing sensitive leaks to the client.",
        responsibilities: [
            "Audit auth flows (JWT, sessions, OAuth, passkeys)",
            "Scan for OWASP Top 10 vulnerabilities",
            "Enforce Content Security Policy and security headers",
            "Review env vars for accidental exposure",
            "Monitor for suspicious activity patterns",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Shadow" - Security.\n• Color: Stealth gray #999999, shadow and light contrast\n• Symbol: A lock with a ghost/shadow silhouette - half visible, half hidden in darkness\n• Style: Dark, enigmatic, high contrast - suggests invisibility and silent protection\n• Mood: Silent guardian, always present but unseen\n• Size: 512×512 PNG, near-black bg, no text`,
    },
    "Rock": {
        description: "Rock builds the internal command center. It creates admin dashboards, internal tools, reporting interfaces, and the monitoring infrastructure that keeps the whole system observable.",
        responsibilities: [
            "Build admin dashboards and internal management UIs",
            "Create reporting interfaces and data export tools",
            "Develop monitoring and observability views",
            "Manage user roles and permission interfaces",
            "Build developer tools and debug panels",
        ],
        iconPrompt: `Create a minimal AI agent avatar icon for "Rock" - Dashboard.\n• Color: Neutral stone gray #7a7a7a, solid and unmoving\n• Symbol: Grid of dashboard tiles arranged to form a monolith/rock shape\n• Style: Solid, geometric, structural - squares as a stable foundation\n• Mood: Dependable, permanent, the bedrock of the entire system\n• Size: 512×512 PNG, dark bg, no text`,
    },
};

// ─── Category colors ──────────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
    security:     "#ef4444",
    architecture: "#ff3333",
    workflow:     "#0ea5e9",
    performance:  "#ffdd00",
    css:          "#ff8800",
    db:           "#cc6633",
    infra:        "#9333ea",
    general:      "#6b7280",
};

// ─── Machines ────────────────────────────────────────────────────────────────
// Static fallback - overridden by dynamic machine list from /api/claude/machines
export const MACHINES: string[] = [];
export const MACHINE_COLORS: Record<string, string> = {};
// Color palette for dynamic machines
export const MACHINE_COLOR_PALETTE = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#f59e0b", "#10b981"];
export const MACHINE_META: Record<string, { hostname: string; ip?: string }> = {};
export function machineLabel(key: string): string {
    const meta = MACHINE_META[key];
    if (!meta) return key;
    if (meta.hostname && meta.hostname !== "Unknown") return meta.hostname;
    if (meta.ip) return meta.ip;
    return key;
}

export function MachineFilter({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
    const pills: { label: string; val: string | null }[] = [
        { label: "All", val: null },
        ...MACHINES.map(m => ({ label: m, val: m })),
    ];
    return (
        <div className="flex gap-1.5 mb-4">
            {pills.map(({ label, val }) => {
                const active = value === val;
                const color = val ? MACHINE_COLORS[val] : ACCENT;
                return (
                    <button key={label} onClick={() => onChange(val)}
                        className="px-2 py-1 rounded-md text-[10px] font-bold transition-colors"
                        style={{
                            background: active ? `${color}20` : "rgba(255,255,255,0.04)",
                            border: `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                            color: active ? color : "rgba(255,255,255,0.4)",
                        }}>{label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
type ModelPrice = { input: number; output: number; cache_read: number; cache_creation: number };
const MODEL_PRICES: Record<string, ModelPrice> = {
    "opus":   { input: 15,   output: 75, cache_read: 1.50,  cache_creation: 18.75 },
    "sonnet": { input: 3,    output: 15, cache_read: 0.30,  cache_creation: 3.75  },
    "haiku":  { input: 0.80, output: 4,  cache_read: 0.08,  cache_creation: 1.00  },
};
export const PRICE = MODEL_PRICES["sonnet"];

function getModelPrice(model?: string): ModelPrice {
    if (!model) return MODEL_PRICES["sonnet"];
    const m = model.toLowerCase();
    if (m.includes("opus"))  return MODEL_PRICES["opus"];
    if (m.includes("haiku")) return MODEL_PRICES["haiku"];
    return MODEL_PRICES["sonnet"];
}

export function calcCost(t: Token) {
    const p = getModelPrice(t.model);
    return (
        (t.input_tokens            / 1_000_000) * p.input +
        (t.output_tokens           / 1_000_000) * p.output +
        (t.cache_read_tokens       / 1_000_000) * p.cache_read +
        (t.cache_creation_tokens   / 1_000_000) * p.cache_creation
    );
}
export function fmtCost(usd: number) { return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`; }

/** Safe fetch - checks r.ok before parsing JSON, returns fallback on error */
export async function safeFetch<T>(url: string, fallback: T): Promise<T> {
    try {
        const r = await fetch(url);
        if (!r.ok) return fallback;
        return await r.json();
    } catch { return fallback; }
}
export function fmtNum(n: number)    { return n >= 1_000_000_000 ? `${(n/1_000_000_000).toFixed(1)}B` : n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }
export function hexToRgba(hex: string, alpha: number) {
    const raw = hex.replace("#", "");
    const r = parseInt(raw.slice(0,2),16), g = parseInt(raw.slice(2,4),16), b = parseInt(raw.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function timeAgo(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
}
export function fmtTs(ts: number) {
    return new Date(ts).toLocaleString("en-US", {
        timeZone: "America/New_York", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
    });
}
export function filterByInterval(entries: HistoryEntry[], interval: Interval) {
    const now = Date.now();
    if (interval === "today") { const s = new Date(); s.setHours(0,0,0,0); return entries.filter(e => e.timestamp >= s.getTime()); }
    if (interval === "7d") return entries.filter(e => e.timestamp >= now - 7*86400_000);
    if (interval === "1m") return entries.filter(e => e.timestamp >= now - 30*86400_000);
    return entries;
}
export function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const t of arr) { const k = key(t); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); }
    return m;
}

// ─── Shared UI components ─────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = ACCENT, onClick }: {
    label: string; value: string | number; sub?: string; color?: string; onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-[#0f1117] border border-white/[0.08] rounded-xl p-3 text-left w-full transition-all hover:border-white/[0.15] active:scale-[0.98] group"
        >
            <p className="text-[10px] font-semibold tracking-wide text-white/40 uppercase mb-1 flex items-center justify-between">
                {label}
                <span className="text-[9px] text-white/20 group-hover:text-white/40 transition-colors">↗</span>
            </p>
            <p className="text-xl font-bold leading-none" style={{ color }}>{value}</p>
            {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
        </button>
    );
}

export function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
            <Icon className="w-3 h-3" style={{ color: ACCENT, flexShrink: 0 }} />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", lineHeight: 1 }}>{title}</span>
        </div>
    );
}
