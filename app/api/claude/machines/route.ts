import { NextResponse } from "next/server";
import * as os from "os";

const DB_PATH = process.env.MACHINES_DB_PATH || "";
const THIS_HOSTNAME = os.hostname().split(".")[0];
const LOCAL_MACHINE_ID = process.env.LOCAL_MACHINE_ID || THIS_HOSTNAME;

export interface MachineInfo { id: string; hostname: string; ip: string; port: number; model: string; online: boolean; isLocal: boolean }

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
    if (!DB_PATH) return [];
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require("better-sqlite3");
        const db = new Database(DB_PATH, { readonly: true });
        const rows = db.prepare("SELECT id, hostname, ip, port, model, last_seen FROM machines").all();
        db.close();
        return rows as { id: string; hostname: string; ip: string; port: number; model: string }[];
    } catch {
        return [];
    }
}

async function scanSubnet(localIP: string, port: number): Promise<{ ip: string; port: number }[]> {
    // Scan common IPs on the same subnet for Claude Dashboard instances
    const base = localIP.split(".").slice(0, 3).join(".");
    const candidates: { ip: string; port: number }[] = [];

    // Scan .1 to .254 in parallel with tight timeout
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

async function pingMachine(ip: string, port: number): Promise<{ online: boolean; hostname?: string; model?: string }> {
    try {
        const res = await fetch(`http://${ip}:${port}/api/claude/lan`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return { online: false };
        const data = await res.json();
        return { online: true, hostname: data.hostname || ip, model: data.model };
    } catch {
        return { online: false };
    }
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const autoDiscover = url.searchParams.get("discover") === "1";

    const localPort = parseInt(process.env.PORT || "3000", 10);

    // Always include local machine
    const machines: MachineInfo[] = [{
        id: LOCAL_MACHINE_ID,
        hostname: THIS_HOSTNAME,
        ip: "127.0.0.1",
        port: localPort,
        model: os.cpus()[0]?.model || "Unknown",
        online: true,
        isLocal: true,
    }];

    // Multi-machine only in admin mode
    const isAdmin = (process.env.MODE || "").replace(/"/g, "").trim() === "admin";
    if (!isAdmin) return NextResponse.json({ machines });

    // Collect remote machines from all sources
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

    // Deduplicate by ip:port
    const seen = new Set<string>();
    const unique = allRemotes.filter(m => {
        const key = `${m.ip}:${m.port}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Ping in parallel
    const remoteResults = await Promise.all(
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

    machines.push(...remoteResults.filter(m => m.online));

    return NextResponse.json({ machines });
}
