"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { MACHINE_COLOR_PALETTE } from "./shared";

export type MachineInfo = { id: string; hostname: string; ip: string; port: number; model: string; online: boolean; isLocal: boolean };
type MachineCtx = {
    machine: string | null;
    setMachine: (v: string | null) => void;
    machines: MachineInfo[];
    machineColors: Record<string, string>;
};
const Ctx = createContext<MachineCtx>({ machine: null, setMachine: () => {}, machines: [], machineColors: {} });

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
                // Assign colors dynamically
                const colors: Record<string, string> = {};
                list.forEach((m, i) => {
                    colors[m.id] = m.isLocal ? "#f97316" : MACHINE_COLOR_PALETTE[i % MACHINE_COLOR_PALETTE.length];
                });
                setMachineColors(colors);
            })
            .catch(() => {});
    }, []);

    return <Ctx.Provider value={{ machine, setMachine, machines, machineColors }}>{children}</Ctx.Provider>;
}

export function useMachine() { return useContext(Ctx); }
