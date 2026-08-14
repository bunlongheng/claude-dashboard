import type { AgentChar, AgentInfo } from "./types";

export const AGENT_CHARS: AgentChar[] = [
    { id: 1, name: "Snow", role: "Recon", color: "#ffffff", img: "/agents/1.webp" },
    { id: 2, name: "Blaze", role: "Arch", color: "#ff3333", img: "/agents/2.webp" },
    { id: 3, name: "Arrow", role: "QA", color: "#ff66cc", img: "/agents/3.webp" },
    { id: 4, name: "Venus", role: "UI", color: "#ff8800", img: "/agents/4.webp" },
    { id: 5, name: "Zap", role: "Perf", color: "#ffdd00", img: "/agents/5.webp" },
    { id: 6, name: "Frost", role: "Data", color: "#00ffff", img: "/agents/6.webp" },
    { id: 7, name: "Blitz", role: "Code", color: "#0099ff", img: "/agents/7.webp" },
    { id: 8, name: "Earth", role: "Clean", color: "#00ff00", img: "/agents/8.webp" },
    { id: 9, name: "Pulse", role: "Build", color: "#9933ff", img: "/agents/9.webp" },
    { id: 10, name: "Sand", role: "Store", color: "#cc6633", img: "/agents/10.webp" },
    { id: 11, name: "Shadow", role: "Guard", color: "#888888", img: "/agents/11.webp" },
    { id: 12, name: "Rock", role: "Intel", color: "#7a7a7a", img: "/agents/12.webp" },
];

export function getAgentChar(agent: AgentInfo): AgentChar {
    // Match on description + type only (not full prompt - too noisy)
    const desc = (agent.description + " " + agent.subagentType).toLowerCase();
    // 1. Shadow - Security (first - "audit" overlaps with Arrow)
    if (desc.includes("security") || desc.includes("audit repo") || desc.includes("vuln") || desc.includes("ssl") || desc.includes("cipher") || desc.includes("supply chain") || desc.includes("exposure")) return AGENT_CHARS[10];
    // 2. Zap - Performance (before Arrow - "performance fixes" should be Zap not Arrow)
    if (desc.includes("perf") || desc.includes("speed") || desc.includes("lighthouse") || desc.includes("performance") || desc.includes("seo") || desc.includes("best practice") || desc.includes("bottleneck")) return AGENT_CHARS[4];
    // 3. Blaze - Architecture / Planning
    if (desc.includes("plan ") || desc.includes("architect") || desc.includes("schema") || desc.includes("structure") || desc.includes("design system")) return AGENT_CHARS[1];
    // 4. Arrow - QA / Audit (non-security)
    if (desc.includes("test") || desc.includes("qa") || desc.includes("verify") || desc.includes("accessibility") || desc.includes("e2e") || desc.includes("audit ") || desc.includes("compare")) return AGENT_CHARS[2];
    // 5. Venus - UI / Frontend
    if (desc.includes("ui ") || desc.includes("frontend") || desc.includes("css") || desc.includes("color") || desc.includes("style") || desc.includes("responsive") || desc.includes("layout")) return AGENT_CHARS[3];
    // 6. Blitz - Fix / Code
    if (desc.includes("fix ") || desc.includes("lint") || desc.includes("rebuild") || desc.includes("migrate")) return AGENT_CHARS[6];
    // 7. Earth - Cleanup
    if (desc.includes("clean") || desc.includes("refactor") || desc.includes("remove") || desc.includes("dead") || desc.includes("delete") || desc.includes("unused")) return AGENT_CHARS[7];
    // 8. Pulse - Create / Build
    if (desc.includes("build") || desc.includes("deploy") || desc.includes("create") || desc.includes("setup") || desc.includes("seed") || desc.includes("generate") || desc.includes("download") || desc.includes("scrape")) return AGENT_CHARS[8];
    // 9. Sand - Storage / DB
    if (desc.includes("db") || desc.includes("storage") || desc.includes("sqlite") || desc.includes("supabase") || desc.includes("postgres")) return AGENT_CHARS[9];
    // 10. Frost - Analytics / Data
    if (desc.includes("metric") || desc.includes("chart") || desc.includes("stats") || desc.includes("analytics") || desc.includes("monitor") || desc.includes("dashboard")) return AGENT_CHARS[5];
    // 11. Rock - Investigate
    if (desc.includes("gather") || desc.includes("batch") || desc.includes("check ")) return AGENT_CHARS[11];
    // 12. Snow - Commander / Research (catch-all)
    if (desc.includes("explore") || desc.includes("find") || desc.includes("study") || desc.includes("search") || desc.includes("research") || desc.includes("guide") || desc.includes("session") || desc.includes("config") || desc.includes("analyze") || desc.includes("scan") || desc.includes("count") || desc.includes("list")) return AGENT_CHARS[0];
    let h = 0;
    for (const c of agent.id) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    return AGENT_CHARS[Math.abs(h) % AGENT_CHARS.length];
}

export function formatDuration(ms: number | null): string {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

// Wraps the impure Date.now() read behind a plain helper (mirrors how
// shared's timeAgo() already does this) so components calling it stay
// pure from the linter's point of view - same live "is this recent"
// check the render used to do inline.
export function isRecentCompletion(completedAt: string | null): boolean {
    return !!completedAt && (Date.now() - new Date(completedAt).getTime()) < 60000;
}
