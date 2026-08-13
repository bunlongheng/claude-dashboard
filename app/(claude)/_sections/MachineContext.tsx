"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { MACHINE_COLOR_PALETTE } from "./shared";

export type MachineInfo = { id: string; hostname: string; ip: string; port: number; model: string; online: boolean; isLocal: boolean };
type MachineCtx = {
    machine: string | null;
    setMachine: (v: string | null) => void;
    machines: MachineInfo[];
    machineColors: Record<string, string>;
    apiBase: (path: string) => string;
};
const Ctx = createContext<MachineCtx>({ machine: null, setMachine: () => {}, machines: [], machineColors: {}, apiBase: (p) => p });

export function MachineProvider({ children }: { children: ReactNode }) {
    const [machine, setMachine] = useState<string | null>(null);
    const [machines, setMachines] = useState<MachineInfo[]>([]);
    const [machineColors, setMachineColors] = useState<Record<string, string>>({});

    useEffect(() => {
        fetch("/api/claude/machines")
            .then(r => r.json())
            .then(d => {
                const list: MachineInfo[] = d.machines ?? [];
                setMachines(list);
                // Default to local machine
                const local = list.find(m => m.isLocal);
                if (local) setMachine(prev => prev ?? local.id);
                // Assign colors dynamically
                const colors: Record<string, string> = {};
                list.forEach((m, i) => {
                    colors[m.id] = m.isLocal ? "#f97316" : MACHINE_COLOR_PALETTE[i % MACHINE_COLOR_PALETTE.length];
                });
                setMachineColors(colors);
            })
            .catch(() => {});
    }, []);

    // Build the API base for the selected machine. Local = same origin (return the
    // path as-is). For a remote machine, dashboard data routes go through the
    // same-origin /api/proxy forwarder (avoids cross-origin/CORS); anything else
    // hits the peer directly.
    const apiBase = useCallback((path: string): string => {
        const selected = machines.find(m => m.id === machine);
        if (!selected || selected.isLocal) return path;
        if (path.startsWith("/api/claude/") || path.startsWith("/api/rag/")) {
            return `/api/proxy?machine=${encodeURIComponent(selected.id)}&path=${encodeURIComponent(path)}`;
        }
        return `http://${selected.ip}:${selected.port}${path}`;
    }, [machine, machines]);

    return <Ctx.Provider value={{ machine, setMachine, machines, machineColors, apiBase }}>{children}</Ctx.Provider>;
}

export function useMachine() { return useContext(Ctx); }
