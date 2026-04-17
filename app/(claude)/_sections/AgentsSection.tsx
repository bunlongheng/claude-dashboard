"use client";

import { useState, useEffect } from "react";
import { XMarkIcon, CurrencyDollarIcon } from "@heroicons/react/24/outline";
import { AGENTS, AGENT_DETAILS, STATUS_COLORS, hexToRgba } from "./shared";

function AgentModal({ agent, onClose }: {
    agent: typeof AGENTS[number];
    onClose: () => void;
}) {
    const detail = AGENT_DETAILS[agent.name];
    const [copied, setCopied] = useState(false);
    const statusColor = STATUS_COLORS[agent.status as keyof typeof STATUS_COLORS];

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const copyPrompt = () => {
        navigator.clipboard.writeText(detail.iconPrompt).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0b0b0b] border-t-4"
                style={{ borderTopColor: agent.color }}
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 pb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 shrink-0" style={{ borderColor: agent.color + "66" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/ai/agents/${agent.id}.png`} alt={agent.name} className="w-full h-full object-cover scale-110" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tight" style={{ color: agent.color }}>{agent.name.toUpperCase()}</h2>
                            <p className="text-xs text-white/50">{agent.role}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose}
                        className="w-8 h-8 rounded-lg border border-white/15 text-white/50 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 pb-4">
                    <p className="text-sm text-white/70 leading-relaxed">{detail.description}</p>
                </div>

                <div className="px-6 pb-4">
                    <h3 className="text-[10px] font-black tracking-[0.16em] text-white/40 mb-2">CAPABILITIES</h3>
                    <div className="flex flex-wrap gap-2">
                        {detail.responsibilities.map((cap, i) => (
                            <span key={i} className="px-2.5 py-1 rounded-md text-[11px] font-semibold border"
                                style={{ borderColor: agent.color + "4d", backgroundColor: agent.color + "14", color: agent.color }}>
                                {cap}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="mx-6 border-t border-white/8" />

                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-black tracking-[0.16em] text-white/40">ICON PROMPT</h3>
                        <button type="button" onClick={copyPrompt}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all"
                            style={{
                                borderColor: copied ? "rgba(34,197,94,0.4)" : agent.color + "4d",
                                backgroundColor: copied ? "rgba(34,197,94,0.1)" : agent.color + "14",
                                color: copied ? "#22c55e" : agent.color,
                            }}>
                            <CurrencyDollarIcon className="w-3 h-3" />
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <p className="text-xs text-white/55 leading-relaxed bg-white/[0.03] border border-white/8 rounded-lg p-3">{detail.iconPrompt}</p>
                </div>

                <div className="mx-6 border-t border-white/8" />

                <div className="px-6 py-4 pb-6">
                    <h3 className="text-[10px] font-black tracking-[0.16em] text-white/40 mb-2">STATUS</h3>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
                        <span className="text-sm font-bold capitalize" style={{ color: statusColor }}>{agent.status}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AgentsSection() {
    const [selectedAgent, setSelectedAgent] = useState<typeof AGENTS[number] | null>(null);

    return (
        <section className="flex flex-col items-center select-none">
            {selectedAgent && <AgentModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}

            {/* SNOW - Supreme Commander */}
            {(() => {
                const snow = AGENTS[0];
                return (
                    <button type="button" onClick={() => setSelectedAgent(snow)}
                        className="w-52 bg-[#0f1117] rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 ring-1 ring-white/20"
                        style={{ border: "1px solid rgba(255,255,255,0.28)", boxShadow: "0 0 48px -12px rgba(255,255,255,0.18)" }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 56px -8px rgba(255,255,255,0.32)"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 48px -12px rgba(255,255,255,0.18)"; }}>
                        <div className="flex justify-center pt-5">
                            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/30">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/ai/agents/1.png" alt="Snow" className="w-full h-full object-cover scale-110" />
                            </div>
                        </div>
                        <div className="py-3 text-center">
                            <p className="text-sm font-black tracking-widest text-white">SNOW</p>
                            <p className="text-[10px] text-white/50 mt-0.5">Supreme Commander</p>
                            <p className="text-[9px] text-white/30 mt-0.5">Orchestrator</p>
                            <div className="flex items-center justify-center gap-1 mt-2.5 mb-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                <span className="text-[9px] text-white/45">Online</span>
                            </div>
                        </div>
                    </button>
                );
            })()}

            {/* Vertical stem from SNOW */}
            <div className="w-px h-7 bg-white/15" />

            {/* Horizontal bar + sub-agent stems */}
            <div className="relative w-full flex flex-col items-center">
                <div className="relative w-full h-px bg-white/10 mb-0">
                    <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rounded-full bg-white/20" />
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2 w-full mt-0">
                    {AGENTS.slice(1).map(agent => {
                        const { id, name, role, color, status } = agent;
                        return (
                            <div key={id} className="flex flex-col items-center">
                                <div className="w-px h-6" style={{ backgroundColor: hexToRgba(color, 0.3) }} />
                                <div className="w-1.5 h-1.5 rounded-full mb-1.5" style={{ backgroundColor: hexToRgba(color, 0.5) }} />
                                <button type="button" onClick={() => setSelectedAgent(agent)}
                                    className="w-full bg-[#0f1117] rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                                    style={{ border: `1px solid ${hexToRgba(color, 0.2)}` }}
                                    onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 20px -6px ${hexToRgba(color, 0.4)}`; }}
                                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}>
                                    <div className="flex justify-center pt-3">
                                        <div className="w-11 h-11 rounded-full overflow-hidden border" style={{ borderColor: hexToRgba(color, 0.35) }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={`/ai/agents/${id}.png`} alt={name} className="w-full h-full object-cover scale-110" />
                                        </div>
                                    </div>
                                    <div className="p-2 text-center">
                                        <p className="text-[10px] font-black tracking-tight" style={{ color }}>{name.toUpperCase()}</p>
                                        <p className="text-[8px] text-white/35 mt-0.5 truncate">{role}</p>
                                        <div className="flex items-center justify-center gap-1 mt-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }} />
                                            <span className="text-[8px] text-white/40 capitalize">{status}</span>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
