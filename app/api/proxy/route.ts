import { NextResponse } from "next/server";
import { requireSameSite } from "@/lib/route-guard";
import { openMachinesDb } from "@/lib/machines-db";
import { withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same-origin reverse proxy for the multi-machine switcher. The local dashboard's
// browser calls /api/proxy?machine=<id>&path=/api/claude/... and this forwards it
// to the peer dashboard server-side, so the browser avoids a cross-origin (CORS)
// fetch. Guarded by requireSameSite so only the local dashboard UI can use it -
// there is no bearer token and no remote command execution. Peer read routes are
// open on the LAN by the same local-first model as the local dashboard itself.

function resolveMachine(id: string): { ip: string; port: number } | null {
    // MACHINES env: "ip:port,ip:port"
    for (const entry of (process.env.MACHINES || "").split(",").map(s => s.trim()).filter(Boolean)) {
        const [ip, portStr] = entry.split(":");
        const port = parseInt(portStr || "3000", 10);
        if (`${ip}:${port}` === id || ip === id) return { ip, port };
    }
    // Optional machines db
    const db = openMachinesDb();
    if (db) {
        try {
            const row = db.prepare("SELECT ip, port FROM machines WHERE id = ? OR (ip || ':' || port) = ?").get(id, id) as { ip: string; port: number } | undefined;
            if (row) return { ip: row.ip, port: row.port };
        } catch { /* ignore */ } finally { db.close(); }
    }
    return null;
}

function isAllowedPath(path: string): boolean {
    // Only forward the dashboard's own data APIs to a peer.
    return path.startsWith("/api/claude/") || path.startsWith("/api/rag/");
}

async function forward(req: Request): Promise<Response> {
    const denied = requireSameSite(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const machineId = url.searchParams.get("machine") || "";
    const path = url.searchParams.get("path") || "";
    if (!machineId || !path || !isAllowedPath(path)) {
        return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const target = resolveMachine(machineId);
    if (!target) return NextResponse.json({ error: "unknown machine" }, { status: 404 });

    const init: RequestInit = { method: req.method, signal: AbortSignal.timeout(15000) };
    if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = await req.text();
        init.headers = { "content-type": req.headers.get("content-type") || "application/json" };
    }

    try {
        const res = await fetch(`http://${target.ip}:${target.port}${path}`, init);
        const body = await res.text();
        return new NextResponse(body, {
            status: res.status,
            headers: { "content-type": res.headers.get("content-type") || "application/json" },
        });
    } catch {
        return NextResponse.json({ error: "peer unreachable" }, { status: 502 });
    }
}

export const GET = withErrorHandler(forward) as (req: Request) => Promise<Response>;
export const POST = withErrorHandler(forward) as (req: Request) => Promise<Response>;
