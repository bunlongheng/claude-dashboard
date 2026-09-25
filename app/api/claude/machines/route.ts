import { NextResponse } from "next/server";
import * as os from "os";
import { openMachinesDb } from "@/lib/machines-db";
import { withErrorHandler } from "@/lib/api-handler";

const THIS_HOSTNAME = os.hostname().split(".")[0];
const LOCAL_MACHINE_ID = process.env.LOCAL_MACHINE_ID || THIS_HOSTNAME;

export interface MachineInfo { id: string; hostname: string; ip: string; port: number; model: string; online: boolean; isLocal: boolean }

// Multi-machine federation is opt-in. With no MACHINES env (and nothing in the
// optional machines db), this returns only the local machine, so the dashboard
// is single-machine by default. Set MACHINES=host:port,host:port to federate.

function getLocalIPs(): string[] {
    const ips: string[] = [];
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name] ?? []) {
            if (iface.family === "IPv4" && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

function getMachinesFromEnv(): { ip: string; port: number }[] {
    const raw = process.env.MACHINES || "";
    if (!raw) return [];
    return raw.split(",").map(s => s.trim()).filter(Boolean).map(entry => {
        const [ip, portStr] = entry.split(":");
        return { ip, port: parseInt(portStr || "3000", 10) };
    });
}

function getMachinesFromDb(): { id: string; hostname: string; ip: string; port: number; model: string }[] {
    const db = openMachinesDb();
    if (!db) return [];
    try {
        const rows = db.prepare("SELECT id, hostname, ip, port, model, last_seen FROM machines").all();
        return rows as { id: string; hostname: string; ip: string; port: number; model: string }[];
    } catch {
        return [];
    } finally {
        db.close();
    }
}

async function scanSubnet(localIP: string, port: number): Promise<{ ip: string; port: number }[]> {
    // Scan the local /24 for other Claude Dashboard instances (opt-in via ?discover=1).
    const base = localIP.split(".").slice(0, 3).join(".");
    const candidates: { ip: string; port: number }[] = [];

    const promises = Array.from({ length: 254 }, (_, i) => {
        const ip = `${base}.${i + 1}`;
        if (ip === localIP) return null;
        return fetch(`http://${ip}:${port}/api/claude/lan`, { signal: AbortSignal.timeout(500) })
            .then(r => r.ok ? { ip, port } : null)
            .catch(() => null);
    }).filter(Boolean);

    const results = await Promise.all(promises as Promise<{ ip: string; port: number } | null>[]);
    for (const r of results) {
        if (r) candidates.push(r);
    }
    return candidates;
}

// Remote pings are the only slow part of this route (an unreachable peer costs
// the full timeout on every layout mount). Keep the last result for PING_TTL_MS
// and answer from it; a stale hit still answers instantly and refreshes the
// pings in the background, so only the first call after a restart waits.
const PING_TTL_MS = 60_000;
const PING_TIMEOUT_MS = 800;
let pingCache: { at: number; key: string; results: MachineInfo[] } | null = null;
let pingInflight: Promise<MachineInfo[]> | null = null;

async function pingMachine(ip: string, port: number): Promise<{ online: boolean; hostname?: string; model?: string }> {
    try {
        // A reachable peer dashboard answers /api/claude/lan with its identity.
        const lanRes = await fetch(`http://${ip}:${port}/api/claude/lan`, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
        if (!lanRes.ok) return { online: false };
        const data = await lanRes.json();
        return { online: true, hostname: data.hostname || ip, model: data.model };
    } catch {
        return { online: false };
    }
}

export const GET = withErrorHandler(async (req: Request) => {
    const url = new URL(req.url);
    const autoDiscover = url.searchParams.get("discover") === "1";

    const localPort = parseInt(process.env.PORT || "3000", 10);

    // Always include the local machine.
    const machines: MachineInfo[] = [{
        id: LOCAL_MACHINE_ID,
        hostname: THIS_HOSTNAME,
        ip: "127.0.0.1",
        port: localPort,
        model: os.cpus()[0]?.model || "Unknown",
        online: true,
        isLocal: true,
    }];

    // Collect remote machines from all sources.
    const envMachines = getMachinesFromEnv();
    const dbMachines = getMachinesFromDb();

    let discoveredMachines: { ip: string; port: number }[] = [];
    if (autoDiscover) {
        try {
            const localIPs = getLocalIPs();
            if (localIPs.length > 0) {
                discoveredMachines = await scanSubnet(localIPs[0], localPort);
            }
        } catch { /* network scan failed - not critical */ }
    }

    const allRemotes = [
        ...envMachines.map(m => ({ id: `${m.ip}:${m.port}`, hostname: m.ip, ip: m.ip, port: m.port, model: "" })),
        ...dbMachines,
        ...discoveredMachines.map(m => ({ id: `${m.ip}:${m.port}`, hostname: m.ip, ip: m.ip, port: m.port, model: "" })),
    ];

    // Deduplicate by ip:port.
    const seen = new Set<string>();
    const unique = allRemotes.filter(m => {
        const key = `${m.ip}:${m.port}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Ping in parallel.
    const pingAll = () => Promise.all(
        unique.map(async (m) => {
            const ping = await pingMachine(m.ip, m.port);
            return {
                id: m.id || `${m.ip}:${m.port}`,
                hostname: ping.hostname || m.hostname || m.ip,
                ip: m.ip,
                port: m.port,
                model: ping.model || m.model || "",
                online: ping.online,
                isLocal: false,
            };
        })
    );

    const pingKey = unique.map(m => `${m.ip}:${m.port}`).join(",");
    const now = Date.now();
    let remoteResults: MachineInfo[];
    if (pingCache && pingCache.key === pingKey) {
        remoteResults = pingCache.results;
        if (now - pingCache.at >= PING_TTL_MS && !pingInflight) {
            pingInflight = pingAll()
                .then(r => { pingCache = { at: Date.now(), key: pingKey, results: r }; return r; })
                .finally(() => { pingInflight = null; });
        }
    } else {
        if (!pingInflight) pingInflight = pingAll().finally(() => { pingInflight = null; });
        remoteResults = await pingInflight;
        pingCache = { at: now, key: pingKey, results: remoteResults };
    }

    machines.push(...remoteResults.filter(m => m.online));

    return NextResponse.json({ machines });
}) as (req: Request) => Promise<Response>;
