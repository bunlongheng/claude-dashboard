import { NextResponse } from "next/server";
import { spawn } from "child_process";

const PORT = 7878;

export async function POST() {
    // Check if already running
    try {
        const health = await fetch(`http://localhost:${PORT}/api/health`, { signal: AbortSignal.timeout(800) });
        if (health.ok) return NextResponse.json({ started: false, reason: "already running" });
    } catch { /* not running - proceed */ }

    try {
        // Build path at runtime to avoid Turbopack static resolution
        const cwd = process.cwd();
        const script = [cwd, "scripts", "ws-server.mjs"].join("/");
        const proc = spawn("node", [script], {
            detached: true,
            stdio: "ignore",
            env: { ...process.env, PORT: String(PORT) },
        });
        proc.unref();

        // Give it a moment to start
        await new Promise(r => setTimeout(r, 1200));

        const health = await fetch(`http://localhost:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
        if (health?.ok) {
            return NextResponse.json({ started: true });
        }
        return NextResponse.json({ started: false, reason: "binary launched but health check failed" }, { status: 500 });
    } catch (e) {
        return NextResponse.json({ started: false, reason: String(e) }, { status: 500 });
    }
}
