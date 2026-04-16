import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

export interface SetupStatus {
    claudeInstalled: boolean;
    hasProjects: boolean;
    projectCount: number;
    hasMemory: boolean;
    hasSettings: boolean;
}

export function checkSetup(): SetupStatus {
    const claudeInstalled = fs.existsSync(CLAUDE_DIR);
    const hasProjects = fs.existsSync(PROJECTS_DIR);
    let projectCount = 0;
    let hasMemory = false;

    if (hasProjects) {
        try {
            const folders = fs.readdirSync(PROJECTS_DIR).filter(f => {
                try { return fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory(); } catch { return false; }
            });
            projectCount = folders.length;
            hasMemory = folders.some(f => fs.existsSync(path.join(PROJECTS_DIR, f, "memory")));
        } catch {}
    }

    const hasSettings = fs.existsSync(path.join(CLAUDE_DIR, "settings.json")) || fs.existsSync(path.join(CLAUDE_DIR, "CLAUDE.md"));

    return { claudeInstalled, hasProjects, projectCount, hasMemory, hasSettings };
}

export function SetupBanner({ status }: { status: SetupStatus }) {
    if (status.claudeInstalled && status.hasProjects && status.projectCount > 0) return null;

    if (!status.claudeInstalled) {
        return (
            <div style={{
                margin: "24px 32px", padding: 24, borderRadius: 12,
                background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)",
                textAlign: "center",
            }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>
                    <img src="/claude-logo.png" alt="" width={48} height={48} style={{ imageRendering: "pixelated", display: "inline-block" }} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                    Welcome to Claude Dashboard
                </h2>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 420, margin: "0 auto 16px" }}>
                    Claude Code is not installed yet. This dashboard needs Claude Code to work — it reads your data from <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>~/.claude/</code>
                </p>
                <div style={{
                    display: "inline-block", padding: "10px 20px", borderRadius: 10, marginBottom: 12,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12, color: "#22c55e",
                }}>
                    npm install -g @anthropic-ai/claude-code
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 0 }}>
                    Install Claude Code, run a session in any project, then refresh this page.
                </p>
            </div>
        );
    }

    if (!status.hasProjects || status.projectCount === 0) {
        return (
            <div style={{
                margin: "24px 32px", padding: 24, borderRadius: 12,
                background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
                textAlign: "center",
            }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>
                    <img src="/claude-logo.png" alt="" width={40} height={40} style={{ imageRendering: "pixelated", display: "inline-block" }} />
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                    Claude Code is installed
                </h2>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 400, margin: "0 auto 12px" }}>
                    No project sessions found yet. Open a terminal, navigate to any project, and start a Claude Code session:
                </p>
                <div style={{
                    display: "inline-block", padding: "10px 20px", borderRadius: 10,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 13, color: "#22c55e",
                }}>
                    cd your-project && claude
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 12 }}>
                    Once you start a session, your data will appear here automatically.
                </p>
            </div>
        );
    }

    return null;
}
