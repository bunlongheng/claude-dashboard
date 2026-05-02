"use client";

const FEATURES = [
    { icon: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z", title: "Token Analytics", desc: "Daily charts, per-model pricing, plan-aware cost (API/Pro/Max)" },
    { icon: "M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6", title: "Context Window", desc: "Live per-session context usage with cache/input/create breakdown" },
    { icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z", title: "RAG Memory", desc: "Personal knowledge base - search sessions, memory, and preferences" },
    { icon: "M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776", title: "Sessions", desc: "Browse every session across all projects with live streaming" },
    { icon: "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18", title: "Memory", desc: "See what Claude remembers - user, feedback, project, reference" },
    { icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", title: "Activity Heatmap", desc: "GitHub-style contribution calendar with streaks and stats" },
    { icon: "M6 13.5V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 9.75V10.5", title: "Multi-Machine", desc: "Switch between Mac, Pi, VPS - all data proxied from remote dashboards" },
    { icon: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z", title: "Skills & MCP", desc: "Browse skills, commands, hooks, and MCP server connections" },
    { icon: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z", title: "Health Check", desc: "Project health scores - find gaps in your Claude setup" },
];

const PAGES = [
    { name: "Overview", color: "#f97316" },
    { name: "CLAUDE.md", color: "#8b5cf6" },
    { name: "Memory", color: "#eab308" },
    { name: "Rules", color: "#14b8a6" },
    { name: "MCP", color: "#10b981" },
    { name: "Plugins", color: "#8b5cf6" },
    { name: "Skills", color: "#06b6d4" },
    { name: "Commands", color: "#f472b6" },
    { name: "Hooks", color: "#a3e635" },
    { name: "Sessions", color: "#22c55e" },
    { name: "Tokens", color: "#f59e0b" },
    { name: "Settings", color: "#6b7280" },
    { name: "Health", color: "#ef4444" },
    { name: "Timeline", color: "#3b82f6" },
    { name: "RAG", color: "#f472b6" },
];

export default function LandingPage() {

    return (
        <div style={{ minHeight: "100dvh", background: "#08090d", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            {/* Nav */}
            <nav style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                position: "sticky", top: 0, zIndex: 50, background: "rgba(8,9,13,0.9)", backdropFilter: "blur(12px)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <img src="/claude-logo.png" alt="Claude" width={20} height={20} style={{ imageRendering: "pixelated" }} />
                    <span className="text-xs sm:text-sm" style={{ fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Claude Dashboard</span>
                </div>
                <a href="https://github.com/bunlongheng/claude-dashboard" target="_blank" rel="noopener"
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none", padding: "6px 12px" }}>
                    GitHub
                </a>
            </nav>

            {/* Hero */}
            <section style={{ textAlign: "center", padding: "60px 20px 40px", maxWidth: 720, margin: "0 auto" }}>
                <div style={{ marginBottom: 20 }}>
                    <img src="/claude-logo.png" alt="" width={56} height={56} style={{ imageRendering: "pixelated", marginBottom: 12 }} />
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl" style={{ fontWeight: 800, lineHeight: 1.2, letterSpacing: -1, marginBottom: 16 }}>
                    See everything<br />
                    <span style={{ color: "#f97316" }}>Claude Code</span> knows
                </h1>
                <p className="text-sm sm:text-base" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 480, margin: "0 auto 28px" }}>
                    Monitor sessions, tokens, context windows, memory, and more from one local-first dashboard with multi-machine support.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <a href="https://github.com/bunlongheng/claude-dashboard" target="_blank" rel="noopener" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "12px 24px", borderRadius: 10, background: "#f97316",
                        color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none",
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>
                        Get Started
                    </a>
                </div>
            </section>

            {/* Install */}
            <section style={{ textAlign: "center", padding: "32px 16px 48px", maxWidth: 500, margin: "0 auto" }}>
                <h2 style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em", color: "#f97316", textTransform: "uppercase", marginBottom: 20 }}>
                    One command. That's it.
                </h2>
                <div style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12, padding: "16px", textAlign: "left",
                    fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.8,
                    overflowX: "auto", WebkitOverflowScrolling: "touch",
                    whiteSpace: "nowrap",
                }}>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>$ </span>
                    <span style={{ color: "#22c55e" }}>git clone</span>
                    {" "}https://github.com/bunlongheng/claude-dashboard.git && <span style={{ color: "#22c55e" }}>cd</span>{" "}claude-dashboard && <span style={{ color: "#22c55e" }}>npm i</span> && <span style={{ color: "#22c55e" }}>npm run dev</span>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 12 }}>
                    Zero config. No database. No account. Just your local files.
                </p>
            </section>

            {/* Pages pills */}
            <section style={{ textAlign: "center", padding: "20px 24px 60px" }}>
                <h2 style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 20 }}>
                    15 pages, all from ~/.claude/
                </h2>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", maxWidth: 600, margin: "0 auto" }}>
                    {PAGES.map(p => (
                        <span key={p.name} style={{
                            fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 20,
                            background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}30`,
                        }}>{p.name}</span>
                    ))}
                </div>
            </section>

            {/* Feature grid */}
            <section style={{ padding: "32px 16px 60px", maxWidth: 900, margin: "0 auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                    {FEATURES.map(f => (
                        <div key={f.title} style={{
                            padding: 20, borderRadius: 12,
                            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" style={{ marginBottom: 10 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                            </svg>
                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{f.title}</h3>
                            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How it works */}
            <section style={{ textAlign: "center", padding: "32px 16px 60px", maxWidth: 600, margin: "0 auto" }}>
                <h2 style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 20 }}>
                    How it works
                </h2>
                <div style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12, padding: "20px 24px", textAlign: "left",
                    fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.8,
                    color: "rgba(255,255,255,0.4)",
                }}>
                    <div style={{ color: "rgba(255,255,255,0.2)", marginBottom: 4 }}>~/.claude/</div>
                    <div>&nbsp;&nbsp;CLAUDE.md&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#f97316" }}># Global instructions</span></div>
                    <div>&nbsp;&nbsp;settings.json&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#f97316" }}># Your settings</span></div>
                    <div>&nbsp;&nbsp;projects/</div>
                    <div>&nbsp;&nbsp;&nbsp;&nbsp;your-project/</div>
                    <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;memory/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#eab308" }}># What Claude remembers</span></div>
                    <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*.jsonl&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#22c55e" }}># Session transcripts</span></div>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>
                    The dashboard reads these files. Nothing is uploaded. Nothing leaves your machine.
                </p>
            </section>

            {/* Footer */}
            <footer style={{
                textAlign: "center", padding: "24px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                fontSize: 11, color: "rgba(255,255,255,0.2)",
            }}>
                Built by <a href="https://www.bunlongheng.com" target="_blank" rel="noopener" style={{ color: "rgba(255,255,255,0.3)" }}>www.bunlongheng.com</a> &bull; MIT License &bull; <a href="https://github.com/bunlongheng/claude-dashboard" style={{ color: "rgba(255,255,255,0.3)" }}>GitHub</a>
            </footer>
        </div>
    );
}
