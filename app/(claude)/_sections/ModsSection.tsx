"use client";

import { useQuery } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { useMachine } from "./MachineContext";
import { fetchJson, FetchError } from "./shared";
import type { ModInfo } from "@/lib/mods";

const STATUS_COLORS: Record<ModInfo["status"], string> = { enabled: "#22c55e", disabled: "#6b7280", dev: "#f97316" };

// Mods change Claude Code itself (panes, status lines, toasts, hooks). Installed
// ones are plugins with a TS hooks module; dev ones are still being built.
export default function ModsSection() {
    const { apiBase } = useMachine();
    const url = apiBase("/api/claude/mods");
    const q = useQuery<{ mods: ModInfo[] }>({ queryKey: ["mods", url], queryFn: () => fetchJson<{ mods: ModInfo[] }>(url) });

    if (q.isLoading) return <p className="text-white/30 text-center py-16">Scanning mods...</p>;
    if (q.isError) return <FetchError what="mods" onRetry={() => q.refetch()} />;
    const mods = q.data?.mods ?? [];
    if (!mods.length) return <p className="text-white/40 text-center py-16 text-[12px]">No mods installed yet.</p>;

    return (
        <div className="grid gap-2">
            {mods.map(m => (
                <div key={m.id + m.path} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <Wand2 size={16} style={{ color: STATUS_COLORS[m.status], flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-white/85">{m.name}</span>
                            {m.version && <span className="text-[10px] text-white/35">v{m.version}</span>}
                        </div>
                        <div className="text-[11px] text-white/45 truncate">{m.description || m.path}</div>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ color: STATUS_COLORS[m.status], background: `${STATUS_COLORS[m.status]}18`, border: `1px solid ${STATUS_COLORS[m.status]}40` }}>
                        {m.status}
                    </span>
                </div>
            ))}
        </div>
    );
}
