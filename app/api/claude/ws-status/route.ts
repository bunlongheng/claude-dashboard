import { NextResponse } from "next/server";
import { execSync } from "child_process";

const PORT = 7878;

// Cache result for 5 seconds to avoid spawning lsof on every concurrent poll
let cache: { value: { running: boolean; pid: number | null; port: number }; expiresAt: number } | null = null;

function getPid(): number | null {
    try {
        const out = execSync(`lsof -i :${PORT} -sTCP:LISTEN -t 2>/dev/null`, { encoding: "utf-8" }).trim();
        const pid = parseInt(out.split("\n")[0], 10);
        return isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
}

export async function GET() {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
        return NextResponse.json(cache.value);
    }

    let result: { running: boolean; pid: number | null; port: number };
    try {
        const res = await fetch(`http://localhost:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
            const pid = getPid();
            result = { running: true, pid, port: PORT };
        } else {
            result = { running: false, pid: null, port: PORT };
        }
    } catch {
        result = { running: false, pid: null, port: PORT };
    }

    cache = { value: result, expiresAt: now + 5_000 };
    return NextResponse.json(result);
}
