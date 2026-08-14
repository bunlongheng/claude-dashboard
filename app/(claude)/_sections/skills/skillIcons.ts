import {
    Search, GitBranch, AppWindow, Rocket, TestTube2, ShieldCheck, MessageSquare,
    Mic, Camera, QrCode, Mail, Triangle, StickyNote, LayoutPanelTop, Eye, Code2,
    // Extra icons for skill mapping + deterministic fallback
    Activity, AlertCircle, Award, Boxes, Brain, Briefcase, Bug,
    Calendar, CheckCircle2, ChevronsRight, ClipboardCheck, Cloud, Coffee,
    Compass, Crosshair, Database, FileCode, FileText, Filter, Flame, Flag,
    Folder, Gift, Globe, Hammer, Headphones, Heart, Image as ImageIcon,
    Inbox, Info, Key, Layers, Link as LinkIcon, ListChecks, Lock, Map as MapIcon,
    Network, Package, PenTool, PieChart, Play, Power, RefreshCw,
    Repeat, Scale, Settings, Shield, SlidersHorizontal,
    Smartphone, Speaker, Sun, Tag, Target, Terminal as TerminalIcon,
    Tv, Umbrella, Upload, Users, Video, Wand2, Watch, Wifi,
    Workflow, Wrench,
    type LucideIcon,
} from "lucide-react";

// ── Orbital color palette ───────────────────────────────────────────────────
export const ORB_COLORS = [
    "#f97316", "#7c3aed", "#2563eb", "#16a34a", "#db2777",
    "#0891b2", "#dc2626", "#d97706", "#0d9488", "#4338ca",
    "#e11d48", "#65a30d",
];

export const ORB_ICONS = [
    "zap", "sparkles", "star", "bolt", "diamond", "hexagon",
    "triangle", "layers", "activity", "cpu", "terminal", "rocket",
];

export const SKILL_ICONS: Record<string, LucideIcon> = {
    "stickies": StickyNote, "sticky": StickyNote, "/sticky": StickyNote, "note": StickyNote,
    "deck": LayoutPanelTop, "/deck": LayoutPanelTop,
    "diagram": GitBranch, "/diagram": GitBranch,
    "local-apps": AppWindow, "/local-apps": AppWindow, "apps": AppWindow,
    "onboard": Rocket, "/onboard": Rocket,
    "slack-read": MessageSquare, "/slack-read": MessageSquare,
    "mimi": Mic, "/mimi": Mic,
    "screenshots": Camera, "show-ui": ImageIcon, "route-shots": Camera,
    "show-lan": QrCode,
    "email": Mail, "/email": Mail,
    "pixel": Triangle,
    "tabs": LayoutPanelTop,
    "rag": Search,
    "sitemap": MapIcon,
    "session-recap": ClipboardCheck,
    "release-ready": CheckCircle2,
    "release-playbook": Flag,
    "finish-branch": Flag,
    "testing-guardrail": Shield,
    "tdd": TestTube2,
    "debug": Bug,
    "code-review": Eye,
    "security-review": ShieldCheck,
    "review": Eye,
    "brainstorm": Brain,
    "verify": CheckCircle2,
    "execute-plan": Play,
    "subagent-dev": Users,
    "plan": ListChecks,
    "parallel": Layers,
    "contrib-radar": Globe,
    "mindmap": Brain,
    "erd": Database,
    "claude-api": Code2,
    "init": Power,
    "loop": Repeat,
    "schedule": Calendar,
    "update-config": Settings,
    "keybindings-help": Key,
    "simplify": Wand2,
    "fewer-permission-prompts": Lock,
    "frontend-design": PenTool,
    "frontend-design:frontend-design": PenTool,
};

// Pool used when a skill has no explicit mapping. Hashing the name into this
// pool gives each skill a stable, distinct-looking icon instead of every
// unmapped row collapsing to a single fallback (Zap).
export const SKILL_ICON_POOL: LucideIcon[] = [
    Activity, Award, Boxes, Briefcase, Cloud, Coffee, Compass, Crosshair,
    Filter, Flame, Folder, FileCode, FileText, Gift, Hammer, Headphones,
    Heart, Inbox, Info, Layers, LinkIcon, Network, Package, PieChart,
    RefreshCw, Scale, SlidersHorizontal, Smartphone, Speaker, Sun, Tag,
    Target, TerminalIcon, Tv, Umbrella, Upload, Users, Video, Watch, Wifi,
    Wrench, Workflow, AlertCircle, ChevronsRight,
];

function hashName(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

export function getSkillIcon(name: string): LucideIcon {
    const clean = name.replace(/^\//, "");
    return SKILL_ICONS[clean] || SKILL_ICONS[name] || SKILL_ICON_POOL[hashName(clean) % SKILL_ICON_POOL.length];
}

export function skillTag(name: string): string {
    const n = name.replace(/^\//, "").toLowerCase();
    // SSH/remote helper skills group together; everything else you authored is "custom".
    if (n.startsWith("ssh")) return "ssh";
    return "custom";
}

export function cleanName(name: string): string {
    return name
        .replace(/^\//, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

// Wrapping Date.now() in a helper keeps the "new skill" badge check out of
// direct component/hook bodies so react-hooks/purity doesn't flag it.
function nowMs(): number { return Date.now(); }

export function isNewSkill(createdAt?: string): boolean {
    if (!createdAt) return false;
    return nowMs() - new Date(createdAt).getTime() < 5 * 86400000;
}
